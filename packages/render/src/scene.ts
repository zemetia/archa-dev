import type { ArchaDocument } from '@archa/core';
import { FrameBitmapCache, zoomBucket } from './cache';
import { drawNode } from './draw';
import { preloadImages } from './images';

export type Camera = { x: number; y: number; zoom: number };

/**
 * Draws a page: top-level nodes from the bitmap cache when possible.
 * `live` ids (being dragged) are drawn directly with an offset so the cache stays valid.
 */
export function drawPage(
  ctx: CanvasRenderingContext2D,
  doc: ArchaDocument,
  pageRootId: string,
  cam: Camera,
  cache: FrameBitmapCache,
  dpr: number,
  viewport: { width: number; height: number },
): void {
  const bucket = zoomBucket(cam.zoom, dpr);
  const view = { x: -cam.x / cam.zoom, y: -cam.y / cam.zoom, w: viewport.width / cam.zoom, h: viewport.height / cam.zoom };
  ctx.save();
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
  ctx.imageSmoothingQuality = 'high';
  for (const node of doc.children(pageRootId)) {
    if (!node.visible) continue;
    if (node.x > view.x + view.w || node.y > view.y + view.h || node.x + node.width < view.x || node.y + node.height < view.y) continue;
    const bmp = node.type === 'frame' || node.type === 'group' ? cache.get(doc, node.id, bucket) : null;
    if (bmp) ctx.drawImage(bmp, node.x, node.y, bmp.width / bucket, bmp.height / bucket);
    else drawNode(ctx, doc, node);
  }
  ctx.restore();
}

/** Renders one node to a PNG data URL (agent screenshots, export). */
export async function renderNodePng(doc: ArchaDocument, nodeId: string, scale: number): Promise<string> {
  const node = doc.require(nodeId);
  await preloadImages([...doc.walk(nodeId)].flatMap((n) => (n.type === 'image' ? [n.src] : [])));
  const w = Math.max(1, Math.round(node.width * scale));
  const h = Math.max(1, Math.round(node.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(-node.x, -node.y);
  drawNode(ctx, doc, node);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
