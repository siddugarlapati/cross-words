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
  try {
    if (!apiKey) {
      console.warn("⚠️ VITE_GEMINI_API_KEY is not configured. Using local topic generator.");
      return generateLocalCrossword(topic, content, numQuestions);
    }

    const modelId = "gemini-1.5-flash";

    // ---- STAGE 1: Technical Term Extraction (RAG) or Topic Generation ----
    const hasStudyMaterial = Boolean(content && content.trim().length > 0) || Boolean(fileData);

    const stage1Prompt = hasStudyMaterial
      ? `
      You are an expert curriculum designer and educator.
      Extract exactly ${Math.min(25, numQuestions * 2)} key technical terms and concepts from the provided study materials below.
      
      Requirements for each extracted term:
      1. MUST be a single word (no spaces, hyphens, or special characters).
      2. Length MUST be between 3 and 12 letters long.
      3. MUST be significant to the topic: "${topic}".
      4. Each term must have a concise, clear definition clue suitable for a student crossword puzzle (max 120 chars).
      
      Format the response strictly as a JSON object matching this schema:
      {
        "terms": [
          { "word": "ALGORITHM", "definition": "A step-by-step procedure for solving a problem." }
        ]
      }
    `
      : `
      You are an expert curriculum designer and educator.
      Generate exactly ${Math.min(25, numQuestions * 2)} key technical terms, core concepts, and accurate definition clues for the educational topic: "${topic || 'General Knowledge'}".
      
      Requirements for each generated term:
      1. MUST be a single word (no spaces, hyphens, or special characters).
      2. Length MUST be between 3 and 12 letters long.
      3. MUST be directly relevant to the core concepts of "${topic || 'General Knowledge'}".
      4. Each term must have a clear, informative definition clue suitable for a student crossword puzzle (max 120 chars).
      
      Format the response strictly as a JSON object matching this schema:
      {
        "terms": [
          { "word": "TERM", "definition": "A clear definition clue for this topic." }
        ]
      }
    `;

    const stage1Parts: (string | Part)[] = [stage1Prompt];

    if (content) {
      stage1Parts.push(`Study Materials:\n${content}`);
    }

    if (fileData) {
      const base64Parts = fileData.data.split(',');
      const actualData = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
      stage1Parts.push({
        inlineData: {
          data: actualData,
          mimeType: fileData.mimeType
        }
      });
    }

    const stage1Model = getGenAI().getGenerativeModel({
      model: modelId,
      safetySettings,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    console.log("Stage 1: Generating terms for topic/content:", topic);
    const stage1Result = await stage1Model.generateContent(stage1Parts);

    if (!stage1Result.response?.candidates?.[0]) {
      throw new Error("Stage 1 failed: No response candidates found. Content may have been blocked by safety filters.");
    }

    let termsText = stage1Result.response.text().trim();
    console.log("Raw Gemini Response Snippet:", termsText.substring(0, 200));

    // Strip markdown code fences if present
    termsText = termsText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsedData: any = {};
    try {
      parsedData = JSON.parse(termsText);
    } catch (parseErr) {
      // Fallback regex to extract JSON object or array
      const jsonMatch = termsText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw parseErr;
      }
    }

    const terms = Array.isArray(parsedData) ? parsedData : (parsedData.terms || parsedData.questions || []);
    console.log(`Stage 1: Successfully generated ${terms.length} terms.`);

    // ---- STAGE 2: Client-side Crossword Layout Generation ----
    console.log("Stage 2: Generating crossword layout...");
    
    const wordItems = terms.map((t: any) => ({
      word: ((t.word || t.term || "").toUpperCase().replace(/[^A-Z]/g, "")),
      clue: t.definition || t.clue || t.description || "",
    })).filter((t: any) => t.word.length >= 3 && t.word.length <= 12 && t.clue.length > 0);

    if (wordItems.length === 0) {
      throw new Error("No valid terms were generated for this topic.");
    }

    const placedQuestions = generateLayout(wordItems, numQuestions);

    if (placedQuestions.length === 0) {
      throw new Error("Could not place generated words into grid. Please try again.");
    }

    return {
      title: topic || "Educational Assessment",
      subject: topic || "General Knowledge",
      questions: placedQuestions,
    };

  } catch (err) {
    console.warn("⚠️ Gemini API generation failed or returned invalid format. Falling back to local topic generator:", err);
    return generateLocalCrossword(topic, content, numQuestions);
  }
};

