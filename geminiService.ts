import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { CrosswordGenerationResult } from "./types";
import { generateLayout } from "./layoutGenerator";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";

export interface FileData {
  data: string;
  mimeType: string;
}

const WORD_REGEX = /^[A-Z]{3,12}$/;

/**
 * Dynamically fetches terms and definition clues for ANY topic from Wikipedia REST API.
 * Requires zero hardcoded word lists and zero static domain pools.
 */
async function generateDynamicLocalCrossword(
  topic: string,
  content: string,
  numQuestions: number
): Promise<CrosswordGenerationResult> {
  const cleanTopic = (topic || "General Knowledge").trim();
  console.log(`🌐 Fetching live web knowledge for topic: "${cleanTopic}"...`);

  const topicUpper = cleanTopic.toUpperCase();
  const wordMap = new Map<string, string>();

  // Stopwords to exclude generic filler words
  const stopWords = new Set([
    "THE", "AND", "THAT", "HAVE", "FOR", "NOT", "WITH", "YOU", "THIS", "BUT", "HIS", "FROM", "THEY",
    "SAY", "HER", "SHE", "OR", "AN", "WILL", "MY", "ONE", "ALL", "WOULD", "THERE", "THEIR", "WHAT",
    "SO", "UP", "OUT", "IF", "ABOUT", "WHO", "GET", "WHICH", "GO", "ME", "WHEN", "MAKE", "CAN",
    "LIKE", "TIME", "NO", "JUST", "HIM", "KNOW", "TAKE", "PEOPLE", "INTO", "YEAR", "YOUR", "SOME",
    "COULD", "THEM", "SEE", "OTHER", "THAN", "THEN", "NOW", "LOOK", "ONLY", "COME", "ITS", "OVER",
    "THINK", "ALSO", "BACK", "AFTER", "USE", "TWO", "HOW", "OUR", "WORK", "FIRST", "WELL", "WAY",
    "EVEN", "NEW", "WANT", "BECAUSE", "ANY", "THESE", "GIVE", "DAY", "MOST", "US", "USED", "BEEN",
    "MANY", "ALSO", "SUCH", "MORE", "MAY", "OFTEN", "TYPE", "FORM", "ALSO", "EACH", "EACH", "WELL"
  ]);

  // 1. Fetch real topic summary from Wikipedia REST API (Free & Public)
  try {
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTopic)}`;
    const wikiRes = await fetch(wikiUrl);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const extractText = wikiData?.extract || wikiData?.description || "";
      if (extractText && extractText.length > 20) {
        const sentences = extractText.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
        const tokens = extractText
          .toUpperCase()
          .replace(/[^A-Z\s]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length >= 3 && w.length <= 12);

        tokens.forEach((w: string) => {
          if (!stopWords.has(w) && !wordMap.has(w) && wordMap.size < numQuestions * 2) {
            const lowerWord = w.toLowerCase();
            const matchingSentence = sentences.find((s: string) => s.toLowerCase().includes(lowerWord));
            let clue = `Key concept in the study of ${cleanTopic}`;
            if (matchingSentence) {
              const trimmedSent = matchingSentence.trim();
              clue = trimmedSent.length > 90 ? `${trimmedSent.slice(0, 87)}...` : trimmedSent;
            }
            wordMap.set(w, clue);
          }
        });
      }
    }
  } catch (wErr) {
    console.warn("Wikipedia summary fetch failed:", wErr);
  }

  // 2. Extract terms from content text if uploaded
  if (content && content.trim().length > 30) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const contentTokens = content
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && w.length <= 12);

    contentTokens.forEach(w => {
      if (!stopWords.has(w) && !wordMap.has(w) && wordMap.size < numQuestions * 2) {
        const lowerWord = w.toLowerCase();
        const contextSentence = sentences.find(s => s.toLowerCase().includes(lowerWord));
        let clue = `Key term from study materials for "${cleanTopic}"`;
        if (contextSentence) {
          const trimmedSent = contextSentence.trim();
          clue = trimmedSent.length > 90 ? `${trimmedSent.slice(0, 87)}...` : trimmedSent;
        }
        wordMap.set(w, clue);
      }
    });
  }

  // 3. Extract explicit tokens from the user's topic title
  const topicTokens = topicUpper
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && w.length <= 12);

  topicTokens.forEach(word => {
    if (!stopWords.has(word) && !wordMap.has(word)) {
      wordMap.set(word, `Primary term defining ${cleanTopic}`);
    }
  });

  const candidateWords = Array.from(wordMap.entries()).map(([word, clue]) => ({ word, clue }));
  const selectedWords = candidateWords.slice(0, numQuestions);

  if (selectedWords.length === 0) {
    throw new Error(`Could not find terms for topic "${cleanTopic}". Please check spelling or internet connection.`);
  }

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

  // Try Gemini AI API if key is set
  if (apiKey && apiKey !== "DEMO") {
    const modelName = "gemini-2.5-flash";
    const hasStudyMaterial = Boolean(content && content.trim().length > 0) || Boolean(fileData);

    const promptText = hasStudyMaterial
      ? `You are an expert educator. Extract exactly ${Math.min(25, numQuestions * 2)} key terms and definitions from the study material below for topic "${cleanTopic}". Requirements: Each term MUST be a single word (3-12 letters A-Z). Clues must be clear definitions (max 100 chars). Return ONLY JSON array: [{"word": "ALGORITHM", "definition": "A step by step procedure."}]`
      : `You are an expert educator. Generate exactly ${Math.min(25, numQuestions * 2)} key terms and definition clues for topic "${cleanTopic}". Requirements: Each term MUST be a single word (3-12 letters A-Z). Clues must be clear definitions (max 100 chars). Return ONLY JSON array: [{"word": "TERM", "definition": "Clear concise definition clue."}]`;

    const payload: any = {
      contents: [
        {
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    if (content) {
      payload.contents[0].parts.push({ text: `Study Material Text:\n${content.substring(0, 4000)}` });
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

    try {
      console.log(`🤖 Requesting Gemini AI (${modelName}) for topic: "${cleanTopic}"...`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

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

      if (response.ok) {
        const resJson = await response.json();
        const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

          let parsed: any = {};
          try {
            parsed = JSON.parse(cleanText);
          } catch (pErr) {
            const jsonMatch = cleanText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
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
              console.log(`✅ Gemini AI successfully generated ${placed.length} terms for "${cleanTopic}"!`);
              return {
                title: cleanTopic,
                subject: cleanTopic,
                questions: placed
              };
            }
          }
        }
      }
    } catch (apiErr: any) {
      console.warn("Gemini API call skipped/failed, using live web extraction:", apiErr.message || apiErr);
    }
  }

  // Fallback to live web knowledge extraction
  return await generateDynamicLocalCrossword(cleanTopic, content, numQuestions);
};
