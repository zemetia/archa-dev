import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'tsup';

const require = createRequire(import.meta.url);
/** QuickJS's release-sync variant (what `getQuickJS()` loads), resolved the way quickjs-emscripten does. */
const quickjsVariant = dirname(require.resolve('@jitl/quickjs-wasmfile-release-sync/package.json', { paths: [require.resolve('quickjs-emscripten')] }));

export default defineConfig({
  entry: { archa: 'src/index.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outExtension: () => ({ js: '.cjs' }),
  // Bundle everything (workspace sources included) into one file the app can spawn. pdf.js stays
  // outside: it is ESM-only and loads its own worker file; headless PDF references need it installed.
  noExternal: [/^(?!pdfjs-dist)/],
  external: ['pdfjs-dist'],
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  // The headless core's `execute` sandbox. QuickJS's dynamic import would pick the ESM build, which needs
  // import.meta (empty in CJS); the CJS build loads its wasm from __dirname, so the wasm ships next to the bundle.
  esbuildOptions: (o) => {
    o.alias = { ...o.alias, '@jitl/quickjs-wasmfile-release-sync/emscripten-module': join(quickjsVariant, 'dist/emscripten-module.cjs') };
  },
  onSuccess: async () => {
    copyFileSync(join(quickjsVariant, 'dist/emscripten-module.wasm'), 'dist/emscripten-module.wasm');
  },
});
