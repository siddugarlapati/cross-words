import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Forward /api/* to the local dev API server (mirrors Vercel Functions in prod)
          '/api': {
            target: 'http://localhost:3099',
            changeOrigin: true,
            rewrite: (path: string) => path,
          },
        },
      },
      plugins: [react()],
      // GEMINI_API_KEY is now server-side only (api/generate.ts).
      // No Gemini key is embedded in the frontend bundle.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Raise the warning threshold to 1MB — this app includes heavy PDF/DOCX parsing libs
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            // Code-split heavy vendor libraries into separate chunks
            manualChunks: {
              // React core
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              // Supabase client
              'vendor-supabase': ['@supabase/supabase-js'],
              // PDF/document parsing (largest dependency — loaded only on FacultyCreate)
              'vendor-pdfjs': ['pdfjs-dist'],
              // Other document parsers
              'vendor-docx': ['mammoth', 'jszip'],
            }
          }
        }
      }
    };
});
