import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dir = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const shared = dir('./src/shared');
const { version } = JSON.parse(readFileSync(dir('./package.json'), 'utf8')) as { version: string };
const define = { __APP_VERSION__: JSON.stringify(version) };

export default defineConfig({
  main: {
    define,
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
    define,
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    define,
    resolve: {
      alias: {
        '@shared': shared,
        '@': dir('./src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
    worker: { format: 'es' },
  },
});
