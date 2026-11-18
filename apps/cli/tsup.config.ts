import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { archa: 'src/index.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outExtension: () => ({ js: '.cjs' }),
  // Bundle everything (workspace sources included) into one file the app can spawn.
  noExternal: [/.*/],
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
});
