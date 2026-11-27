import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { storeBytes, assetFile } from '@archa/protocol/node';

/*
 * "Rebuild from a reference" (blueprint MCP/05 → Reference): read a PDF page the way a designer measures a
 * mockup — every text line with its position, size and font, every filled/stroked shape (rects, rounded
 * rects with their radius, other paths as SVG data), every placed image — so an agent builds from numbers,
 * not from guessing at a screenshot. Runs in the core host with pdf.js (no canvas); text colours come from
 * the renderer, which samples a raster of the page (Type3 fonts keep colour inside their glyphs).
 */

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDoc = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;
type Mat = [number, number, number, number, number, number];
type ClipBox = { x: number; y: number; w: number; h: number; radius: number };

export type RefText = { text: string; x: number; y: number; baseline: number; width: number; fontSize: number; font: string; color?: string };
export type RefShape = { kind: 'rect' | 'rounded-rect' | 'ellipse' | 'path'; x: number; y: number; width: number; height: number; fill?: string; stroke?: string; strokeWidth?: number; radius?: number; d?: string };
export type RefImage = { x: number; y: number; width: number; height: number; pixelWidth: number; pixelHeight: number; src: string; file: string };
export type RefPage = { page: number; pages: number; width: number; height: number; texts: RefText[]; shapes: RefShape[]; images: RefImage[] };

let pdfjs: Promise<Pdfjs> | null = null;
/**
 * In Electron's utility process pdf.js does not take itself for Node and asks for a worker script; with no
 * Worker available it then runs that script in-process (its "fake worker"). Point it at the legacy build.
 */
const load = () => (pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((lib) => {
  const req = createRequire(typeof __filename === 'string' ? __filename : import.meta.url);
  lib.GlobalWorkerOptions.workerSrc = pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  return lib;
}));
const docs = new Map<string, Promise<PdfDoc>>();

async function openPdf(path: string): Promise<PdfDoc> {
  const key = `${path}|${statSync(path).mtimeMs}`;
  let d = docs.get(key);
  if (!d) {
    const lib = await load();
    d = lib.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
    docs.set(key, d);
  }
  return d;
}

const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Minimal PNG encoder for decoded PDF images (1, 3 or 4 bytes per pixel). */
export function encodePng(width: number, height: number, data: Uint8Array | Uint8ClampedArray, channels: 1 | 3 | 4): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = channels === 1 ? 0 : channels === 3 ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = width * channels;
  const raw = Buffer.alloc((row + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * row, row).copy(raw, y * (row + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Path data → SVG d (page px), and what the path is when it is a simple box: an axis-aligned rect, a rounded
 * rect (corners drawn as one or more curves each — radius = the corner's extent) or an ellipse.
 */
function classify(cmds: Array<[string, number[]]>, box: { x: number; y: number; w: number; h: number }): Pick<RefShape, 'kind' | 'radius' | 'd'> {
  const d = cmds.map(([k, p]) => `${k}${p.map(r1).join(' ')}`).join('');
  const moves = cmds.filter((c) => c[0] === 'M').length;
  const lines = cmds.filter((c) => c[0] === 'L').length, curves = cmds.filter((c) => c[0] === 'C').length;
  if (moves !== 1 || cmds.some((c) => c[0] === 'Q') || lines > 4) return { kind: 'path', d };
  const end = (i: number) => cmds[i]![1].slice(-2) as [number, number];
  // Every straight side must be horizontal or vertical.
  for (let i = 1; i < cmds.length; i++) {
    if (cmds[i]![0] !== 'L') continue;
    const [x0, y0] = end(i - 1), [x1, y1] = end(i);
    if (Math.abs(x1 - x0) > 0.05 && Math.abs(y1 - y0) > 0.05) return { kind: 'path', d };
  }
  if (curves === 0) return lines >= 3 ? { kind: 'rect' } : { kind: 'path', d };
  if (lines === 0 && curves % 4 === 0) return { kind: 'ellipse' };
  if (curves % 4 !== 0) return { kind: 'path', d };
  // The first run of curves is one corner; its extent on the shorter axis is the radius.
  const first = cmds.findIndex((c) => c[0] === 'C');
  let last = first;
  while (cmds[last + 1]?.[0] === 'C') last++;
  const [sx, sy] = end(first - 1), [ex, ey] = end(last);
  const radius = Math.min(Math.abs(ex - sx), Math.abs(ey - sy));
  if (radius <= 0 || radius > Math.min(box.w, box.h) / 2 + 0.5) return { kind: 'path', d };
  return { kind: 'rounded-rect', radius: r1(radius) };
}

/** Reads one PDF page. Images are written into the document's asset folder (`images/`, content-addressed). */
export async function readPdfPage(path: string, pageNo: number, assetDir: string): Promise<RefPage> {
  const lib = await load();
  const pdf = await openPdf(path);
  if (pageNo < 1 || pageNo > pdf.numPages) throw new Error(`Page ${pageNo} does not exist — the PDF has ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`);
  const page = await pdf.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const base = vp.transform as Mat;

  // Text: pdf.js items → lines (same baseline and size, close together).
  const tc = await page.getTextContent();
  const items = tc.items.flatMap((it) => {
    if (!('str' in it) || !it.str) return [];
    const m = mul(base, it.transform as Mat);
    const fontSize = Math.hypot(m[2], m[3]);
    return [{ str: it.str, x: m[4], baseline: m[5], width: it.width * (fontSize / Math.max(1e-6, Math.hypot(it.transform[2]!, it.transform[3]!))), fontSize, font: it.fontName }];
  });
  items.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const texts: RefText[] = [];
  let broken = false;
  for (const it of items) {
    const last = texts.at(-1);
    // A space item wider than a word space is layout (nav gaps, columns), not text: it ends the line.
    if (!it.str.trim()) { if (it.width > it.fontSize * 0.6) broken = true; else if (last && !broken) last.text += ' '; continue; }
    if (last && !broken && Math.abs(last.baseline - it.baseline) < it.fontSize * 0.2 && Math.abs(last.fontSize - it.fontSize) < 0.5 && it.x - (last.x + last.width) < it.fontSize * 0.8 && it.x >= last.x) {
      const gap = it.x - (last.x + last.width);
      last.text += (gap > it.fontSize * 0.15 && !last.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
      last.width = it.x + it.width - last.x;
    } else {
      texts.push({ text: it.str, x: it.x, y: it.baseline - it.fontSize * 0.8, baseline: it.baseline, width: it.width, fontSize: it.fontSize, font: it.font });
    }
    broken = false;
  }
  for (const t of texts) { t.text = t.text.trim(); t.x = r1(t.x); t.y = r1(t.y); t.baseline = r1(t.baseline); t.width = r1(t.width); t.fontSize = r1(t.fontSize); }

  // Shapes and images: walk the operator list with the transform stack.
  const ol = await page.getOperatorList();
  const O = lib.OPS;
  const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };
  const FILL = new Set([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
  const STROKE = new Set([O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  let fill = '#000000', stroke = '#000000', lineWidth = 1, fillAlpha = 1, strokeAlpha = 1;
  // The innermost clip that is a rounded box: a plain rect filled inside it is really that rounded box.
  let clip: ClipBox | null = null;
  const stack: Array<{ ctm: Mat; fill: string; stroke: string; lineWidth: number; fillAlpha: number; strokeAlpha: number; clip: ClipBox | null }> = [];
  const withAlpha = (hex: string, a: number) => (a >= 0.999 ? hex : `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`);
  const shapes: RefShape[] = [];
  const images: RefImage[] = [];
  const seenImages = new Map<string, { src: string; file: string }>();
  const area = vp.width * vp.height;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]!, args = ol.argsArray[i] as unknown[];
    if (fn === O.save) stack.push({ ctm, fill, stroke, lineWidth, fillAlpha, strokeAlpha, clip });
    else if (fn === O.restore) { const s = stack.pop(); if (s) ({ ctm, fill, stroke, lineWidth, fillAlpha, strokeAlpha, clip } = s); }
    else if (fn === O.setGState) {
      for (const [k, v] of (args[0] as Array<[string, unknown]>) ?? []) {
        if (k === 'ca') fillAlpha = Number(v);
        else if (k === 'CA') strokeAlpha = Number(v);
        else if (k === 'LW') lineWidth = Number(v);
      }
    }
    else if (fn === O.transform) ctm = mul(ctm, args as Mat);
    else if (fn === O.setFillRGBColor) fill = String(args[0]);
    else if (fn === O.setStrokeRGBColor) stroke = String(args[0]);
    else if (fn === O.setLineWidth) lineWidth = Number(args[0]);
    else if (fn === O.constructPath) {
      const [paint, paths] = args as [number, ArrayLike<number>[]];
      const isFill = FILL.has(paint), isStroke = STROKE.has(paint);
      const m = mul(base, ctm);
      const cmds: Array<[string, number[]]> = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const pt = (x: number, y: number) => { const p = apply(m, x, y); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); return p; };
      for (const data of paths ?? []) {
        for (let k = 0; k < data.length;) {
          const op = data[k++]!;
          if (op === DRAW.moveTo) cmds.push(['M', pt(data[k++]!, data[k++]!)]);
          else if (op === DRAW.lineTo) cmds.push(['L', pt(data[k++]!, data[k++]!)]);
          else if (op === DRAW.curveTo) cmds.push(['C', [...pt(data[k++]!, data[k++]!), ...pt(data[k++]!, data[k++]!), ...pt(data[k++]!, data[k++]!)]]);
          else if (op === DRAW.quadraticCurveTo) cmds.push(['Q', [...pt(data[k++]!, data[k++]!), ...pt(data[k++]!, data[k++]!)]]);
          else if (op === DRAW.closePath) cmds.push(['Z', []]);
          else break;
        }
      }
      if (!cmds.length || !Number.isFinite(minX)) continue;
      const box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      const kind = classify(cmds, box);
      if (!isFill && !isStroke) { // a clipping path
        clip = kind.kind === 'rounded-rect' ? { ...box, radius: kind.radius! } : kind.kind === 'rect' ? null : clip;
        continue;
      }
      if (box.w * box.h > area * 0.98) continue; // the page background
      const inClip = clip && kind.kind === 'rect' && Math.abs(clip.x - box.x) < 1.5 && Math.abs(clip.y - box.y) < 1.5 && Math.abs(clip.w - box.w) < 1.5 && Math.abs(clip.h - box.h) < 1.5;
      const shape: RefShape = { ...(inClip ? { kind: 'rounded-rect' as const, radius: clip!.radius } : kind), x: r1(box.x), y: r1(box.y), width: r1(box.w), height: r1(box.h) };
      if (isFill) shape.fill = withAlpha(fill, fillAlpha);
      if (isStroke) { shape.stroke = withAlpha(stroke, strokeAlpha); shape.strokeWidth = r1(lineWidth * Math.hypot(m[0], m[1])); }
      shapes.push(shape);
    } else if (fn === O.paintImageXObject) {
      const id = String(args[0]);
      const m = mul(base, ctm);
      const corners = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
      let saved = seenImages.get(id);
      if (!saved) {
        const obj = await new Promise<{ width: number; height: number; kind?: number; data?: Uint8ClampedArray }>((res) => page.objs.get(id, res as never));
        if (!obj?.data) continue;
        const channels = obj.kind === 1 ? 1 : obj.kind === 2 ? 3 : 4;
        const png = encodePng(obj.width, obj.height, channels === 1 ? expandGray(obj.data, obj.width, obj.height) : obj.data, channels === 1 ? 1 : channels);
        const src = storeBytes(assetDir, png, 'png');
        saved = { src, file: assetFile(assetDir, src)! };
        seenImages.set(id, saved);
      }
      images.push({ x: r1(Math.min(...xs)), y: r1(Math.min(...ys)), width: r1(Math.max(...xs) - Math.min(...xs)), height: r1(Math.max(...ys) - Math.min(...ys)), pixelWidth: Number(args[1]), pixelHeight: Number(args[2]), ...saved });
    }
  }
  return { page: pageNo, pages: pdf.numPages, width: vp.width, height: vp.height, texts, shapes, images };
}

/** pdf.js 1-bit images arrive packed; spread them to one byte per pixel. */
function expandGray(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  if (data.length >= w * h) return new Uint8Array(data.buffer, data.byteOffset, w * h);
  const out = new Uint8Array(w * h);
  const row = Math.ceil(w / 8);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = (data[y * row + (x >> 3)]! >> (7 - (x & 7))) & 1 ? 255 : 0;
  return out;
}

/** What an agent reads first: size, palette, type scale, the text lines, images and big shapes. */
export function summarizePage(p: RefPage, files: { json: string; png?: string }): string {
  const palette = new Map<string, number>();
  for (const s of p.shapes) if (s.fill) palette.set(s.fill, (palette.get(s.fill) ?? 0) + s.width * s.height);
  const textColors = new Map<string, number>();
  for (const t of p.texts) if (t.color) textColors.set(t.color, (textColors.get(t.color) ?? 0) + t.text.length);
  const sizes = new Map<number, { n: number; sample: string }>();
  for (const t of p.texts) { const e = sizes.get(t.fontSize) ?? { n: 0, sample: t.text }; e.n++; sizes.set(t.fontSize, e); }
  const top = <K>(m: Map<K, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  const boxes = p.shapes.filter((s) => s.kind !== 'path' && s.width * s.height > 2000).sort((a, b) => a.y - b.y);
  const lines = [
    `Page ${p.page}/${p.pages}: ${p.width}×${p.height} px. ${p.texts.length} text lines, ${p.shapes.length} shapes, ${p.images.length} images.`,
    `Full data (every line, shape with SVG path, image): ${files.json}${files.png ? `\nPage raster: ${files.png}` : ''}`,
    `Fill palette by area: ${top(palette, 12).join(' ') || '—'}`,
    `Text colours by use: ${top(textColors, 8).join(' ') || '(not sampled)'}`,
    `Type scale (size × lines, sample): ${[...sizes].sort((a, b) => b[0] - a[0]).slice(0, 14).map(([s, e]) => `${s}px×${e.n} "${e.sample.slice(0, 24)}"`).join(' · ')}`,
    `Images (use image("<file>") or src "<asset>" — already in this document's asset folder):`,
    ...p.images.slice(0, 40).map((im) => `  ${im.x},${im.y} ${im.width}×${im.height} (${im.pixelWidth}×${im.pixelHeight} px) ${im.src}`),
    `Boxes (rects/rounded rects ≥ 2000 px², top to bottom):`,
    ...boxes.slice(0, 60).map((s) => `  ${s.kind} ${s.x},${s.y} ${s.width}×${s.height}${s.radius ? ` r${s.radius}` : ''}${s.fill ? ` fill ${s.fill}` : ''}${s.stroke ? ` stroke ${s.stroke} ${s.strokeWidth}` : ''}`),
    `Text lines (x,y top-left, size, colour):`,
    ...p.texts.slice(0, 160).map((t) => `  ${t.x},${t.y} ${t.fontSize}px${t.color ? ` ${t.color}` : ''} "${t.text.slice(0, 90)}"`),
  ];
  if (p.texts.length > 160) lines.push(`  … ${p.texts.length - 160} more in the JSON file`);
  return lines.join('\n');
}

export const fileKey = (path: string) => createHash('sha256').update(`${path}|${statSync(path).mtimeMs}`).digest('hex').slice(0, 16);
