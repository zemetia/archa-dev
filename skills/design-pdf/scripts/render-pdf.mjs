#!/usr/bin/env node
// HTML → PDF with the installed Chrome/Edge, plus PNG previews of every page to look at.
//   node render-pdf.mjs <in.html> <out.pdf> [--preview] [--dpi 50]
// The HTML owns the page size and margins through @page (Chrome honours preferCSSPageSize).
// --preview runs `pdftoppm` (poppler) and writes <out>-page-N.png next to the PDF.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(`--${k}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };
const preview = flag('preview'); const dpi = String(flag('dpi') ?? 50);
const [input, output] = args;
if (!input || !output) { console.error('usage: node render-pdf.mjs <in.html> <out.pdf> [--preview] [--dpi 50]'); process.exit(1); }

const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
if (!browser) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(1); }

const out = resolve(output);
// virtual-time-budget lets web fonts and images finish loading before printing.
execFileSync(browser, ['--headless=new', '--no-pdf-header-footer', '--virtual-time-budget=8000',
  `--print-to-pdf=${out}`, pathToFileURL(resolve(input)).href], { stdio: 'ignore' });
console.log(out);

if (preview) {
  const prefix = `${out.replace(/\.pdf$/i, '')}-page`;
  try {
    execFileSync('pdftoppm', ['-png', '-r', dpi, out, prefix], { stdio: 'ignore' });
    const base = basename(prefix);
    for (const f of readdirSync(dirname(out)).filter((f) => f.startsWith(base) && f.endsWith('.png')).sort()) console.log(resolve(dirname(out), f));
    console.log('Now LOOK at every page image.');
  } catch {
    console.log('pdftoppm not found (install poppler) — open the PDF and check every page by eye.');
  }
}
