/**
 * server/dev.ts — Local development API server.
 *
 * Mirrors the Vercel Function at api/generate.ts so local development
 * works without needing the Vercel CLI.
 *
 * Start with: npm run dev:server
 * Vite proxies /api/* to this server (port 3002).
 */

import http from 'node:http';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';

// Load .env for local dev (Vercel handles this in production)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '..', '.env');
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
  console.log('[dev-server] Loaded .env');
} catch { console.warn('[dev-server] No .env found, using existing process.env'); }

// Ensure GEMINI_API_KEY is set (accepts both GEMINI_API_KEY and VITE_GEMINI_API_KEY for local dev)
if (!process.env.GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
  console.log('[dev-server] Using VITE_GEMINI_API_KEY as GEMINI_API_KEY');
}

// Dynamically import the handler (ESM)
const { default: generateHandler } = await import('../api/generate.js');

const PORT = parseInt(process.env.API_PORT ?? '3099');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // CORS for Vite dev server
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3001');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

    // Wrap into a Vercel-compatible request/response shim
    const mockReq: any = { method: 'POST', body, headers: req.headers };
    const headers: Record<string, string | number> = {};
    const mockRes: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      setHeader(k: string, v: string) { headers[k] = v; },
      json(data: any) {
        const body = JSON.stringify(data);
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...headers });
        res.end(body);
      },
    };

    try {
      await generateHandler(mockReq, mockRes);
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INTERNAL', message: err?.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

server.listen(PORT, () => {
  console.log(`[dev-server] API server running at http://localhost:${PORT}`);
  console.log(`[dev-server] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '***' + process.env.GEMINI_API_KEY.slice(-4) : 'NOT SET'}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[dev-server] Port ${PORT} is in use. Set API_PORT env var to use a different port.`);
    process.exit(1);
  }
  throw err;
});
