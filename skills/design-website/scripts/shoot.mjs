#!/usr/bin/env node
// Screenshot a page at real phone / tablet / desktop widths with the installed Chrome or Edge.
//   node shoot.mjs <url|file.html> [outDir] [--widths 390,768,1440] [--height 2400]
// Headless Chrome will not make a window narrower than ~500px, so every width is rendered
// inside an iframe of exactly that width. The PNGs are what you look at for QA.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : d; };
const widths = opt('widths', '390,768,1440').split(',').map(Number);
const height = Number(opt('height', '2400'));
const [target, outDir = '.'] = args;
if (!target) { console.error('usage: node shoot.mjs <url|file.html> [outDir] [--widths 390,768,1440] [--height 2400]'); process.exit(1); }

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(1); }

const url = /^[a-z]+:\/\//i.test(target) ? target : pathToFileURL(resolve(target)).href;
mkdirSync(outDir, { recursive: true });
const tmp = join(tmpdir(), `shoot-${process.pid}.html`);
for (const w of widths) {
  writeFileSync(tmp, `<html><body style="margin:0;background:#fff"><iframe src="${url}" style="width:${w}px;height:${height}px;border:0;display:block"></iframe></body></html>`);
  const out = resolve(outDir, `shot-${w}.png`);
  execFileSync(browser, ['--headless=new', '--hide-scrollbars', '--virtual-time-budget=5000',
    `--window-size=${Math.max(w, 600)},${height}`, `--screenshot=${out}`, pathToFileURL(tmp).href], { stdio: 'ignore' });
  console.log(out);
}
rmSync(tmp, { force: true });
console.log('Now LOOK at each PNG (the area right of the page width is empty on narrow shots).');
