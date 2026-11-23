#!/usr/bin/env node
// Render Mermaid files (.mmd) to SVG or PNG with the installed Chrome/Edge (no Chromium download).
//   node render-mermaid.mjs <file.mmd ...> [--png] [--out dir]
// Uses `npx @mermaid-js/mermaid-cli` (fetched on first run) with a puppeteer config that points at
// the system browser. A syntax error prints Mermaid's message and exits 1.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const png = args.includes('--png');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : '.';
const files = args.filter((a, i) => !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));
if (!files.length) { console.error('usage: node render-mermaid.mjs <file.mmd ...> [--png] [--out dir]'); process.exit(1); }

const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
if (!browser) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(1); }

const cfg = join(tmpdir(), `mmdc-puppeteer-${process.pid}.json`);
writeFileSync(cfg, JSON.stringify({ executablePath: browser, args: ['--no-sandbox'] }));   // JSON.stringify escapes Windows paths
mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const f of files) {
  const out = resolve(outDir, basename(f).replace(/\.mmd$/i, png ? '.png' : '.svg'));
  try {
    // npx is a .cmd on Windows, so it has to go through a shell: quote every argument (paths may contain spaces).
    const q = (a) => `"${a}"`;
    execSync(['npx', '-y', '@mermaid-js/mermaid-cli', '-p', q(cfg), '-i', q(resolve(f)), '-o', q(out), '-b', 'white', ...(png ? ['-s', '2'] : [])].join(' '),
      { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(out);
  } catch (e) {
    failed++;
    console.error(`FAILED ${f}\n${String(e.stderr || e.message).split('\n').filter((l) => /error|expect|parse/i.test(l)).slice(0, 6).join('\n')}`);
  }
}
rmSync(cfg, { force: true });
if (failed) process.exit(1);
console.log('Now LOOK at the images: readable labels, no tangled lines, under ~20 nodes per diagram.');
