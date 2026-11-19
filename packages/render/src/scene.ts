import type { ArchaDocument } from '@archa/core';
import { FrameBitmapCache, zoomBucket } from './cache';
import { drawNode, type AnimMap } from './draw';
import { preloadImages } from './images';

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
    if (node.x > view.x + view.w || node.y > view.y + view.h || node.x + node.width < view.x || node.y + node.height < view.y) continue;
    if (fx?.live.has(node.id)) { drawNode(ctx, doc, node, fx.anim); continue; }
    const bmp = node.type === 'frame' || node.type === 'group' ? cache.get(doc, node.id, bucket) : null;
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
  const node = doc.require(nodeId);
  await preloadImages([...doc.walk(nodeId)].flatMap((n) => (n.type === 'image' ? [n.src] : [])));
  const w = Math.max(1, Math.round(node.width * scale));
  const h = Math.max(1, Math.round(node.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  if (format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.scale(scale, scale);
  ctx.translate(-node.x, -node.y);
  drawNode(ctx, doc, node);
  const blob = await canvas.convertToBlob(format === 'png' ? { type: 'image/png' } : { type: 'image/jpeg', quality });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
