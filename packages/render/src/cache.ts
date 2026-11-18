import { contentHash, type ArchaDocument } from '@archa/core';
import { drawNode } from './draw';

type Entry = { key: string; canvas: OffscreenCanvas; bytes: number; lastUsed: number };

/**
 * Bitmap cache for top-level frames (blueprint CACHE/01, layer L4).
 * Key = subtreeHash + zoom bucket, so panning and unrelated edits never repaint a frame.
 */
export class FrameBitmapCache {
  private entries = new Map<string, Entry>();
  private bytes = 0;
  private hashRevision = -1;
  private hashes = new Map<string, string>();
  hits = 0;
  misses = 0;

  constructor(private budgetBytes = 256 * 1024 * 1024) {}

  /** Recomputes subtree hashes only when the document revision changed. */
  private hashFor(doc: ArchaDocument, id: string): string {
    if (this.hashRevision !== doc.revision) {
      this.hashes.clear();
      this.hashRevision = doc.revision;
    }
    let h = this.hashes.get(id);
    if (!h) {
      h = contentHash(doc, id);
      this.hashes.set(id, h);
    }
    return h;
  }

  /** Returns a bitmap of the node at `bucket` scale, or null when too large to cache. */
  get(doc: ArchaDocument, nodeId: string, bucket: number): OffscreenCanvas | null {
    const node = doc.get(nodeId);
    if (!node) return null;
    const w = Math.ceil(node.width * bucket) + 2;
    const h = Math.ceil(node.height * bucket) + 2;
    if (w * h > 4096 * 4096 || w < 1 || h < 1) return null;
    const key = `${this.hashFor(doc, nodeId)}@${bucket}`;
    const hit = this.entries.get(nodeId);
    if (hit && hit.key === key) {
      hit.lastUsed = performance.now();
      this.hits++;
      return hit.canvas;
    }
    this.misses++;
    const canvas = hit && hit.canvas.width === w && hit.canvas.height === h ? hit.canvas : new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.scale(bucket, bucket);
    ctx.translate(-node.x, -node.y);
    drawNode(ctx, doc, node);
    if (hit) this.bytes -= hit.bytes;
    const entry = { key, canvas, bytes: w * h * 4, lastUsed: performance.now() };
    this.entries.set(nodeId, entry);
    this.bytes += entry.bytes;
    this.evict();
    return canvas;
  }

  private evict() {
    if (this.bytes <= this.budgetBytes) return;
    const lru = [...this.entries].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id, e] of lru) {
      if (this.bytes <= this.budgetBytes * 0.8) break;
      this.entries.delete(id);
      this.bytes -= e.bytes;
    }
  }

  /** Forget memoised hashes, e.g. while the mirror is mutated during a drag preview. */
  invalidate() {
    this.hashRevision = -1;
  }

  stats() {
    return { entries: this.entries.size, mb: Math.round(this.bytes / 1048576), hits: this.hits, misses: this.misses };
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

/** Power-of-two zoom bucket so small zoom changes reuse bitmaps (blueprint CACHE/02). */
export const zoomBucket = (zoom: number, dpr: number) => {
  const z = zoom * dpr;
  return Math.min(8, Math.max(1 / 16, 2 ** Math.ceil(Math.log2(z))));
};
