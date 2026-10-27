import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

function copyManifestPlugin() {
  return {
    name: 'copy-manifest',
    closeBundle() {
      const manifestSrc = resolve(__dirname, 'manifest.json');
      const manifestDest = resolve(__dirname, 'dist/manifest.json');
      if (existsSync(manifestSrc)) {
        copyFileSync(manifestSrc, manifestDest);
      }
      mkdirSync(resolve(__dirname, 'dist/content'), { recursive: true });
      copyFileSync(resolve(__dirname, 'src/content/editor.css'), resolve(__dirname, 'dist/content/editor.css'));
    }
  };
}

export default defineConfig({
  plugins: [preact(), copyManifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        assistant: resolve(__dirname, 'assistant.html'),
        drive: resolve(__dirname, 'drive.html'),
        extract: resolve(__dirname, 'extract.html'),
        serviceWorker: resolve(__dirname, 'src/background/serviceWorker.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'serviceWorker') {
            return 'background/serviceWorker.js';
          }
          if (chunkInfo.name === 'contentScript') {
            return 'content/contentScript.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
