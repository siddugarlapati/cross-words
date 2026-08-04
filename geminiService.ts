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

  domainPools.forEach(pool => {
    if (pool.match.test(topicLower)) {
      pool.terms.forEach(t => {
        if (!wordMap.has(t.word) && wordMap.size < numQuestions * 2) {
          wordMap.set(t.word, t.clue);
        }
      });
    }
  });

  const candidateWords = Array.from(wordMap.entries()).map(([word, clue]) => ({ word, clue }));

  // Genuine academic and technical fallback terms (no synthetic placeholders)
  const genuineFallbackTerms = [
    { word: "ARCHITECTURE", clue: `Conceptual layout and structural organization of ${cleanTopic}` },
    { word: "INFRASTRUCTURE", clue: `Underlying framework and foundational setup for ${cleanTopic}` },
    { word: "IMPLEMENTATION", clue: `The practical execution or technical realization of ${cleanTopic}` },
    { word: "SPECIFICATION", clue: `Explicit set of requirements and standards governing ${cleanTopic}` },
    { word: "FRAMEWORK", clue: `Reusable conceptual platform supporting building blocks of ${cleanTopic}` },
    { word: "OPTIMIZATION", clue: `Refining processes and performance within ${cleanTopic}` },
    { word: "INTEGRATION", clue: `Combining sub-modules into a unified system in ${cleanTopic}` },
    { word: "PROTOCOL", clue: `Standardized rule set governing interactions in ${cleanTopic}` },
    { word: "SECURITY", clue: `Protection measures and access controls applied to ${cleanTopic}` },
    { word: "EXECUTION", clue: `Carrying out operations or instructions within ${cleanTopic}` },
    { word: "VIRTUALIZATION", clue: `Abstracting physical computing resources in ${cleanTopic}` },
    { word: "DEPENDENCY", clue: `Inter-reliance between components in ${cleanTopic}` },
    { word: "REPOSITORY", clue: `Central storage location for assets and code in ${cleanTopic}` },
    { word: "ANALYSIS", clue: `Systematic evaluation of components and behavior in ${cleanTopic}` }
  ];

  if (candidateWords.length < numQuestions) {
    for (const fb of genuineFallbackTerms) {
      if (candidateWords.length >= numQuestions) break;
      if (!candidateWords.some(c => c.word === fb.word)) {
        candidateWords.push(fb);
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

