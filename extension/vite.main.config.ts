import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/mainBridgeEntry.ts'),
      name: 'WideStudioMainBridge',
      formats: ['iife'],
      fileName: () => 'content/mainBridgeEntry.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
