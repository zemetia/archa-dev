import { subtreeHash } from '@archa/core';
import type { Shot } from '@archa/protocol';
import { canvasFit, fitBudget, INLINE_BUDGET, INLINE_MAX_SIDE, MAX_SLICES, saveShot, SLICE_HEIGHT, SLICE_MIN_HEIGHT, SLICE_RATIO } from '@archa/protocol/node';
import type { HostContext } from './context';

/**
 * Full-size screenshot, written to a temporary file (no size cap). Returns `unchanged` when this
 * client already received the same subtree hash. The inline image is the full one, or a preview
 * scaled to INLINE_MAX_SIDE when the full one is larger than vision models accept.
 */
export async function takeScreenshot(ctx: HostContext, connId: string, docId: string, nodeId: string, scale: number, opts: { slices?: boolean }): Promise<Shot> {
  const s = ctx.session(docId);
  const node = s.doc.require(nodeId);
  const key = `${connId}:${s.id}:${nodeId}:${scale}`;
  const hash = subtreeHash(s.doc, nodeId);
  if (ctx.sentHashes.get(key) === hash) return { nodeId, name: node.name, unchanged: true };
  const fit = canvasFit(node.width, node.height, scale);
  const r = await ctx.requestRender(s.id, nodeId, fit);
  if (!r.png) return { nodeId, name: node.name, error: r.error };
  const width = Math.max(1, Math.round(node.width * fit));
  const height = Math.max(1, Math.round(node.height * fit));
  const path = saveShot(r.png, s.id, nodeId);
  // A tall page reads best as full-width pieces: no preview shrinks its text away.
  const tall = height > SLICE_MIN_HEIGHT && height / width > SLICE_RATIO;
  if (opts.slices ?? tall) {
    const sliceH = Math.max(SLICE_HEIGHT, Math.ceil(height / MAX_SLICES));
    const cut = await ctx.requestRender(s.id, nodeId, fit, sliceH);
    if (cut.slices?.length) {
      ctx.sentHashes.set(key, hash);
      const all = cut.slices.map((data, i) => ({ data, mime: 'image/jpeg' as const, y0: Math.round((i * sliceH) / fit), y1: Math.round(Math.min(height, (i + 1) * sliceH) / fit) }));
      const { kept, omitted } = fitBudget(all);
      return { nodeId, name: node.name, path, width, height, slices: kept, ...(omitted ? { omitted } : {}) };
    }
  }
  let png: string | undefined = r.png;
  let preview = false;
  if (Math.max(width, height) > INLINE_MAX_SIDE || r.png.length > INLINE_BUDGET) {
    // Past the vision limit or the reply budget: a preview inline, sized to fit both.
    const bySide = INLINE_MAX_SIDE / Math.max(width, height);
    const byBytes = Math.sqrt(INLINE_BUDGET / r.png.length) * 0.9;
    const small = await ctx.requestRender(s.id, nodeId, fit * Math.min(1, bySide, byBytes));
    png = small.png;
    preview = !!small.png;
  }
  ctx.sentHashes.set(key, hash);
  return { nodeId, name: node.name, png, path, width, height, preview };
}
