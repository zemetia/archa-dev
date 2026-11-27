import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, normalize } from 'node:path';
import type { z } from 'zod';
import { DocumentError, type ArchaDocument } from '@archa/core';
import { RPC, type CompareRegion, type CompareResult } from '@archa/protocol';
import { paths, docPaths, ensureDir, imageSize, fitBudget, INLINE_BUDGET, saveShot, SLICE_HEIGHT } from '@archa/protocol/node';
import { fileKey, readPdfPage, summarizePage } from './reference';
import { resolveRef, type Caller, type ToolHost } from './tool-host';

/*
 * MCP `reference` and `compare` (blueprint MCP/05): read a mockup into numbers, then measure how far the
 * build is from it. Reference files are staged into ARCHA_HOME/runtime/reference so the window can load them.
 */

export const referenceSchema = RPC['agent.reference'].params;
export const compareSchema = RPC['agent.compare'].params;

/** First raster of a heavy PDF page can take a minute or two; later ones come from the window's cache. */
const RASTER_TIMEOUT = 300_000;

const KINDS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

function referenceFile(raw: string): string {
  const path = normalize(raw.replace(/^file:\/\//i, ''));
  if (!isAbsolute(path)) throw new DocumentError('VALIDATION', `Reference path must be absolute (got "${raw}")`);
  if (!existsSync(path)) throw new DocumentError('NOT_FOUND', `No file at ${path}`);
  if (!KINDS.has(extname(path).toLowerCase())) throw new DocumentError('VALIDATION', 'A reference is a PDF, PNG, JPEG or WebP file');
  return path;
}

/** A copy the window may load (archa-asset:// serves ARCHA_HOME/runtime only, besides asset folders). */
function stage(path: string): string {
  const dir = ensureDir(paths.referenceStage());
  const dest = join(dir, `${fileKey(path)}${extname(path).toLowerCase()}`);
  if (!existsSync(dest)) copyFileSync(path, dest);
  return dest;
}
const fileUrl = (abs: string) => `archa-asset://file/${encodeURIComponent(abs)}`;

export async function readReference(ws: ToolHost, p: z.infer<typeof referenceSchema>, conn: Caller) {
  const s = ws.session(p.docId);
  const assetDir = ws.assetDir(s);
  const path = referenceFile(p.path);
  const page = p.page ?? 1;
  const dir = ensureDir(docPaths(ws.dataDir(s)).reference());
  const ext = extname(path).toLowerCase();
  ws.log(s.id, conn.author, 'reference', `Reference ${basename(path)}${ext === '.pdf' ? ` · page ${page}` : ''}`, [], conn.client.runId);
  if (ext !== '.pdf') {
    const size = imageSize(readFileSync(path));
    const copy = join(dir, basename(path));
    copyFileSync(path, copy);
    return { text: `Reference image ${size ? `${size.width}×${size.height}` : '(size unknown)'}: ${copy}\nOpen it to look; compare(node, "${path.replace(/\\/g, '/')}") diffs your build against it.` };
  }
  const data = await readPdfPage(path, page, assetDir);
  const stem = `${basename(path, ext).replace(/[^A-Za-z0-9_-]+/g, '-')}-p${page}`;
  const raster = await ws.askRenderer('render.reference', (requestId) => ({
    requestId, url: fileUrl(stage(path)), page, scale: 1, boxes: data.texts.map((t) => ({ x: t.x, y: t.y, w: t.width, h: t.fontSize })),
  }), RASTER_TIMEOUT);
  raster.colors?.forEach((c, i) => { if (c && data.texts[i]) data.texts[i]!.color = c; });
  const json = join(dir, `${stem}.json`);
  writeFileSync(json, `${JSON.stringify(data, null, 1)}\n`);
  let png: string | undefined;
  if (raster.png) { png = join(dir, `${stem}.png`); writeFileSync(png, Buffer.from(raster.png, 'base64')); }
  const text = summarizePage(data, { json, png }) + (raster.error ? `\n(Text colours not sampled: ${raster.error})` : '');
  return { text, json, png: p.images && raster.png && data.height <= 7680 && raster.png.length <= INLINE_BUDGET ? raster.png : undefined };
}

/** Names of the nodes a region covers most (deepest first), so the agent knows what to fix. */
function nodesIn(doc: ArchaDocument, rootId: string, reg: CompareRegion): string[] {
  const rb = doc.worldBounds(rootId);
  const R = { x0: rb.x + reg.x0, x1: rb.x + reg.x1, y0: rb.y + reg.y0, y1: rb.y + reg.y1 };
  const area = Math.max(1, (R.x1 - R.x0) * (R.y1 - R.y0));
  const hits: Array<{ name: string; score: number; depth: number }> = [];
  const walk = (id: string, depth: number) => {
    for (const c of doc.children(id)) {
      if (!c.visible) continue;
      const b = doc.worldBounds(c.id);
      const ox = Math.min(R.x1, b.x + b.width) - Math.max(R.x0, b.x), oy = Math.min(R.y1, b.y + b.height) - Math.max(R.y0, b.y);
      if (ox <= 0 || oy <= 0) continue;
      const overlap = ox * oy;
      if (b.width * b.height <= area * 6) hits.push({ name: c.name, score: overlap / area, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(rootId, 0);
  const seen = new Set<string>();
  return hits.sort((a, b) => b.score - a.score || b.depth - a.depth).filter((h) => !seen.has(h.name) && seen.add(h.name)).slice(0, 3).map((h) => h.name);
}

export async function compareReference(ws: ToolHost, p: z.infer<typeof compareSchema>, conn: Caller): Promise<CompareResult> {
  const s = ws.session(p.docId);
  const id = resolveRef(s, p.node);
  const path = referenceFile(p.reference);
  const scale = p.scale ?? 1;
  const r = await ws.askRenderer('render.compare', (requestId) => ({
    requestId, docId: s.id, nodeId: id, url: fileUrl(stage(path)), page: p.page ?? 1, scale, slice: SLICE_HEIGHT,
  }), RASTER_TIMEOUT);
  if (r.error || !r.stats) throw new DocumentError('CONFLICT', r.error ?? 'Compare failed');
  for (const reg of r.stats.regions) reg.nodes = nodesIn(s.doc, id, reg);
  const file = r.png ? saveShot(r.png, s.id, `${id}-diff`) : undefined;
  ws.log(s.id, conn.author, 'compare', `Compared "${s.doc.require(id).name}" with ${basename(path)}: ${r.stats.mismatch}% differs`, [id], conn.client.runId);
  const all = (r.slices ?? []).map((data, i) => ({ data, mime: 'image/jpeg' as const, y0: Math.round((i * SLICE_HEIGHT) / scale), y1: Math.round(Math.min(r.stats!.height * scale, (i + 1) * SLICE_HEIGHT) / scale) }));
  if (all.length) {
    const { kept, omitted } = fitBudget(all);
    return { stats: r.stats, path: file, slices: kept, ...(omitted ? { omitted } : {}) };
  }
  return { stats: r.stats, path: file, ...(r.png && r.png.length <= INLINE_BUDGET ? { png: r.png } : {}) };
}
