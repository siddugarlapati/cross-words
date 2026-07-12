import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { CrosswordGenerationResult } from "./types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";
const useDemoMode = !apiKey || apiKey === "DEMO";

console.log("AI Service Configuration:", {
  mode: useDemoMode ? "DEMO (Smart Local Generation)" : "API Mode",
  hasApiKey: !!apiKey
});

export interface FileData {
  data: string;
  mimeType: string;
}

// Smart demo crossword generator with context-aware clues
function generateDemoCrossword(
  topic: string,
  content: string,
  numQuestions: number
): CrosswordGenerationResult {
  console.log("🎯 Smart DEMO mode - Analyzing content...");

  // Clean and tokenize content
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const words = content
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && w.length <= 10);

  // Count word frequency
  const wordFreq = new Map<string, number>();
  words.forEach(w => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));

  // Get most important words (appearing multiple times)
  const importantWords = Array.from(wordFreq.entries())
    .filter(([word, freq]) => freq > 1 || word.length >= 5)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, numQuestions * 2);

  // Generate context-aware clues
  function generateClue(word: string): string {
    const lowerWord = word.toLowerCase();

    // Find sentence containing the word
    const contextSentence = sentences.find(s =>
      s.toLowerCase().includes(lowerWord)
    );

    if (contextSentence) {
      // Extract context around the word
      const words = contextSentence.trim().split(/\s+/);
      const wordIndex = words.findIndex(w =>
        w.toLowerCase().replace(/[^a-z]/g, '') === lowerWord
      );

      if (wordIndex >= 0) {
        // Get surrounding context
        const start = Math.max(0, wordIndex - 3);
        const end = Math.min(words.length, wordIndex + 4);
        const context = words.slice(start, end)
          .filter((_, i) => i !== wordIndex - start)
          .join(' ')
          .replace(/[^a-zA-Z\s]/g, '')
          .trim();

        if (context.length > 10) {
          return `Related to: ${context.slice(0, 50)}`;
        }
      }
    }

    // Fallback clues based on word characteristics
    if (word.endsWith('ING')) return `Action or process: ${word.slice(0, -3).toLowerCase()}`;
    if (word.endsWith('TION')) return `Concept or state: ${word.slice(0, -4).toLowerCase()}`;
    if (word.endsWith('LY')) return `Manner or way: ${word.slice(0, -2).toLowerCase()}`;
    if (word.length >= 8) return `Important term in ${topic || 'this subject'}`;

    return `Key concept: ${word.charAt(0) + word.slice(1).toLowerCase()}`;
  }

  // Educational fallback words with proper clues
  const fallbackWords = [
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
    { word: "SCIENCE", clue: "Systematic study of the physical world" },
    { word: "PRACTICE", clue: "Repeated exercise to acquire skill" }
  ];

  let selectedWords;

  if (importantWords.length >= numQuestions) {
    selectedWords = importantWords.slice(0, numQuestions).map(w => ({
      word: w,
      clue: generateClue(w)
    }));
  } else {
    const contentWords = importantWords.map(w => ({
      word: w,
      clue: generateClue(w)
    }));
    const needed = numQuestions - contentWords.length;
    selectedWords = [...contentWords, ...fallbackWords.slice(0, needed)];
  }

  // Create crossword layout with better spacing
  const questions = selectedWords.map((item, idx) => {
    const isAcross = idx % 2 === 0;
    const row = Math.floor(idx / 2) * 3; // More spacing
    const col = isAcross ? 0 : (idx % 4);

    return {
      word: item.word,
      clue: item.clue,
      direction: isAcross ? "across" : "down",
      row: row,
      col: col
    };
  });

  console.log(`✅ Generated ${questions.length} smart questions from content`);

  return {
    title: topic || "Educational Assessment",
    subject: topic || "General Knowledge",
    questions: questions as any
  };
}

// Main generation function
export const generateCrossword = async (
  topic: string,
  content: string,
  numQuestions: number,
  fileData?: FileData
): Promise<CrosswordGenerationResult> => {

  console.log("🚀 Starting crossword generation...");
  console.log("Input:", { topic, contentLength: content.length, numQuestions });

  if (useDemoMode) {
    console.warn("⚠️ No API key found, using DEMO fallback");
    if (!content || content.trim().length < 50) {
      content = `
        Education is the process of facilitating learning and acquiring knowledge, skills, values, and habits.
        Teaching methods include storytelling, discussion, training, and research. Education frequently takes place
        under the guidance of educators. Learning is the process of acquiring new understanding, knowledge, behaviors,
        skills, values, attitudes, and preferences. The ability to learn is possessed by humans, animals, and some machines.
        Science is a systematic enterprise that builds and organizes knowledge in the form of testable explanations
        and predictions about the universe. Mathematics is the study of topics such as quantity, structure, space, and change.
        History is the study of the past as it is described in written documents. Research comprises creative and systematic
        work undertaken to increase the stock of knowledge. Theory is a contemplative and rational type of abstract thinking.
        Analysis is the process of breaking a complex topic into smaller parts to gain a better understanding of it.
      `;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
    return generateDemoCrossword(topic, content, numQuestions);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const contentSnippet = content.substring(0, 20000);

    const prompt = `You are an expert educational content analyst. Your task is to extract EXACTLY ${numQuestions} key technical terms from the document content provided below and write precise, accurate clues for each term.

DOCUMENT CONTENT:
"""
${contentSnippet}
"""

STRICT RULES — follow every rule exactly:
1. Extract terms ONLY from the document above. Do NOT invent or add outside knowledge.
2. Choose the most important domain-specific technical terms, concepts, definitions, or named items that appear explicitly in the text.
3. Each term must be a SINGLE WORD, between 3 and 15 uppercase letters, containing ONLY A-Z characters (no spaces, hyphens, numbers).
4. The clue for each term must be a short, precise definition or description (under 12 words) that is DIRECTLY based on how the term is used or defined in the document.
5. Do NOT use the word itself in its own clue.
6. Return ONLY a raw JSON array — no markdown, no explanation, no code block. Format:
[{"word": "TERM", "clue": "Short definition from the document"}]

Extract ${numQuestions} terms now:`;

    const parts: Part[] = [{ text: prompt }];

    if (fileData) {
      const base64Parts = fileData.data.split(',');
      const actualData = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
      parts.push({
        inlineData: {
          data: actualData,
          mimeType: fileData.mimeType
        }
      });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text().trim();
    console.log("📄 Raw Gemini response:", text.substring(0, 500));

    // Parse JSON — handle both raw arrays and code-fenced responses
    let parsedWords: any[] = [];

    // Try to find a JSON array in the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsedWords = JSON.parse(jsonMatch[0]);
    } else {
      // Last resort: try parsing the whole text
      parsedWords = JSON.parse(text);
    }

    if (!Array.isArray(parsedWords) || parsedWords.length === 0) {
      throw new Error("Gemini returned empty or invalid array");
    }

    // Clean and validate each entry, filter out bad ones
    const validWords = parsedWords
      .map((item: any) => ({
        word: (item.word ?? "").toUpperCase().replace(/[^A-Z]/g, ""),
        clue: (item.clue ?? "").trim(),
      }))
      .filter((item) => item.word.length >= 3 && item.word.length <= 15 && item.clue.length > 0);

    if (validWords.length === 0) {
      throw new Error("No valid words found in Gemini response");
    }

    // Apply crossword layout
    const questions = validWords.slice(0, numQuestions).map((item, idx) => {
      const isAcross = idx % 2 === 0;
      const row = Math.floor(idx / 2) * 3;
      const col = isAcross ? 0 : (idx % 4);
      return {
        word: item.word,
        clue: item.clue,
        direction: isAcross ? "across" : "down",
        row,
        col,
      };
    });

    console.log(`✅ API Generation complete — ${questions.length} valid words extracted`);

    return {
      title: topic || "Generated Assessment",
      subject: topic || "Subject",
      questions: questions as any,
    };

  } catch (err) {
    console.error("❌ Gemini API Error:", err);
    throw Error("Failed to generate assessment. Please check your API key and try again.");
  }
};
