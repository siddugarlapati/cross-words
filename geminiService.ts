/**
 * geminiService.ts — Frontend HTTP client for crossword generation.
 *
 * In production (Vercel): POST /api/generate — API key stays server-side.
 * In local dev (VITE_GEMINI_API_KEY set): POST /api/generate via Vite proxy to dev server.
 *
 * This file no longer contains the Gemini pipeline or any API key.
 * All generation logic lives in api/generate.ts (server-side).
 */

import { CrosswordGenerationResult } from './types';

export interface FileData {
  data: string;    // base64
  mimeType: string;
}

export const generateCrossword = async (
  topic: string,
  content: string,
  numQuestions: number,
  fileData?: FileData
): Promise<CrosswordGenerationResult> => {
  const cleanTopic = (topic || 'General Knowledge').trim();

  if (!cleanTopic || cleanTopic.length < 2)
    throw new Error('Please provide a valid topic name to generate the crossword.');
  if (numQuestions < 3 || numQuestions > 30)
    throw new Error('Number of questions must be between 3 and 30.');

  let res: Response;
  const executeFetch = async () => {
    return fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: cleanTopic, content, questionsCount: numQuestions, fileData }),
    });
  };

  try {
    res = await executeFetch();
    if (res.status === 503 || res.status === 429) {
      // Auto-retry once after short 2s backoff on AI service traffic surges
      await new Promise(r => setTimeout(r, 2000));
      res = await executeFetch();
    }
  } catch (err: any) {
    throw new Error(
      `Could not reach the generation service. ` +
      `If running locally, make sure the API server is running (npm run dev:server). ` +
      `Detail: ${err?.message}`
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const serverMessage = data?.message ?? `Generation service error (HTTP ${res.status})`;
    throw new Error(serverMessage);
  }

  return data as CrosswordGenerationResult;
};
