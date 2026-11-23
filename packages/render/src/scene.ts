import type { ArchaDocument } from '@archa/core';
import { FrameBitmapCache, zoomBucket } from './cache';
import { drawNode, type AnimMap } from './draw';
import { preloadImages } from './images';
import { paintImageSources } from './paint';
import { preloadFonts } from './fonts';
import { fontString } from './text';

export type Camera = { x: number; y: number; zoom: number };

/** Change animations for one frame: `live` = top-level ids whose subtree animates (drawn directly, not cached). */
export type PageFx = { anim: AnimMap; live: ReadonlySet<string> };

/**
 * Draws a page: top-level nodes from the bitmap cache when possible.
 * Top-level nodes with an animating subtree (`fx.live`) are drawn directly so the cache stays valid.
 */
export function drawPage(
  ctx: CanvasRenderingContext2D,
  doc: ArchaDocument,
  pageRootId: string,
  cam: Camera,
  cache: FrameBitmapCache,
  dpr: number,
  viewport: { width: number; height: number },
  fx?: PageFx | null,
): void {
  const bucket = zoomBucket(cam.zoom, dpr);
  const view = { x: -cam.x / cam.zoom, y: -cam.y / cam.zoom, w: viewport.width / cam.zoom, h: viewport.height / cam.zoom };
  ctx.save();
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
  ctx.imageSmoothingQuality = 'high';
  for (const node of doc.children(pageRootId)) {
    if (!node.visible) continue;
    // A turned box reaches past its own rect: cull by the circle around it.
    const m = node.rotation ? (Math.hypot(node.width, node.height) - Math.min(node.width, node.height)) / 2 : 0;
    if (node.x - m > view.x + view.w || node.y - m > view.y + view.h || node.x + node.width + m < view.x || node.y + node.height + m < view.y) continue;
    if (fx?.live.has(node.id)) { drawNode(ctx, doc, node, fx.anim); continue; }
    // The bitmap cache holds the upright box, so turned frames draw directly.
    const bmp = (node.type === 'frame' || node.type === 'group') && !node.rotation ? cache.get(doc, node.id, bucket) : null;
    if (bmp) ctx.drawImage(bmp, node.x, node.y, bmp.width / bucket, bmp.height / bucket);
    else drawNode(ctx, doc, node);
  }
  ctx.restore();
}

/** Renders one node to base64 PNG (agent screenshots, export). */
export function renderNodePng(doc: ArchaDocument, nodeId: string, scale: number): Promise<string> {
  return renderNodeImage(doc, nodeId, scale, 'png');
}

/** Renders one node to base64 PNG or JPEG. JPEG has no alpha, so it is drawn on white. */
export async function renderNodeImage(doc: ArchaDocument, nodeId: string, scale: number, format: 'png' | 'jpeg', quality = 0.92): Promise<string> {
  const canvas = await renderNodeCanvas(doc, nodeId, scale, format);
  return toBase64(await canvas.convertToBlob(format === 'png' ? { type: 'image/png' } : { type: 'image/jpeg', quality }));
}

/**
 * Renders a node once and cuts it into horizontal slices of `sliceHeight` output px (tall agent screenshots).
 * Slices are JPEG: they only go inline, where MCP replies must stay small (the full PNG is saved separately).
 */
export async function renderNodeSlices(doc: ArchaDocument, nodeId: string, scale: number, sliceHeight: number): Promise<string[]> {
  const full = await renderNodeCanvas(doc, nodeId, scale, 'jpeg');
  const out: string[] = [];
  for (let y = 0; y < full.height; y += sliceHeight) {
    const h = Math.min(sliceHeight, full.height - y);
    const c = new OffscreenCanvas(full.width, h);
    c.getContext('2d')!.drawImage(full, 0, y, full.width, h, 0, 0, full.width, h);
    out.push(await toBase64(await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })));
  }
  return out;
}

export async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A node drawn on its own canvas at `scale` (JPEG targets get a white backdrop), once its pictures and fonts are in. */
export async function renderNodeCanvas(doc: ArchaDocument, nodeId: string, scale: number, format: 'png' | 'jpeg' = 'png'): Promise<OffscreenCanvas> {
  const node = doc.require(nodeId);
  const nodes = [...doc.walk(nodeId)];
  await Promise.all([
    preloadImages(nodes.flatMap((n) => [...(n.type === 'image' ? [n.src] : []), ...('fills' in n ? paintImageSources(n) : [])]), doc),
    preloadFonts(nodes.flatMap((n) => (n.type === 'text' ? [fontString(n), ...n.spans.map((s) => fontString({ ...n, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) }))] : []))),
  ]);
  const w = Math.max(1, Math.round(node.width * scale));
  const h = Math.max(1, Math.round(node.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  if (format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.scale(scale, scale);
  ctx.translate(-node.x, -node.y);
  drawNode(ctx, doc, node);
  return canvas;
}
