import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { PDFDocument } from 'pdf-lib';

/*
 * PDF export (blueprint RENDERING/03): the core's self-contained HTML page of each node is loaded in a
 * hidden window and printed by Chromium, one page sized to the node. Text stays selectable and
 * shapes stay vector. Several nodes become one file: each is printed alone (so every page keeps its
 * own size) and the pages are joined with pdf-lib. Written to a temp file because big data: URLs do
 * not navigate reliably.
 */
export type PdfPage = { html: string; width: number; height: number };

export async function printPagesToPdf(pages: PdfPage[], out: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'archa-pdf-'));
  try {
    const printed: Uint8Array[] = [];
    for (const [i, p] of pages.entries()) printed.push(await printOne(p, join(dir, `page-${i}.html`)));
    if (printed.length === 1) { await writeFile(out, printed[0]!); return; }
    const merged = await PDFDocument.create();
    for (const bytes of printed) {
      const src = await PDFDocument.load(bytes);
      for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
    }
    await writeFile(out, await merged.save());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function printOne({ html, width, height }: PdfPage, file: string): Promise<Uint8Array> {
  const page = `@page { size: ${width}px ${height}px; margin: 0; } html, body { width: ${width}px; height: ${height}px; overflow: hidden; }`;
  await writeFile(file, html.replace('</head>', `<style>${page}</style>\n</head>`));
  const win = new BrowserWindow({ show: false, width: Math.ceil(width), height: Math.ceil(height), webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await win.loadFile(file);
    // Web fonts (Inter from Google Fonts) must be in before printing, or Chromium prints the fallback.
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true).catch(() => true);
    return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    win.destroy();
  }
}
