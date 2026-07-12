import { GoogleGenerativeAI, SchemaType, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { CrosswordGenerationResult } from "./types";
import { generateLayout } from "./layoutGenerator";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";
if (!apiKey) {
  throw new Error("VITE_GEMINI_API_KEY is not set in environment variables");
}

const genAI = new GoogleGenerativeAI(apiKey);

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

function generateDemoCrossword(
  topic: string,
  content: string,
  numQuestions: number
): CrosswordGenerationResult {
  console.log("🎯 Smart DEMO mode - Generating locally...");

  let validWords: Array<{ word: string; clue: string }> = [];
  const cleanTopic = (topic || "").toLowerCase().trim();

  if (content && content.trim().length > 50) {
    // Clean and tokenize content
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const words = content
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && w.length <= 12);

    // Count word frequency
    const wordFreq = new Map<string, number>();
    words.forEach(w => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));

    // Get most important words
    const importantWords = Array.from(wordFreq.entries())
      .filter(([word, freq]) => freq > 1 || word.length >= 5)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .filter((w, i, arr) => arr.indexOf(w) === i)
      .slice(0, numQuestions * 2);

    // Generate clues
    const generated = importantWords.map(w => {
      let clue = `Key concept in the study material: ${w.charAt(0) + w.slice(1).toLowerCase()}`;
      const lowerWord = w.toLowerCase();
      const contextSentence = sentences.find(s => s.toLowerCase().includes(lowerWord));
      if (contextSentence) {
        const wordsList = contextSentence.trim().split(/\s+/);
        const wIdx = wordsList.findIndex(x => x.toLowerCase().replace(/[^a-z]/g, '') === lowerWord);
        if (wIdx >= 0) {
          const start = Math.max(0, wIdx - 3);
          const end = Math.min(wordsList.length, wIdx + 4);
          const context = wordsList.slice(start, end).filter((_, idx) => idx !== wIdx - start).join(' ').replace(/[^a-zA-Z\s]/g, '').trim();
          if (context.length > 10) {
            clue = `Related to: ... ${context.slice(0, 60)} ...`;
          }
        }
      }
      return { word: w, clue };
    });

    validWords = generated.filter(item => item.word.length >= 3 && item.word.length <= 15);
  }

  // Topic specific dictionaries for common educational subjects
  const scienceWords = [
    { word: "GRAVITY", clue: "Force that attracts bodies toward the center of the earth" },
    { word: "ENERGY", clue: "The quantitative property that must be transferred to an object" },
    { word: "ATOM", clue: "The basic unit of a chemical element" },
    { word: "ELECTRON", clue: "A subatomic particle with a charge of negative electricity" },
    { word: "FORCE", clue: "Strength or energy as an attribute of physical action" },
    { word: "EVOLUTION", clue: "The process by which different kinds of living organisms developed" },
    { word: "GENETICS", clue: "The study of heredity and the variation of inherited characteristics" },
    { word: "PHOTOSYNTHESIS", clue: "The process by which green plants use sunlight to synthesize nutrients" },
    { word: "CELL", clue: "The smallest structural and functional unit of an organism" },
    { word: "MOLECULE", clue: "A group of atoms bonded together" }
  ];

  const computerWords = [
    { word: "ALGORITHM", clue: "A process or set of rules to be followed in calculations" },
    { word: "DATABASE", clue: "A structured set of data held in a computer" },
    { word: "COMPILER", clue: "A program that translates code into machine language" },
    { word: "NETWORK", clue: "A group of two or more computer systems linked together" },
    { word: "VARIABLE", clue: "A value or storage location that can change during execution" },
    { word: "INTERFACE", clue: "A point where two systems or subjects meet and interact" },
    { word: "INTERNET", clue: "A global computer network providing information and communication" },
    { word: "FUNCTION", clue: "A block of code that performs a specific task" },
    { word: "SECURITY", clue: "Protection of computer systems from theft or damage" },
    { word: "HARDWARE", clue: "The physical parts of a computer system" }
  ];

  const defaultWords = [
    { word: "THEORY", clue: "A system of ideas explaining something" },
    { word: "CONCEPT", clue: "An abstract idea or general notion" },
    { word: "ANALYSIS", clue: "Detailed examination of elements" },
    { word: "METHOD", clue: "A particular procedure for doing something" },
    { word: "PROCESS", clue: "A series of actions to achieve a result" },
    { word: "SYSTEM", clue: "A set of connected things forming a whole" },
    { word: "FUNCTION", clue: "An activity natural to something" },
    { word: "STRUCTURE", clue: "The arrangement of parts in something" },
    { word: "PRINCIPLE", clue: "A fundamental truth or proposition" },
    { word: "RESEARCH", clue: "Systematic investigation to establish facts" },
    { word: "STUDY", clue: "The devotion of time to acquiring knowledge" },
    { word: "LEARNING", clue: "The acquisition of knowledge or skills" },
    { word: "KNOWLEDGE", clue: "Facts and information acquired through experience" },
    { word: "ACADEMIC", clue: "Relating to education and scholarship" },
    { word: "EDUCATION", clue: "The process of receiving systematic instruction" },
  ];

  // Select dictionary based on topic
  let selectedDictionary = defaultWords;
  if (cleanTopic.includes("computer") || cleanTopic.includes("code") || cleanTopic.includes("programming") || cleanTopic.includes("software")) {
    selectedDictionary = computerWords;
  } else if (cleanTopic.includes("science") || cleanTopic.includes("physic") || cleanTopic.includes("chem") || cleanTopic.includes("biology")) {
    selectedDictionary = scienceWords;
  }

  while (validWords.length < numQuestions) {
    const item = selectedDictionary[validWords.length % selectedDictionary.length];
    if (!validWords.some(w => w.word === item.word)) {
      validWords.push(item);
    } else {
      validWords.push({
        word: `CONCEPT${validWords.length + 1}`,
        clue: `Key subject concept number ${validWords.length + 1}`
      });
    }
  }

  const selectedWords = validWords.slice(0, numQuestions);
  const arranged = generateLayout(selectedWords, selectedWords.length);

  return {
    title: topic || "Generated Crossword",
    subject: topic || "General Studies",
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
    if (apiKey === "DEMO" || !apiKey) {
      throw new Error("DEMO mode active");
    }

    // Use gemini-2.5-flash for maximum stability and speed
    const modelId = "gemini-2.5-flash";

    // ---- STAGE 1: Technical Term Extraction (RAG) ----
    const stage1Prompt = `
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

    const stage1Model = genAI.getGenerativeModel({
      model: modelId,
      safetySettings,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            terms: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  word: { type: SchemaType.STRING },
                  definition: { type: SchemaType.STRING },
                },
                required: ["word", "definition"],
              },
            },
          },
          required: ["terms"],
        },
      },
    });

    console.log("Stage 1: Extracting terms...");
    const stage1Result = await stage1Model.generateContent(stage1Parts);

    if (!stage1Result.response?.candidates?.[0]) {
      throw new Error("Stage 1 failed: No response candidates found. Content may have been blocked by safety filters.");
    }

    const termsText = stage1Result.response.text();
    const { terms } = JSON.parse(termsText);
    console.log(`Stage 1: Extracted ${terms.length} terms.`);

    // ---- STAGE 2: Client-side Crossword Layout Generation ----
    console.log("Stage 2: Generating crossword layout client-side...");
    
    const wordItems = terms.map((t: any) => ({
      word: t.word,
      clue: t.definition,
    }));

    const placedQuestions = generateLayout(wordItems, numQuestions);

    if (placedQuestions.length < Math.min(5, numQuestions)) {
      throw new Error(
        `Could only place ${placedQuestions.length} words. Please try again with a longer document or a different topic.`
      );
    }

    return {
      title: topic || "Educational Assessment",
      subject: topic || "General Knowledge",
      questions: placedQuestions,
    };

  } catch (err) {
    console.warn("⚠️ Gemini API generation failed. Falling back to local Smart generation:", err);
    return generateDemoCrossword(topic, content, numQuestions);
  }
};
