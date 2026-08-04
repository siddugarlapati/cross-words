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

  // Rich domain dictionaries for educational subjects
  const csAndTechWords = [
    { word: "ALGORITHM", clue: "A step-by-step procedure or set of rules for solving a problem" },
    { word: "DATABASE", clue: "An organized collection of structured data stored electronically" },
    { word: "COMPILER", clue: "Software that translates high-level code into executable machine instructions" },
    { word: "NETWORK", clue: "A collection of interconnected computing systems exchanging data" },
    { word: "VARIABLE", clue: "A named storage location holding a value that can change during execution" },
    { word: "INTERFACE", clue: "A shared boundary defining methods for component communication" },
    { word: "SECURITY", clue: "Protection of digital systems, data, and networks from unauthorized access" },
    { word: "RECURSION", clue: "A method where a function calls itself to solve smaller sub-problems" },
    { word: "POINTER", clue: "A variable storing the memory location address of another value" },
    { word: "THREAD", clue: "The smallest unit of execution within an operating system process" },
    { word: "KERNEL", clue: "The core component of an operating system managing system resources" },
    { word: "OBJECT", clue: "An instance of a class encapsulating data properties and behavior methods" },
    { word: "INHERITANCE", clue: "Mechanism where a new class adopts characteristics from an existing parent class" },
    { word: "ENCAPSULATION", clue: "Bundling data and operations into a single unit while restricting direct access" },
    { word: "POLYMORPHISM", clue: "Ability of different objects to respond to the same interface or method" },
    { word: "TRAVERSAL", clue: "Visiting each element or node in a data structure systematically" },
    { word: "ITERATION", clue: "Repeated execution of a block of statements until a condition is met" },
    { word: "PROTOCOL", clue: "Set of rules governing the exchange of data between devices" },
    { word: "PIPELINE", clue: "A chain of processing elements where the output of one is input to next" },
    { word: "ENCRYPTION", clue: "Encoding information so only authorized parties can access it" },
    { word: "FRAMEWORK", clue: "Reusable software platform providing foundation for building applications" },
    { word: "REPOSITORY", clue: "Centralized location for storing and managing code or data assets" },
    { word: "MIDDLEWARE", clue: "Software layer providing services to applications beyond OS capabilities" },
    { word: "PARALLEL", clue: "Executing multiple computations simultaneously across processing cores" },
    { word: "DEPENDENCY", clue: "A reliance of one software module on another to function properly" }
  ];

  const dataStructuresWords = [
    { word: "BINARY", clue: "A tree structure where each node has at most two children" },
    { word: "TREE", clue: "A hierarchical non-linear data structure consisting of connected nodes" },
    { word: "GRAPH", clue: "A structure consisting of a set of vertices connected by edges" },
    { word: "VERTEX", clue: "A fundamental node or point in a graph network" },
    { word: "EDGE", clue: "A connection or link between two vertices in a graph" },
    { word: "STACK", clue: "A Last-In First-Out (LIFO) linear data structure" },
    { word: "QUEUE", clue: "A First-In First-Out (FIFO) linear data structure" },
    { word: "ARRAY", clue: "A contiguous sequence of elements indexed by numerical positions" },
    { word: "NODE", clue: "A basic building block containing data and links to other nodes" },
    { word: "PARENT", clue: "A node that has one or more child nodes beneath it in a tree" },
    { word: "CHILD", clue: "A node connected directly below a parent node in a tree" },
    { word: "LEAF", clue: "A terminal node in a tree structure that has no children" },
    { word: "DEPTH", clue: "The number of edges from the root node to a specific node" },
    { word: "HEIGHT", clue: "The length of the longest path from a node to a leaf" },
    { word: "SEARCH", clue: "Finding the position of a specific target key within a structure" },
    { word: "HASH", clue: "Converting a key into a numeric index using a mapping function" },
    { word: "HEAP", clue: "A specialized tree-based structure satisfying the heap property" },
    { word: "TRAVERSAL", clue: "Visiting every node in a tree or graph systematically" },
    { word: "DIJKSTRA", clue: "Algorithm for finding the shortest path between nodes in a graph" },
    { word: "MATRIX", clue: "A two-dimensional grid array representing graph adjacency or data" },
    { word: "POINTER", clue: "Reference link pointing to the memory address of the next node" },
    { word: "BALANCE", clue: "Keeping a tree height minimal to maintain logarithmic operation times" }
  ];

  const scienceWords = [
    { word: "GRAVITY", clue: "Universal force that attracts physical bodies toward one another" },
    { word: "ENERGY", clue: "The capacity to perform physical work or transfer heat" },
    { word: "ATOM", clue: "The fundamental unit of a chemical element" },
    { word: "ELECTRON", clue: "A subatomic particle carrying a negative electrical charge" },
    { word: "FORCE", clue: "An interaction that changes or tends to change an object's motion" },
    { word: "EVOLUTION", clue: "Process by which biological populations adapt across generations" },
    { word: "GENETICS", clue: "The study of heredity and biological variation in organisms" },
    { word: "PHOTOSYNTHESIS", clue: "Chemical process converting light energy into cellular food" },
    { word: "CELL", clue: "The structural and functional basic unit of biological organisms" },
    { word: "MOLECULE", clue: "Group of two or more chemical atoms held together by covalent bonds" }
  ];

  const mathWords = [
    { word: "EQUATION", clue: "Mathematical statement asserting equality between two expressions" },
    { word: "CALCULUS", clue: "Branch of mathematics studying rates of continuous change" },
    { word: "MATRIX", clue: "A rectangular array of numbers arranged in rows and columns" },
    { word: "VECTOR", clue: "A mathematical entity possessing both magnitude and direction" },
    { word: "THEOREM", clue: "A logical statement proved based on established axioms" },
    { word: "FRACTION", clue: "A numerical representation of a part of a whole quantity" },
    { word: "GEOMETRY", clue: "Branch of mathematics analyzing space, shapes, and positions" },
    { word: "ALGEBRA", clue: "Branch of mathematics operating on symbols and relational rules" },
    { word: "POLYNOMIAL", clue: "Expression involving sums of terms with non-negative power variables" },
    { word: "PROBABILITY", clue: "Measure of the likelihood that a given event will take place" }
  ];

  const genericEduWords = [
    { word: "FUNDAMENTALS", clue: "The central core principles establishing a domain of study" },
    { word: "ARCHITECTURE", clue: "The structural layout and conceptual organization of a system" },
    { word: "METHODOLOGY", clue: "A contextual framework of methods and procedures applied to a subject" },
    { word: "IMPLEMENTATION", clue: "The execution or practical realization of an idea or design" },
    { word: "OPTIMIZATION", clue: "Modifying a process or system to achieve maximum efficiency" },
    { word: "EVALUATION", clue: "Systematic determination of merit, performance, or value" },
    { word: "SPECIFICATION", clue: "Detailed documentation describing required criteria and functionality" },
    { word: "INTEGRATION", clue: "Combining sub-components into a unified operational system" }
  ];

  // Select primary dictionary based on topic subject keywords
  let selectedDictionary = csAndTechWords;
  if (cleanTopic.match(/tree|graph|binary|data structure|stack|queue|array|node|linked|heap|hash|dijkstra/)) {
    selectedDictionary = dataStructuresWords;
  } else if (cleanTopic.match(/computer|code|program|software|data|algorithm|operating|network|web|tech|system|dev|java|python|cpp|c|engineering|cs/)) {
    selectedDictionary = csAndTechWords;
  } else if (cleanTopic.match(/science|physic|chem|biology|cell|atom|genet|botany|zoo/)) {
    selectedDictionary = scienceWords;
  } else if (cleanTopic.match(/math|algebra|calculus|stat|matrix|geo|prob/)) {
    selectedDictionary = mathWords;
  } else {
    selectedDictionary = [...csAndTechWords, ...genericEduWords];
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

  // Fill remaining questions using selected dictionary
  let dictIdx = 0;
  while (validWords.length < numQuestions) {
    const item = selectedDictionary[dictIdx % selectedDictionary.length];
    if (!validWords.some(w => w.word === item.word)) {
      validWords.push(item);
    }
    dictIdx++;
    if (dictIdx > selectedDictionary.length * 3 && validWords.length < numQuestions) {
      // Backup fallback if dictionary exhausted
      const fallbackItem = genericEduWords[validWords.length % genericEduWords.length];
      if (!validWords.some(w => w.word === fallbackItem.word)) {
        validWords.push(fallbackItem);
      } else {
        const altWord = `KEY${validWords.length + 1}TERM`;
        validWords.push({
          word: altWord.slice(0, 10),
          clue: `Important concept associated with ${topic || 'this subject'}`
        });
      }
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

