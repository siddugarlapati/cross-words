/**
 * AutoCross-Edu — Vercel Serverless Function: POST /api/generate
 *
 * Runs the full Gemini crossword-generation pipeline server-side using @google/generative-ai SDK.
 * All GEMINI_API_KEY environment variables are strictly handled server-side.
 *
 * Features:
 *   - GeminiKeyPool: Server-side rate-limit-aware key selection, cooldowns & retries
 *   - @google/generative-ai SDK integration with supported models (gemini-flash-latest, gemini-pro-latest)
 *   - Supabase-backed 24h result cache (keyed on topic + questionsCount)
 *   - Zero hardcoded domain terms: Schema placeholders (<TOPIC-SPECIFIC-TERM>, <ACCURATE-CLUE-FOR-TERM>)
 *   - Clean user-facing error responses & structured request logs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { generateLayout } from './_layoutGenerator.js';
import type { CrosswordGenerationResult } from './_types.js';

// ─── Environment & Clients ───────────────────────────────────────────────────

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

// Centralized Supported Models
const PRIMARY_TEXT_MODEL  = process.env.GEMINI_TEXT_MODEL ?? 'gemini-flash-latest';
const FALLBACK_TEXT_MODEL = 'gemini-pro-latest';
const SUPPORTED_MODELS    = [PRIMARY_TEXT_MODEL, FALLBACK_TEXT_MODEL];

const MAX_CONCURRENT  = 10;
const CACHE_TTL_HOURS = 24;
const REQUEST_TIMEOUT = 55_000;

let activeRequests = 0;

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ─── Key Pool & Rate-Limit Manager ───────────────────────────────────────────

interface KeyState {
  key: string;
  cooldownUntil: number;
}

class GeminiKeyPool {
  private keys: KeyState[] = [];
  private rrIndex = 0;

  constructor() {
    this.refreshKeys();
  }

  public refreshKeys(): void {
    const envKeys = [
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
      process.env.GEMINI_API_KEY_5,
      process.env.GEMINI_API_KEYS,
      process.env.GEMINI_API_KEY,
    ];
    const rawKeys: string[] = [];
    for (const entry of envKeys) {
      if (!entry) continue;
      entry.split(',').forEach(k => {
        const trimmed = k.trim();
        if (trimmed && !trimmed.startsWith('VITE_')) rawKeys.push(trimmed);
      });
    }

    const uniqueKeys = Array.from(new Set(rawKeys));
    this.keys = uniqueKeys.map(key => ({ key, cooldownUntil: 0 }));
  }

  public getAvailableKey(): string {
    this.refreshKeys();
    if (this.keys.length === 0) {
      throw new Error('GEMINI_API_KEY is missing from server configuration.');
    }
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.rrIndex + i) % this.keys.length;
      const k = this.keys[idx];
      if (k.cooldownUntil <= now) {
        this.rrIndex = (idx + 1) % this.keys.length;
        return k.key;
      }
    }
    // If all keys are in cooldown, pick the one expiring earliest
    const sorted = [...this.keys].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
    return sorted[0].key;
  }

  public markCooldown(key: string, durationMs = 60_000): void {
    const target = this.keys.find(k => k.key === key);
    if (target) {
      target.cooldownUntil = Date.now() + durationMs;
      console.warn(`[KeyPool] Cooldown applied to key ending in ...${key.slice(-4)} for ${durationMs}ms`);
    }
  }

  public get hasKeys(): boolean {
    return this.keys.length > 0;
  }
}

const keyPool = new GeminiKeyPool();

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

// ─── Gemini SDK Call with Key Pool & Retries ───────────────────────────────────

async function callSDK(
  parts: (string | { inlineData: { data: string; mimeType: string } })[],
  requestId: string,
  attempt = 0
): Promise<string> {
  const activeKey = keyPool.getAvailableKey();
  const genAI = new GoogleGenerativeAI(activeKey);
  const activeModelName = SUPPORTED_MODELS[attempt % SUPPORTED_MODELS.length];

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
    const msg = err?.message || '';
    const isQuotaOrAuth = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('403') || msg.includes('401') || msg.includes('quota') || msg.includes('PERMISSION_DENIED');
    if (isQuotaOrAuth) {
      keyPool.markCooldown(activeKey, 60_000);
    }
    if (attempt < 3) {
      const delay = Math.floor(1000 * 1.5 ** attempt + Math.random() * 500);
      console.warn(`[${requestId}] SDK model ${activeModelName} call failed (${msg}). Attempt ${attempt + 1}, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return callSDK(parts, requestId, attempt + 1);
    }
    throw err;
  }
}

// ─── Domain-Agnostic Generation Pipeline ───────────────────────────────────────

async function generateCrosswordFast(
  topic: string,
  content: string,
  numQuestions: number,
  fileData?: { data: string; mimeType: string },
  requestId = ''
): Promise<{ word: string; clue: string }[]> {
  const parts: any[] = [
    `You are an expert university curriculum generator. Generate a high-quality educational crossword puzzle for university students studying "${topic}".\n\n` +
    `Requirements:\n` +
    `1. Generate exactly ${numQuestions + 5} concrete concept & clue pairs.\n` +
    `2. "word": 3–15 uppercase letters only (A-Z, no spaces/hyphens/numbers). Must be a concrete, specific technical or academic term directly related to "${topic}". No generic placeholder words.\n` +
    `3. "clue": 10–120 characters, academic definition/question. Must NEVER reveal or contain the word itself or any stem of it.\n\n` +
    `Return ONLY raw JSON array of objects following this exact schema format:\n` +
    `[{"word":"<TOPIC-SPECIFIC-TERM>","clue":"<ACCURATE-CLUE-FOR-TERM>"}]`
  ];
  if (fileData) {
    const b64 = fileData.data.split(',');
    parts.push({ inlineData: { data: b64.length > 1 ? b64[1] : b64[0], mimeType: fileData.mimeType } });
  } else if (content) {
    parts.push(`\nStudy Materials:\n${content.substring(0, 3000)}`);
  }

  const text = await callSDK(parts, requestId);
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
  requestId = ''
): Promise<CrosswordGenerationResult> {
  console.log(`[${requestId}] Running domain-agnostic generation pipeline for topic "${topic}"`);
  const candidates = await generateCrosswordFast(topic, content, numQuestions, fileData, requestId);

  if (candidates.length < Math.min(numQuestions, 3)) {
    throw new Error(`Could not generate enough valid terms for "${topic}". Try a more specific topic or upload study material.`);
  }

  console.log(`[${requestId}] Generating grid layout for ${candidates.length} candidate terms`);
  const placed = generateLayout(candidates, numQuestions);
  if (placed.length < Math.min(numQuestions, 3)) {
    throw new Error(`Could only place ${placed.length}/${numQuestions} words in the grid. Try a different topic or word count.`);
  }

  return {
    title: topic,
    subject: topic,
    questions: placed,
    generationLogs: {
      topic,
      rawResponses: [],
      filteredConcepts: candidates.map(c => c.word),
      rejectedConcepts: [],
      finalConcepts: candidates,
    },
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

  const { topic, content = '', questionsCount = 10, fileData } = req.body ?? {};

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
      runPipeline(cleanTopic, content, questionsCount, fileData ?? undefined, requestId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Generation timed out after 55s')), REQUEST_TIMEOUT)),
    ]);
  } catch (err: any) {
    activeRequests--;
    const msg: string = err?.message ?? 'Unknown error';
    const latencyMs   = Date.now() - startMs;

    const isAuth    = msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('missing');
    const isQuota   = msg.includes('429') || msg.includes('503') || msg.includes('502') || msg.includes('504') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('UNAVAILABLE');
    const isTimeout = msg.includes('timed out');

    console.error(JSON.stringify({ requestId, topic: cleanTopic, count: questionsCount, cacheHit: false, latencyMs, status: 'error', errorCode: isAuth ? 'AUTH' : isQuota ? 'QUOTA' : isTimeout ? 'TIMEOUT' : 'PIPELINE', model: PRIMARY_TEXT_MODEL }));

    if (isAuth)    return res.status(500).json({ error: 'AUTH_ERROR',    message: 'AI service configuration error. Please check Gemini API key settings.' });
    if (isQuota)   return res.status(503).json({ error: 'QUOTA_EXCEEDED', message: 'The AI service is experiencing high traffic. Please retry in a few seconds.' });
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
