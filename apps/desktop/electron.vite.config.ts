import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Workspace packages ship TypeScript sources, so they are bundled instead of externalised.
const workspace = ['@archa/core', '@archa/schema', '@archa/formats', '@archa/protocol', '@archa/render', '@archa/icons'];

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: workspace },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'core-host': resolve(__dirname, 'src/core-host/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwind()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
});
