/**
 * AutoCross-Edu — Vercel Serverless Function: POST /api/generate
 *
 * Runs the full Gemini crossword-generation pipeline server-side using @google/generative-ai SDK.
 * The GEMINI_API_KEY env var is never exposed to the browser.
 *
 * Features:
 *   - @google/generative-ai SDK integration
 *   - Supabase-backed 24 h result cache (keyed on topic + questionsCount)
 *   - Concurrency gate: max 10 simultaneous Gemini calls per cold-start instance
 *   - SDK model fallback & jittered exponential backoff
 *   - Structured request logs (no keys, no PII)
 *   - Clean user-facing error responses
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { generateLayout } from './_layoutGenerator';
import type { CrosswordGenerationResult } from './_types';

// ─── Configuration ─────────────────────────────────────────────────────────────

const GEMINI_API_KEY        = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY ?? '';
const SUPABASE_URL          = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

// Primary & fallback text models (matched to key capabilities)
const PRIMARY_TEXT_MODEL   = process.env.GEMINI_TEXT_MODEL      ?? 'gemini-flash-latest';
const FALLBACK_TEXT_MODELS  = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro-latest'];
const EMBEDDING_MODEL      = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001';

const MAX_CONCURRENT    = 10;   // simultaneous Gemini calls per instance
const CACHE_TTL_HOURS   = 24;
const SIMILARITY_THRESH = 0.55;
const REQUEST_TIMEOUT   = 55_000; // ms — Vercel functions max 60s

let activeRequests = 0;

// ─── Clients ───────────────────────────────────────────────────────────────────

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function getGenAIClient(customKey?: string): GoogleGenerativeAI {
  const key = customKey?.trim() || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is missing');
  return new GoogleGenerativeAI(key);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function cacheKey(topic: string, count: number): string {
  return crypto
    .createHash('sha256')
    .update(`${topic.trim().toUpperCase()}::${count}`)
    .digest('hex')
    .slice(0, 32);
}

function parseJSON(text: string): any {
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(clean); } catch {
    const match = clean.match(/\[[\s\S]*\]/) || clean.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return [];
  }
}

function cosineSim(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < v1.length; i++) { dot += v1[i]*v2[i]; n1 += v1[i]**2; n2 += v2[i]**2; }
  return n1 === 0 || n2 === 0 ? 0 : dot / (Math.sqrt(n1) * Math.sqrt(n2));
}

const STOP_WORDS = new Set([
  'THE','AND','THAT','HAVE','FOR','NOT','WITH','YOU','THIS','BUT','HIS','FROM','THEY',
  'SAY','HER','SHE','OR','AN','WILL','MY','ONE','ALL','WOULD','THERE','THEIR','WHAT',
  'SO','UP','OUT','IF','ABOUT','WHO','GET','WHICH','GO','ME','WHEN','MAKE','CAN',
  'LIKE','TIME','NO','JUST','HIM','KNOW','TAKE','PEOPLE','INTO','YEAR','YOUR','SOME',
  'COULD','THEM','SEE','OTHER','THAN','THEN','NOW','LOOK','ONLY','COME','ITS','OVER',
  'THINK','ALSO','BACK','AFTER','USE','TWO','HOW','OUR','WORK','FIRST','WELL','WAY',
  'EVEN','NEW','WANT','BECAUSE','ANY','THESE','GIVE','DAY','MOST','US',
]);

const GENERIC_WORDS = new Set([
  'ANALYSIS','SYSTEM','METHOD','CONCEPT','THEORY','COMPONENT','PROCESS','APPROACH',
  'TECHNIQUE','MECHANISM','STRUCTURE','FUNCTION','ELEMENT','FACTOR','ASPECT','FEATURE',
  'PROPERTY','ATTRIBUTE','PARAMETER','DEFINITION','EXAMPLE','OVERVIEW','SUMMARY',
  'INTRODUCTION','CONCLUSION','SECTION','CHAPTER','TOPIC','SUBJECT','STUDY','RESEARCH',
  'REVIEW','MODEL','FRAMEWORK','PATTERN','PRINCIPLE','STRATEGY','SOLUTION','RESULT',
  'OUTPUT','INPUT','OBJECT','CLASS','MODULE','PACKAGE','OPERATION','PROCEDURE',
  'PROGRAM','APPLICATION','SOFTWARE','HARDWARE','IMPLEMENTATION','DESIGN','ARCHITECTURE',
  'INTERFACE','PROTOCOL','PERFORMANCE','EFFICIENCY','ACCURACY','QUALITY','STANDARD',
  'LEVEL','BASIC','SIMPLE','GENERAL','COMMON','NORMAL','TYPICAL','RELATED',
  'INFORMATION','KNOWLEDGE','UNDERSTANDING','LEARNING','TEACHING',
]);

function isClean(word: string): boolean {
  return !STOP_WORDS.has(word) && !GENERIC_WORDS.has(word) && word.length >= 3 && word.length <= 15;
}

// ─── Gemini SDK wrapper with model fallback & retry ───────────────────────────

async function callSDK(
  parts: (string | { inlineData: { data: string; mimeType: string } })[],
  requestId: string,
  customKey?: string,
  attempt = 0
): Promise<string> {
  const genAI = getGenAIClient(customKey);
  const modelsToTry = Array.from(new Set([PRIMARY_TEXT_MODEL, ...FALLBACK_TEXT_MODELS]));
  const activeModelName = modelsToTry[attempt % modelsToTry.length];

  const model = genAI.getGenerativeModel({
    model: activeModelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  try {
    const result = await model.generateContent(parts);
    const text = result.response.text();
    if (!text) throw new Error(`Empty response from SDK model ${activeModelName}`);
    return text;
  } catch (err: any) {
    if (attempt < 4) {
      const delay = Math.floor(1200 * 1.5 ** attempt + Math.random() * 500);
      console.warn(`[${requestId}] SDK model ${activeModelName} call failed (${err?.message}). Attempt ${attempt + 1}, trying next model in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return callSDK(parts, requestId, customKey, attempt + 1);
    }
    throw err;
  }
}

async function fetchEmbeddingsSDK(texts: string[], requestId = '', customKey?: string): Promise<number[][] | null> {
  try {
    const genAI = getGenAIClient(customKey);
    const embedModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const results = await Promise.all(
      texts.map(text => embedModel.embedContent(text))
    );
    return results.map(res => res.embedding.values);
  } catch (err: any) {
    console.warn(`[${requestId}] Embedding SDK failed, skipping similarity filter:`, err?.message);
    return null;
  }
}

// ─── Pipeline stages ───────────────────────────────────────────────────────────

interface TopicUnderstanding { domain: string; subtopics: string[]; context: string; exampleTerms: string[]; }

async function understandTopic(topic: string, content: string, fileData?: { data: string; mimeType: string }, requestId = '', customKey?: string): Promise<TopicUnderstanding> {
  const parts: any[] = [
    `Analyze the academic topic "${topic}" for a university crossword puzzle.\n` +
    `Return ONLY raw JSON with:\n` +
    `- "domain": specific academic field\n` +
    `- "subtopics": core subtopics specific to this topic (array of strings)\n` +
    `- "context": 1-sentence academic description for university students\n` +
    `- "exampleTerms": 8-10 CONCRETE technical terms a student studying "${topic}" would encounter\n` +
    `{"domain":"","subtopics":[],"context":"","exampleTerms":[]}`
  ];
  if (fileData) {
    const b64 = fileData.data.split(',');
    parts.push({ inlineData: { data: b64.length > 1 ? b64[1] : b64[0], mimeType: fileData.mimeType } });
  } else if (content) {
    parts.push(`\nStudy Materials:\n${content.substring(0, 4000)}`);
  }

  const text = await callSDK(parts, requestId, customKey);
  const p    = parseJSON(text);
  return {
    domain:       p.domain        || 'General Academic',
    subtopics:    Array.isArray(p.subtopics)    ? p.subtopics    : [topic],
    context:      p.context       || `Educational content for ${topic}`,
    exampleTerms: Array.isArray(p.exampleTerms) ? p.exampleTerms : [],
  };
}

async function generatePool(
  topic: string, content: string, u: TopicUnderstanding, count: number,
  exclude: string[], fileData?: { data: string; mimeType: string }, requestId = '', customKey?: string
): Promise<{ word: string; category: string }[]> {
  const examples = u.exampleTerms.length ? `\nSeed examples of VALID terms: ${u.exampleTerms.join(', ')}` : '';
  const excl     = exclude.length ? `\nExclude already-used words: ${exclude.join(', ')}` : '';
  const parts: any[] = [
    `You are a university curriculum expert. Generate concepts for a crossword on "${topic}" (${u.domain}).\n\n` +
    `RULES — a word is VALID only if ALL are true:\n` +
    `1. Named concept, term, algorithm, or component SPECIFIC to "${topic}".\n` +
    `2. A NOUN (not a verb, adjective, or generic placeholder).\n` +
    `3. NOT a generic academic word (ANALYSIS, SYSTEM, METHOD, THEORY, MODEL, DESIGN, etc.).\n` +
    `4. 3–15 uppercase letters only (A-Z, no spaces/hyphens/numbers).\n` +
    `${examples}${excl}\n\n` +
    `Generate ${Math.ceil(count * 2.5)} concepts total. Mark each as "valid": true or false.\n` +
    `Return ONLY raw JSON array:\n[{"word":"KERNEL","category":"OS component","valid":true}, ...]`
  ];
  if (fileData) { const b64 = fileData.data.split(','); parts.push({ inlineData: { data: b64.length > 1 ? b64[1] : b64[0], mimeType: fileData.mimeType } }); }
  else if (content) { parts.push(`\nStudy Materials:\n${content.substring(0, 4000)}`); }

  const text = await callSDK(parts, requestId, customKey);
  const list: any[] = Array.isArray(parseJSON(text)) ? parseJSON(text) : [];
  return list
    .filter(i => i.valid !== false)
    .map(i => ({ word: (i.word || '').toUpperCase().replace(/[^A-Z]/g, ''), category: i.category || 'General' }))
    .filter(i => isClean(i.word));
}

async function generateClues(words: string[], topic: string, u: TopicUnderstanding, requestId = '', customKey?: string): Promise<{ word: string; clue: string }[]> {
  const parts = [
    `Create crossword clues for "${topic}" (${u.domain}).\n\n` +
    `Words: ${words.join(', ')}\n\n` +
    `Rules:\n1. Clue must be 10–120 characters.\n` +
    `2. Clue must NOT contain the word itself or any stem.\n` +
    `3. Clue must be academically accurate for "${topic}".\n` +
    `4. Define what the word IS, not just its category.\n\n` +
    `Return ONLY raw JSON:\n[{"word":"KERNEL","clue":"Core of an OS that manages hardware resources and system calls"}, ...]`
  ];
  const text = await callSDK(parts, requestId, customKey);
  const list: any[] = Array.isArray(parseJSON(text)) ? parseJSON(text) : [];
  return list.map(i => ({ word: (i.word || '').toUpperCase().replace(/[^A-Z]/g, ''), clue: (i.clue || '').trim() }));
}

async function generateCrosswordFast(
  topic: string,
  content: string,
  numQuestions: number,
  fileData?: { data: string; mimeType: string },
  requestId = '',
  customKey?: string
): Promise<{ word: string; clue: string }[]> {
  const parts: any[] = [
    `You are a university curriculum expert. Generate a high-quality educational crossword puzzle for university students on "${topic}".\n\n` +
    `Requirements:\n` +
    `1. Generate exactly ${numQuestions + 5} concrete concept & clue pairs.\n` +
    `2. "word": 3–15 uppercase letters only (A-Z, no spaces/hyphens/numbers). Must be a concrete, specific term in "${topic}". No generic placeholder words.\n` +
    `3. "clue": 10–120 characters, academic definition/question. Must NEVER reveal or contain the word itself.\n\n` +
    `Return ONLY raw JSON array of objects:\n` +
    `[{"word":"KERNEL","clue":"Core operating system component managing hardware and system calls."}]`
  ];
  if (fileData) {
    const b64 = fileData.data.split(',');
    parts.push({ inlineData: { data: b64.length > 1 ? b64[1] : b64[0], mimeType: fileData.mimeType } });
  } else if (content) {
    parts.push(`\nStudy Materials:\n${content.substring(0, 3000)}`);
  }

  const text = await callSDK(parts, requestId, customKey);
  const list: any[] = Array.isArray(parseJSON(text)) ? parseJSON(text) : [];
  const validPairs: { word: string; clue: string }[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const w = (item.word || '').toUpperCase().replace(/[^A-Z]/g, '');
    const c = (item.clue || '').trim();
    if (!w || w.length < 3 || w.length > 15 || seen.has(w)) continue;
    if (!isClean(w)) continue;
    if (!c || c.length < 10 || c.length > 120) continue;
    const esc = w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    if (new RegExp(`\\b${esc}\\w*\\b`, 'i').test(c)) continue;

    seen.add(w);
    validPairs.push({ word: w, clue: c });
  }

  return validPairs;
}

async function runPipeline(
  topic: string,
  content: string,
  numQuestions: number,
  fileData?: { data: string; mimeType: string },
  requestId = '',
  customKey?: string
): Promise<CrosswordGenerationResult> {
  console.log(`[${requestId}] Running fast single-pass generation pipeline for topic "${topic}"`);
  const candidates = await generateCrosswordFast(topic, content, numQuestions, fileData, requestId, customKey);

  if (candidates.length < Math.min(numQuestions, 3)) {
    throw new Error(`Could not generate enough valid terms for "${topic}". Try a more specific topic or upload study material.`);
  }

  console.log(`[${requestId}] Layout generation`);
  const placed = generateLayout(candidates, numQuestions);
  if (placed.length < Math.min(numQuestions, 3)) {
    throw new Error(`Could only place ${placed.length}/${numQuestions} words in the grid. Try a different topic or word count.`);
  }

  return {
    title: topic,
    subject: topic,
    questions: placed,
    generationLogs: { topic, rawResponses: [], filteredConcepts: candidates.map(c => c.word), rejectedConcepts: [], finalConcepts: candidates },
  };
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

async function checkCache(key: string): Promise<CrosswordGenerationResult | null> {
  if (!supabase) return null;
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('crossword_cache')
      .select('result_json')
      .eq('cache_key', key)
      .gte('created_at', cutoff)
      .single();
    return data?.result_json ?? null;
  } catch { return null; }
}

async function writeCache(key: string, result: CrosswordGenerationResult): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('crossword_cache').upsert({ cache_key: key, result_json: result });
  } catch (err) { console.warn('Cache write failed:', err); }
}

// ─── Vercel handler ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const requestId = crypto.randomUUID().slice(0, 8);
  const startMs   = Date.now();

  // Concurrency gate
  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(503).json({
      error: 'SERVICE_BUSY',
      message: 'Generation service is at capacity. Please try again in a few seconds.',
    });
  }

  const headerKey = req.headers ? (req.headers['x-gemini-api-key'] as string) : undefined;
  const { topic, content = '', questionsCount = 10, fileData, apiKey: bodyKey } = req.body ?? {};
  const customKey = headerKey || bodyKey;

  const activeKey = customKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || GEMINI_API_KEY;
  if (!activeKey) {
    return res.status(500).json({
      error: 'CONFIG_ERROR',
      message: 'Generation service API key is missing. Contact administrator.',
    });
  }

  if (!topic || typeof topic !== 'string' || topic.trim().length < 2)
    return res.status(400).json({ error: 'INVALID_TOPIC', message: 'Please provide a valid topic name.' });
  if (questionsCount < 3 || questionsCount > 30)
    return res.status(400).json({ error: 'INVALID_COUNT', message: 'Questions count must be between 3 and 30.' });

  const cleanTopic = topic.trim();
  const key        = cacheKey(cleanTopic, questionsCount);

  // Cache hit?
  const cached = await checkCache(key);
  if (cached) {
    console.log(JSON.stringify({ requestId, topic: cleanTopic, count: questionsCount, cacheHit: true, latencyMs: Date.now() - startMs, status: 'ok' }));
    return res.status(200).json(cached);
  }

  activeRequests++;
  let result: CrosswordGenerationResult;

  try {
    result = await Promise.race<CrosswordGenerationResult>([
      runPipeline(cleanTopic, content, questionsCount, fileData ?? undefined, requestId, customKey),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Generation timed out after 55s')), REQUEST_TIMEOUT)),
    ]);
  } catch (err: any) {
    activeRequests--;
    const msg: string = err?.message ?? 'Unknown error';
    const latencyMs   = Date.now() - startMs;

    // Classify error for logging and response
    const isAuth    = msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('denied');
    const isQuota   = msg.includes('429') || msg.includes('503') || msg.includes('502') || msg.includes('504') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('overloaded') || msg.includes('UNAVAILABLE');
    const isTimeout = msg.includes('timed out');

    console.error(JSON.stringify({ requestId, topic: cleanTopic, count: questionsCount, cacheHit: false, latencyMs, status: 'error', errorCode: isAuth ? 'AUTH' : isQuota ? 'QUOTA' : isTimeout ? 'TIMEOUT' : 'PIPELINE', model: PRIMARY_TEXT_MODEL }));

    if (isAuth)    return res.status(500).json({ error: 'AUTH_ERROR',    message: 'AI service authentication failed. Please check your Gemini API key.' });
    if (isQuota)   return res.status(503).json({ error: 'QUOTA_EXCEEDED', message: 'The AI model is currently experiencing high demand. Please try again in a few moments.' });
    if (isTimeout) return res.status(504).json({ error: 'TIMEOUT',        message: 'Generation timed out. Try fewer questions or a more specific topic.' });
    return res.status(500).json({ error: 'PIPELINE_ERROR', message: msg });
  }

  activeRequests--;
  const latencyMs = Date.now() - startMs;

  await writeCache(key, result);

  console.log(JSON.stringify({
    requestId,
    topic: cleanTopic,
    count: questionsCount,
    cacheHit: false,
    latencyMs,
    wordCount: result.questions.length,
    model: PRIMARY_TEXT_MODEL,
    status: 'ok',
  }));

  return res.status(200).json(result);
}
