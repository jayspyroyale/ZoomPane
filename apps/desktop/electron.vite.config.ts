import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dir = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const shared = dir('./src/shared');

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
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
