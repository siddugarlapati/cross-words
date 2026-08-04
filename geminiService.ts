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
  console.log("⚡ Generating crossword from topic & content locally...");

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

  // Topic specific dictionaries for educational subjects
  const scienceWords = [
    { word: "GRAVITY", clue: "Force that attracts bodies toward the center of the earth" },
    { word: "ENERGY", clue: "The quantitative property that must be transferred to an object" },
    { word: "ATOM", clue: "The basic unit of a chemical element" },
    { word: "ELECTRON", clue: "A subatomic particle with a negative electric charge" },
    { word: "FORCE", clue: "Strength or energy as an attribute of physical action" },
    { word: "EVOLUTION", clue: "The process by which organisms develop over generations" },
    { word: "GENETICS", clue: "The study of heredity and inherited characteristics" },
    { word: "PHOTOSYNTHESIS", clue: "Process by which green plants synthesize nutrients using sunlight" },
    { word: "CELL", clue: "The basic structural and functional unit of life" },
    { word: "MOLECULE", clue: "A group of atoms bonded together" }
  ];

  const computerWords = [
    { word: "ALGORITHM", clue: "A step-by-step procedure for solving a problem" },
    { word: "DATABASE", clue: "A structured collection of data stored electronically" },
    { word: "COMPILER", clue: "Program that translates source code into machine language" },
    { word: "NETWORK", clue: "A group of interconnected computer systems" },
    { word: "VARIABLE", clue: "A storage location paired with an associated symbolic name" },
    { word: "INTERFACE", clue: "A shared boundary across which two components exchange information" },
    { word: "INTERNET", clue: "A global network providing communication and information" },
    { word: "FUNCTION", clue: "A block of organized, reusable code used to perform an action" },
    { word: "SECURITY", clue: "Protection of computer systems from unauthorized access" },
    { word: "HARDWARE", clue: "The physical components of a computer system" },
    { word: "RECURSION", clue: "A function calling itself to break down a problem" },
    { word: "POINTER", clue: "A variable that holds the memory address of another value" },
    { word: "THREAD", clue: "The smallest sequence of programmed instructions managed by OS" },
    { word: "KERNEL", clue: "The core component of an operating system" },
    { word: "OBJECT", clue: "An instance of a class containing data and code" }
  ];

  const mathWords = [
    { word: "EQUATION", clue: "A statement that the values of two mathematical expressions are equal" },
    { word: "CALCULUS", clue: "Branch of mathematics that studies continuous change" },
    { word: "MATRIX", clue: "A rectangular array of numbers arranged in rows and columns" },
    { word: "VECTOR", clue: "A quantity having direction as well as magnitude" },
    { word: "THEOREM", clue: "A general proposition not self-evident but proved by reasoning" },
    { word: "FRACTION", clue: "A numerical quantity that is not a whole number" },
    { word: "GEOMETRY", clue: "Branch of mathematics concerned with properties of space" },
    { word: "ALGEBRA", clue: "Branch of mathematics dealing with symbols and rules for manipulating them" },
    { word: "POLYNOMIAL", clue: "An expression consisting of variables and coefficients" },
    { word: "PROBABILITY", clue: "The likelihood or chance of an event occurring" }
  ];

  const historyWords = [
    { word: "REVOLUTION", clue: "A forcible overthrow of a government or social order" },
    { word: "EMPIRE", clue: "An extensive group of states under a single supreme authority" },
    { word: "CONSTITUTION", clue: "A body of fundamental principles according to which a state is governed" },
    { word: "TREATY", clue: "A formally concluded and ratified agreement between countries" },
    { word: "DEMOCRACY", clue: "System of government by the whole population or eligible members" },
    { word: "COLONY", clue: "A country or area under full or partial political control of another" },
    { word: "MONARCHY", clue: "A form of government with a monarch at the head" },
    { word: "HERITAGE", clue: "Valued objects and qualities such as historic buildings passed down generations" }
  ];

  const defaultWords = [
    { word: "THEORY", clue: "A system of ideas explaining a subject" },
    { word: "CONCEPT", clue: "An abstract idea or fundamental notion" },
    { word: "ANALYSIS", clue: "Detailed examination of elements or structure" },
    { word: "METHOD", clue: "A particular procedure for accomplishing something" },
    { word: "PROCESS", clue: "A series of actions taken to achieve an end" },
    { word: "SYSTEM", clue: "A set of connected things forming a complex whole" },
    { word: "FUNCTION", clue: "An activity or purpose natural to a thing" },
    { word: "STRUCTURE", clue: "The arrangement of parts in a complex entity" },
    { word: "PRINCIPLE", clue: "A fundamental truth serving as foundation" },
    { word: "RESEARCH", clue: "Systematic investigation into materials and sources" },
    { word: "LEARNING", clue: "Acquisition of knowledge or skills through study" },
    { word: "KNOWLEDGE", clue: "Facts and information acquired through experience" },
    { word: "ACADEMIC", clue: "Relating to education and scholarship" },
    { word: "LOGIC", clue: "Reasoning conducted according to strict principles" }
  ];

  // Select dictionary based on topic
  let selectedDictionary = defaultWords;
  if (cleanTopic.match(/computer|code|programming|software|data|algorithm|operating|network|web|tech|system/)) {
    selectedDictionary = computerWords;
  } else if (cleanTopic.match(/science|physic|chem|biology|cell|atom|genet/)) {
    selectedDictionary = scienceWords;
  } else if (cleanTopic.match(/math|algebra|calculus|stat|matrix|geo/)) {
    selectedDictionary = mathWords;
  } else if (cleanTopic.match(/history|gov|civic|politi|social|war/)) {
    selectedDictionary = historyWords;
  }

  // Extract terms directly from the topic title itself
  if (topic) {
    const topicTokens = topic.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && w.length <= 12);
    topicTokens.forEach(token => {
      if (!validWords.some(v => v.word === token)) {
        validWords.push({
          word: token,
          clue: `Core term directly defining the topic "${topic}"`
        });
      }
    });
  }

  while (validWords.length < numQuestions) {
    const item = selectedDictionary[validWords.length % selectedDictionary.length];
    if (!validWords.some(w => w.word === item.word)) {
      validWords.push(item);
    } else {
      const altWord = `KEY${validWords.length + 1}TERM`;
      validWords.push({
        word: altWord.slice(0, 10),
        clue: `Important concept associated with ${topic || 'this subject'}`
      });
    }
  }

  const selectedWords = validWords.slice(0, numQuestions);
  const arranged = generateLayout(selectedWords, selectedWords.length);

  return {
    title: topic || "Generated Assessment",
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

