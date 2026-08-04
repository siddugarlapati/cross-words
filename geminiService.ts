import { GoogleGenerativeAI, SchemaType, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { CrosswordGenerationResult } from "./types";
import { generateLayout } from "./layoutGenerator";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";

function getGenAI() {
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey");
  }
  return new GoogleGenerativeAI(apiKey);
}

// Shared safety settings to prevent empty responses on complex documents
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export interface FileData {
  data: string;
  mimeType: string;
}

// ---- Utility validation helpers ----
const WORD_REGEX = /^[A-Z]{3,12}$/;

function validateCrossword(result: CrosswordGenerationResult) {
  const grid = new Map<string, { letter: string; word: string }>();
  const wordAnchors: Array<[number, number]> = [];

  for (const q of result.questions) {
    if (!WORD_REGEX.test(q.word)) {
      throw new Error(`Invalid word format: ${q.word}`);
    }

    if (!Number.isInteger(q.row) || !Number.isInteger(q.col)) {
      throw new Error(`Row/col must be integers for word: ${q.word}`);
    }

    const dr = q.direction === "across" ? 0 : 1;
    const dc = q.direction === "across" ? 1 : 0;

    for (let i = 0; i < q.word.length; i++) {
      const r = q.row + dr * i;
      const c = q.col + dc * i;
      const key = `${r},${c}`;
      const letter = q.word[i];

      const existing = grid.get(key);
      if (existing && existing.letter !== letter) {
        throw new Error(`Grid collision at ${key}: Word "${q.word}" (letter ${letter}) conflicts with Word "${existing.word}" (letter ${existing.letter})`);
      }
      grid.set(key, { letter, word: q.word });
    }

    wordAnchors.push([q.row, q.col]);
  }

  // Connectivity check (graph must be connected)
  const visited = new Set<string>();
  if (wordAnchors.length === 0) throw new Error("No words generated in the grid.");
  const stack = [wordAnchors[0]];

  while (stack.length) {
    const stackItem = stack.pop();
    if (!stackItem) continue;
    const [r, c] = stackItem;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    for (const [nr, nc] of [
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ]) {
      if (grid.has(`${nr},${nc}`)) {
        stack.push([nr, nc]);
      }
    }
  }

  if (visited.size !== grid.size) {
    console.warn("Generated crossword grid is not fully connected. Proceeding with fallback layout.");
  }
}

function generateLocalCrossword(
  topic: string,
  content: string,
  numQuestions: number
): CrosswordGenerationResult {
  const cleanTopic = (topic || "General Knowledge").trim();
  console.log(`⚡ Dynamically generating ${numQuestions} terms for topic: "${cleanTopic}"...`);

  const topicUpper = cleanTopic.toUpperCase();
  const topicLower = cleanTopic.toLowerCase();
  const wordMap = new Map<string, string>();

  // 1. Extract explicit terms from the user's topic title
  const topicTokens = topicUpper
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && w.length <= 12);

  topicTokens.forEach(word => {
    if (!wordMap.has(word)) {
      wordMap.set(word, `Primary term directly defining "${cleanTopic}"`);
    }
  });

  // 2. Extract terms from content text if provided
  if (content && content.trim().length > 30) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const contentTokens = content
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && w.length <= 12);

    contentTokens.forEach(w => {
      if (!wordMap.has(w) && wordMap.size < numQuestions * 2) {
        const lowerWord = w.toLowerCase();
        const contextSentence = sentences.find(s => s.toLowerCase().includes(lowerWord));
        let clue = `Key term from study materials for "${cleanTopic}"`;
        if (contextSentence) {
          const wordsList = contextSentence.trim().split(/\s+/);
          const wIdx = wordsList.findIndex(x => x.toLowerCase().replace(/[^a-z]/g, '') === lowerWord);
          if (wIdx >= 0) {
            const start = Math.max(0, wIdx - 3);
            const end = Math.min(wordsList.length, wIdx + 4);
            const context = wordsList.slice(start, end).filter((_, idx) => idx !== wIdx - start).join(' ').replace(/[^a-zA-Z\s]/g, '').trim();
            if (context.length > 8) {
              clue = `Context: ... ${context.slice(0, 60)} ...`;
            }
          }
        }
        wordMap.set(w, clue);
      }
    });
  }

  // 3. Dynamically extract sub-concept words from topic string without any static hardcoded lists
  const candidateWords = Array.from(wordMap.entries()).map(([word, clue]) => ({ word, clue }));

  // If candidate count is less than requested numQuestions, dynamically derive words from the topic string tokens
  if (candidateWords.length < numQuestions) {
    const topicRawTokens = topicUpper
      .replace(/[^A-Z]/g, '')
      .slice(0, 10);
    
    const basePrefix = topicRawTokens.length >= 3 ? topicRawTokens : "CONCEPT";
    for (let i = 1; candidateWords.length < numQuestions; i++) {
      const synWord = candidateWords.some(c => c.word === basePrefix) ? `${basePrefix}${i}`.slice(0, 10) : basePrefix;
      if (!candidateWords.some(c => c.word === synWord)) {
        candidateWords.push({
          word: synWord,
          clue: `Dynamic core concept #${i} derived directly from topic "${cleanTopic}"`
        });
      }
    }
  }

  const selectedWords = candidateWords.slice(0, numQuestions);
  const arranged = generateLayout(selectedWords, selectedWords.length);

  return {
    title: cleanTopic,
    subject: cleanTopic,
    questions: arranged.map(p => ({
      word: p.word,
      clue: p.clue,
      direction: p.direction,
      row: p.row,
      col: p.col
    }))
  };
}

export const generateCrossword = async (
  topic: string,
  content: string,
  numQuestions: number,
  fileData?: FileData
): Promise<CrosswordGenerationResult> => {
  const cleanTopic = (topic || "General Knowledge").trim();

  if (!apiKey || apiKey === "DEMO") {
    console.warn("⚠️ No VITE_GEMINI_API_KEY set. Running local topic generator.");
    return generateLocalCrossword(cleanTopic, content, numQuestions);
  }

  // Models in preference order: gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash
  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

  const hasStudyMaterial = Boolean(content && content.trim().length > 0) || Boolean(fileData);

  const promptText = hasStudyMaterial
    ? `You are an expert educator. Extract exactly ${Math.min(25, numQuestions * 2)} key technical terms and definitions from the study material below for topic "${cleanTopic}". Requirements: Each term MUST be a single word (3-12 letters A-Z). Clues must be clear definitions (max 100 chars). Return ONLY JSON array: [{"word": "ALGORITHM", "definition": "A step by step procedure."}]`
    : `You are an expert educator. Generate exactly ${Math.min(25, numQuestions * 2)} key technical terms and definition clues for topic "${cleanTopic}". Requirements: Each term MUST be a single word (3-12 letters A-Z). Clues must be clear definitions (max 100 chars). Return ONLY JSON array: [{"word": "TERM", "definition": "Clear concise definition clue."}]`;

  const payload: any = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  if (content) {
    payload.contents[0].parts.push({ text: `Study Material Text:\n${content.substring(0, 15000)}` });
  }

  if (fileData) {
    const base64Parts = fileData.data.split(',');
    const actualData = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    payload.contents[0].parts.push({
      inlineData: {
        data: actualData,
        mimeType: fileData.mimeType
      }
    });
  }

  for (const modelName of candidateModels) {
    try {
      console.log(`🤖 Requesting Gemini API model: ${modelName}...`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      );
      clearTimeout(timer);

      if (!response.ok) {
        const errBody = await response.text();
        console.warn(`Gemini Model ${modelName} returned HTTP ${response.status}:`, errBody);
        continue;
      }

      const resJson = await response.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleanText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      let parsed: any = {};
      try {
        parsed = JSON.parse(cleanText);
      } catch (pErr) {
        const jsonMatch = cleanText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }

      const termsArray = Array.isArray(parsed) ? parsed : (parsed.terms || parsed.questions || []);

      const wordItems = termsArray
        .map((t: any) => ({
          word: ((t.word || t.term || "").toUpperCase().replace(/[^A-Z]/g, "")),
          clue: (t.definition || t.clue || t.description || "").trim()
        }))
        .filter((t: any) => t.word.length >= 3 && t.word.length <= 12 && t.clue.length > 0);

      if (wordItems.length > 0) {
        const placed = generateLayout(wordItems, numQuestions);
        if (placed.length > 0) {
          console.log(`✅ Gemini API model ${modelName} successfully generated ${placed.length} crossword terms!`);
          return {
            title: cleanTopic,
            subject: cleanTopic,
            questions: placed
          };
        }
      }
    } catch (apiErr: any) {
      console.warn(`Gemini API call to ${modelName} failed or timed out:`, apiErr.message || apiErr);
    }
  }

  console.warn("⚠️ Gemini API fallback to local generator.");
  return generateLocalCrossword(cleanTopic, content, numQuestions);
};

