import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';

/*
 * PDF export (blueprint RENDERING/03): the core's self-contained HTML page of a node is loaded in a
 * hidden window and printed by Chromium, one page sized to the node. Text stays selectable and
 * shapes stay vector. Written to a temp file because big data: URLs do not navigate reliably.
 */
export async function printHtmlToPdf(html: string, width: number, height: number, out: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'archa-pdf-'));
  const file = join(dir, 'page.html');
  const page = `@page { size: ${width}px ${height}px; margin: 0; } html, body { width: ${width}px; height: ${height}px; overflow: hidden; }`;
  await writeFile(file, html.replace('</head>', `<style>${page}</style>\n</head>`));
  const win = new BrowserWindow({ show: false, width: Math.ceil(width), height: Math.ceil(height), webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await win.loadFile(file);
    // Web fonts (Inter from Google Fonts) must be in before printing, or Chromium prints the fallback.
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true).catch(() => true);
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    await writeFile(out, pdf);
  } finally {
    win.destroy();
    await rm(dir, { recursive: true, force: true });
  }
}
