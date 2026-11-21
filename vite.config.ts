/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Plain multi-page Vite build. Static files in public/ (manifest.json, icons)
// are copied as-is into dist/. The background worker gets a fixed filename so
// the manifest can reference it.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(root, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    // Extensions load from disk, so bundle size matters far less than on the web.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        sidepanel: resolve(root, 'sidepanel.html'),
        options: resolve(root, 'options.html'),
        background: resolve(root, 'src/extension/background.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/chunk-[hash].js',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
