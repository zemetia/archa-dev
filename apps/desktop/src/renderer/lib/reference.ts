import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ArchaDocument } from '@archa/core';
import { renderNodeCanvas, toBase64 } from '@archa/render';
import type { CompareRegion, CompareStats } from '@archa/protocol';

/*
 * Reference images for "rebuild from a reference" (blueprint MCP/05): rasterise a PDF page or an image,
 * sample the ink colour of text boxes (the core host reads text and shapes; Type3 fonts hide their colour
 * inside glyphs), and diff a rendered node against the reference.
 */

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Raster = HTMLCanvasElement | OffscreenCanvas;
const pdfs = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();

const isPdf = (url: string) => /\.pdf$/i.test(decodeURIComponent(url));

async function loadPdf(url: string) {
  let p = pdfs.get(url);
  if (!p) {
    p = fetch(url).then((r) => r.arrayBuffer()).then((data) => pdfjs.getDocument({ data: new Uint8Array(data) }).promise);
    pdfs.set(url, p);
    p.catch(() => pdfs.delete(url));
  }
  return p;
}

/**
 * Rasters are cached (last three): a heavy PDF page — soft masks, PostScript-function gradients that
 * pdf.js evaluates in JS — can take a minute, and an agent calls reference once and compare many times.
 */
const rasters = new Map<string, Promise<Raster>>();
function rasterise(url: string, page: number, scale: number, width?: number): Promise<Raster> {
  const key = `${url}|${page}|${width ?? `x${scale}`}`;
  let r = rasters.get(key);
  if (!r) {
    r = rasteriseNow(url, page, scale, width);
    rasters.set(key, r);
    r.catch(() => rasters.delete(key));
    while (rasters.size > 3) rasters.delete(rasters.keys().next().value!);
  }
  return r;
}

/** A PDF page at `scale`, or an image scaled to `width` (when given) / its natural size. */
async function rasteriseNow(url: string, page: number, scale: number, width?: number): Promise<Raster> {
  if (isPdf(url)) {
    const pdf = await loadPdf(url);
    const pg = await pdf.getPage(page);
    const base = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: width ? width / base.width : scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await pg.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    return canvas;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const w = width ?? Math.round(img.naturalWidth * scale);
  const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return c;
}

const pixels = (c: Raster) => (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

async function toJpeg(c: OffscreenCanvas): Promise<string> {
  return toBase64(await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }));
}

async function toPng(c: Raster): Promise<string> {
  if (c instanceof OffscreenCanvas) return toBase64(await c.convertToBlob({ type: 'image/png' }));
  return c.toDataURL('image/png').split(',')[1]!;
}

/**
 * The ink of each box: the colour that stands out most from the box's background (its most common edge
 * colour), averaged over the pixels that clearly belong to it — anti-aliased edges are ignored.
 */
function sampleInk(img: ImageData, box: { x: number; y: number; w: number; h: number }, scale: number): string | null {
  const x0 = Math.max(0, Math.floor(box.x * scale)), y0 = Math.max(0, Math.floor(box.y * scale));
  const x1 = Math.min(img.width, Math.ceil((box.x + box.w) * scale)), y1 = Math.min(img.height, Math.ceil((box.y + box.h) * scale));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const at = (x: number, y: number) => { const i = (y * img.width + x) * 4; return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!] as const; };
  const counts = new Map<string, number>();
  for (let x = x0; x < x1; x++) for (const y of [y0, y1 - 1]) { const [r, g, b] = at(x, y); const k = `${r >> 4},${g >> 4},${b >> 4}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const bgKey = [...counts].sort((a, b) => b[1] - a[1])[0]![0].split(',').map((v) => Number(v) * 16 + 8);
  const dist = (p: readonly number[]) => Math.abs(p[0]! - bgKey[0]!) + Math.abs(p[1]! - bgKey[1]!) + Math.abs(p[2]! - bgKey[2]!);
  let max = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) max = Math.max(max, dist(at(x, y)));
  if (max < 40) return null;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = at(x, y);
    if (dist(p) >= max * 0.92) { r += p[0]; g += p[1]; b += p[2]; n++; }
  }
  return n ? hex(r / n, g / n, b / n) : null;
}

export async function referenceRaster(url: string, page: number, scale: number, boxes: Array<{ x: number; y: number; w: number; h: number }>) {
  const c = await rasterise(url, page, scale);
  const img = pixels(c);
  return { png: await toPng(c), colors: boxes.map((b) => sampleInk(img, b, scale)) };
}

/** Pixel diff of a node (rendered at `scale`) against a reference fitted to the same width. */
export async function compareToReference(doc: ArchaDocument, nodeId: string, url: string, page: number, scale: number, sliceHeight: number) {
  const design = await renderNodeCanvas(doc, nodeId, scale);
  const ref = await rasterise(url, page, scale, design.width);
  const W = design.width, H = Math.min(design.height, ref.height);
  const a = (design.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(0, 0, W, H);
  const b = (ref.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, W, H);
  const out = new ImageData(W, H);
  const BAND = Math.max(8, Math.round(24 * scale));
  const bands: Array<{ n: number; x0: number; x1: number }> = Array.from({ length: Math.ceil(H / BAND) }, () => ({ n: 0, x0: W, x1: 0 }));
  let mismatched = 0, total = 0;
  for (let y = 0; y < H; y++) {
    const band = bands[Math.floor(y / BAND)]!;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Transparent design pixels read as white (the page behind them).
      const aa = a.data[i + 3]! / 255;
      const dr = Math.abs(a.data[i]! * aa + 255 * (1 - aa) - b.data[i]!), dg = Math.abs(a.data[i + 1]! * aa + 255 * (1 - aa) - b.data[i + 1]!), db = Math.abs(a.data[i + 2]! * aa + 255 * (1 - aa) - b.data[i + 2]!);
      const d = Math.max(dr, dg, db);
      total += d;
      const gray = 0.299 * b.data[i]! + 0.587 * b.data[i + 1]! + 0.114 * b.data[i + 2]!;
      const faded = gray * 0.35 + 255 * 0.65;
      if (d > 48) {
        mismatched++;
        band.n++;
        band.x0 = Math.min(band.x0, x);
        band.x1 = Math.max(band.x1, x);
        const t = Math.min(1, d / 160);
        out.data[i] = faded * (1 - t) + 225 * t; out.data[i + 1] = faded * (1 - t) + 48 * t; out.data[i + 2] = faded * (1 - t) + 68 * t;
      } else {
        out.data[i] = faded; out.data[i + 1] = faded; out.data[i + 2] = faded;
      }
      out.data[i + 3] = 255;
    }
  }
  // Neighbouring bands with > 2 % mismatched pixels form a region; the worst regions come first.
  const regions: CompareRegion[] = [];
  let cur: CompareRegion | null = null;
  bands.forEach((bd, k) => {
    const ratio = bd.n / (W * BAND);
    if (ratio > 0.02) {
      const y0 = k * BAND, y1 = Math.min(H, (k + 1) * BAND);
      if (cur && cur.y1 === y0) { cur.y1 = y1; cur.x0 = Math.min(cur.x0, bd.x0); cur.x1 = Math.max(cur.x1, bd.x1); cur.mismatch += bd.n; }
      else { cur = { y0, y1, x0: bd.x0, x1: bd.x1, mismatch: bd.n }; regions.push(cur); }
    } else cur = null;
  });
  for (const r of regions) r.mismatch = Math.round((r.mismatch / (W * (r.y1 - r.y0))) * 1000) / 10;
  regions.sort((p, q) => q.mismatch * (q.y1 - q.y0) - p.mismatch * (p.y1 - p.y0));
  const unscale = (r: CompareRegion): CompareRegion => ({ y0: Math.round(r.y0 / scale), y1: Math.round(r.y1 / scale), x0: Math.round(r.x0 / scale), x1: Math.round(r.x1 / scale), mismatch: r.mismatch });
  const stats: CompareStats = {
    width: Math.round(W / scale), height: Math.round(design.height / scale), refHeight: Math.round(ref.height / scale),
    mismatch: Math.round((mismatched / (W * H)) * 1000) / 10, meanDiff: Math.round((total / (W * H)) * 10) / 10,
    regions: regions.slice(0, 12).map(unscale),
  };
  const canvas = new OffscreenCanvas(W, H);
  canvas.getContext('2d')!.putImageData(out, 0, 0);
  const slices: string[] = [];
  if (H > sliceHeight * 1.2) {
    for (let y = 0; y < H; y += sliceHeight) {
      const h = Math.min(sliceHeight, H - y);
      const c = new OffscreenCanvas(W, h);
      c.getContext('2d')!.drawImage(canvas, 0, y, W, h, 0, 0, W, h);
      slices.push(await toJpeg(c));
    }
  }
  return { stats, png: await toPng(canvas), slices };
}
