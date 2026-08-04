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

  // 3. Dynamic domain knowledge pools matching the specific topic keywords
  const domainPools: Array<{ match: RegExp; terms: Array<{ word: string; clue: string }> }> = [
    {
      match: /graph|tree|dijkstra|binary|traversal|data structure|stack|queue|heap|hash|node|array|link/,
      terms: [
        { word: "GRAPH", clue: `Network structure composed of vertices and connecting edges in ${cleanTopic}` },
        { word: "VERTEX", clue: `A fundamental point or node location within a graph structure` },
        { word: "EDGE", clue: `Connection or link between two vertices in a graph network` },
        { word: "DIJKSTRA", clue: `Shortest-path algorithm for finding minimum distance in weighted graphs` },
        { word: "TRAVERSAL", clue: `Systematic process of visiting every node or vertex in a data structure` },
        { word: "BINARY", clue: `Hierarchical tree structure where nodes have at most two child branches` },
        { word: "TREE", clue: "Non-linear hierarchical data structure organized into parent and child nodes" },
        { word: "STACK", clue: "Linear Last-In First-Out (LIFO) data collection structure" },
        { word: "QUEUE", clue: "Linear First-In First-Out (FIFO) data collection structure" },
        { word: "ARRAY", clue: "Contiguous block of memory holding indexed elements of identical type" },
        { word: "NODE", clue: "Basic element containing data and pointers to adjoining nodes" },
        { word: "LEAF", clue: "Terminal node located at the bottom of a tree having zero child nodes" },
        { word: "PARENT", clue: "A node connected directly above another child node in a hierarchy" },
        { word: "CHILD", clue: "A node connected directly beneath a preceding parent node" },
        { word: "DEPTH", clue: "The total number of edges from the root node to a specific node" },
        { word: "HEIGHT", clue: "The maximum edge distance from a node down to its furthest leaf" },
        { word: "HEAP", clue: "Specialized tree-based structure satisfying the max or min heap property" },
        { word: "HASH", clue: "Function mapping key values to numerical array storage locations" },
        { word: "PATH", clue: "Sequence of edges connecting a series of distinct graph vertices" },
        { word: "MATRIX", clue: "Two-dimensional array representing graph connections or grid coordinates" },
        { word: "POINTER", clue: "Reference variable storing the memory address of a target element" }
      ]
    },
    {
      match: /operating|os|kernel|process|thread|memory|system|cpu|schedul|semaphore|buffer|deadlock/,
      terms: [
        { word: "KERNEL", clue: `Central core module of an operating system managing system hardware` },
        { word: "PROCESS", clue: `An active instance of a computer program currently executing` },
        { word: "THREAD", clue: `Smallest sequence of programmed instructions managed independently by OS` },
        { word: "MEMORY", clue: `Primary storage component holding data and running process code` },
        { word: "DEADLOCK", clue: `Concurrency state where multiple processes block indefinitely waiting for resources` },
        { word: "SEMAPHORE", clue: `Synchronization flag variable managing shared resource access` },
        { word: "PAGING", clue: `Memory allocation scheme transferring fixed-size blocks between RAM and disk` },
        { word: "BUFFER", clue: `Temporary memory storage area used to hold data during transfer` },
        { word: "CACHE", clue: `High-speed memory layer storing frequently accessed processor data` },
        { word: "SCHEDULER", clue: `OS component deciding which process runs on CPU next` }
      ]
    },
    {
      match: /db|database|sql|query|schema|table|relation|index|transaction|relational/,
      terms: [
        { word: "DATABASE", clue: `Organized collection of structured data stored for rapid processing` },
        { word: "SCHEMA", clue: `Formal structural specification defining tables, fields, and constraints` },
        { word: "QUERY", clue: `Command or request used to retrieve or manipulate stored database records` },
        { word: "INDEX", clue: `Data structure accelerating lookup operations on table columns` },
        { word: "TABLE", clue: `Collection of related data organized in rows and columns` },
        { word: "RELATION", clue: "Mathematical concept of a table with attributes and tuples" },
        { word: "TRANSACTION", clue: "Unit of work executed atomically against a database" }
      ]
    },
    {
      match: /network|protocol|ip|tcp|udp|web|http|router|packet|socket|server|client/,
      terms: [
        { word: "PROTOCOL", clue: `Standard rule set facilitating communication across network endpoints` },
        { word: "ROUTER", clue: `Hardware device directing data packets between different networks` },
        { word: "PACKET", clue: `Unit of formatted data transmitted over a packet-switched network` },
        { word: "SOCKET", clue: `Software endpoint for sending and receiving data over network` },
        { word: "SERVER", clue: `System or application providing services and resources to clients` },
        { word: "CLIENT", clue: `Device or software requesting services from a remote network server` }
      ]
    },
    {
      match: /photo|plant|cell|biology|gene|dna|organ|bio|botany|zoo|life/,
      terms: [
        { word: "PHOTOSYNTHESIS", clue: `Biological process synthesizing nutrients from sunlight and carbon dioxide` },
        { word: "CHLOROPHYLL", clue: `Green pigment absorbing light energy inside plant chloroplasts` },
        { word: "CELL", clue: `Basic structural, functional, and biological unit of living organisms` },
        { word: "MEMBRANE", clue: `Selective barrier surrounding cells regulating transport of substances` },
        { word: "ENZYME", clue: `Biological catalyst accelerating chemical reactions in living cells` },
        { word: "GENETICS", clue: `Study of heredity and genetic variation in living organisms` },
        { word: "MOLECULE", clue: `Chemical structure composed of bonded atoms` }
      ]
    },
    {
      match: /chem|atom|reaction|element|bond|acid|base|compound|matter/,
      terms: [
        { word: "ATOM", clue: `Smallest constituent unit of ordinary matter possessing chemical element properties` },
        { word: "ELECTRON", clue: `Subatomic particle with negative charge orbiting atomic nucleus` },
        { word: "PROTON", clue: `Positively charged subatomic particle located in the atomic nucleus` },
        { word: "NEUTRON", clue: `Uncharged subatomic particle present in atomic nuclei` },
        { word: "BOND", clue: `Attraction between atoms enabling formation of chemical compounds` },
        { word: "REACTION", clue: `Process transforming one set of chemical substances into another` }
      ]
    },
    {
      match: /physics|thermo|heat|energy|force|motion|wave|light|electric/,
      terms: [
        { word: "THERMODYNAMICS", clue: `Branch of physics dealing with heat, work, and energy transformations` },
        { word: "ENTROPY", clue: `Measure of thermal energy unavailable for doing useful mechanical work` },
        { word: "ENTHALPY", clue: `Total heat content of a thermodynamic system` },
        { word: "ENERGY", clue: `Quantitative property transferred to an object to perform work` },
        { word: "KINETIC", clue: `Energy possessed by an object due to its motion` },
        { word: "PRESSURE", clue: `Continuous physical force exerted per unit area` }
      ]
    }
  ];

  // Match topic to candidate terms
  domainPools.forEach(pool => {
    if (pool.match.test(topicLower)) {
      pool.terms.forEach(t => {
        if (!wordMap.has(t.word) && wordMap.size < numQuestions * 2) {
          wordMap.set(t.word, t.clue);
        }
      });
    }
  });

  // Convert to candidate array
  let candidates = Array.from(wordMap.entries()).map(([word, clue]) => ({ word, clue }));

  // If more terms needed, dynamically synthesize terms directly bound to the topic string
  if (candidates.length < numQuestions) {
    const rawTokens = topicUpper.replace(/[^A-Z]/g, '');
    const cleanPrefix = rawTokens.length >= 3 && rawTokens.length <= 10 ? rawTokens : "TOPIC";
    for (let i = 1; candidates.length < numQuestions; i++) {
      const synWord = candidates.some(c => c.word === cleanPrefix) ? `${cleanPrefix}${i}`.slice(0, 10) : cleanPrefix;
      if (!candidates.some(c => c.word === synWord)) {
        candidates.push({
          word: synWord,
          clue: `Core concept #${i} directly defining the topic "${cleanTopic}"`
        });
      }
    }
  }

  const selectedWords = candidates.slice(0, numQuestions);
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

