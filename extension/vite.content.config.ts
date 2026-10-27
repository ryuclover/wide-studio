import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({ build: {
  outDir: 'dist', emptyOutDir: false,
  lib: { entry: resolve(__dirname, 'src/content/contentScript.ts'), name: 'WideStudioContent', formats: ['iife'], fileName: () => 'content/contentScript.js' },
  rollupOptions: { output: { inlineDynamicImports: true } }
} });
