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
  fileData?: FileData,
  customApiKey?: string
): Promise<CrosswordGenerationResult> => {
  const cleanTopic = (topic || 'General Knowledge').trim();

  if (!cleanTopic || cleanTopic.length < 2)
    throw new Error('Please provide a valid topic name to generate the crossword.');
  if (numQuestions < 3 || numQuestions > 30)
    throw new Error('Number of questions must be between 3 and 30.');

  let res: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (customApiKey?.trim()) {
      headers['x-gemini-api-key'] = customApiKey.trim();
    }

    res = await fetch('/api/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ topic: cleanTopic, content, questionsCount: numQuestions, fileData, apiKey: customApiKey }),
    });
  } catch (err: any) {
    // Network error (no server, proxy not running, etc.)
    throw new Error(
      `Could not reach the generation service. ` +
      `If running locally, make sure the API server is running (npm run dev:server). ` +
      `Detail: ${err?.message}`
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Map server error codes to clean user messages
    const serverMessage = data?.message ?? `Generation service error (HTTP ${res.status})`;
    throw new Error(serverMessage);
  }

  return data as CrosswordGenerationResult;
};
