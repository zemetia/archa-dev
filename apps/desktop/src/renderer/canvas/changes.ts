import { drawNode, type NodeAnim, type PageFx } from '@archa/render';
import type { ArchaDocument } from '@archa/core';
import type { Author, Node, Op } from '@archa/schema';
import type { Camera } from '../lib/store';

/*
 * Change animations (blueprint RENDERING/02 → Change animations). When an agent, or one of the person's
 * discrete commands (paste, duplicate, delete, undo …), changes the canvas, the change plays instead of
 * snapping: new layers pop in, removed ones fade away, moved or re-laid-out ones glide to their new
 * place, and restyled ones dissolve from their old look. Live drags and panel edits never animate.
 *
 * Works on the renderer's mirror: `before()` snapshots what is about to change (old pixels, positions),
 * `after()` turns the difference into timed effects, `frame()` / `drawGhosts()` play them.
 */

const APPEAR_MS = 320;
const VANISH_MS = 240;
const SLIDE_MS = 340;
const FADE_MS = 260;
/** Upper bounds per transaction, so a huge agent edit stays cheap. */
const MAX_GHOSTS = 24;
const MAX_TRACKED = 4000;
const MAX_GHOST_PX = 2048 * 2048;

/** The person's own commands that animate; anything else they do (drag, resize, panel edits) applies at once. */
const USER_LABELS = /^(Paste|Duplicate|Delete \d|Undo: |Redo: |Import |Insert |Align|Add auto layout|Reorder)/;
/** Patch keys that change nothing visible. */
const QUIET_KEYS = new Set(['name', 'locked', 'meta', 'x', 'y']);

type Ghost = { bmp: OffscreenCanvas; x: number; y: number; w: number; h: number; start: number; mode: 'vanish' | 'fade' };
type Live = { appear?: number; slide?: { dx: number; dy: number; start: number } };
export type Pending = {
  /** Parent-relative position of every node in the touched top-level subtrees. */
  pos: Map<string, { x: number; y: number; parentId: string | null }>;
  inserted: string[];
  shown: string[];
  ghosts: Array<Omit<Ghost, 'start'>>;
};

const live = new Map<string, Live>();
let ghosts: Ghost[] = [];

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t: number) => Math.pow(Math.min(1, Math.max(0, t)), 2);
/** Settles with a small overshoot, like something set down. */
const easeBack = (t: number) => { const x = Math.min(1, Math.max(0, t)) - 1; return 1 + 2.2 * x * x * x + 1.2 * x * x; };

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function animates(author: Author, label: string): boolean {
  if (reducedMotion()) return false;
  return author.kind !== 'user' || USER_LABELS.test(label);
}

function topOf(doc: ArchaDocument, id: string): Node | undefined {
  let n = doc.get(id);
  while (n?.parentId) {
    const p = doc.get(n.parentId);
    if (!p || p.type === 'page') return n;
    n = p;
  }
  return undefined;
}

/** Old pixels of a node at its world position, drawn at about screen resolution. */
function snapshot(doc: ArchaDocument, id: string, scale: number): Omit<Ghost, 'start' | 'mode'> | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const n = doc.get(id);
  if (!n || !n.visible || n.type === 'page' || n.width < 1 || n.height < 1) return null;
  const b = doc.worldBounds(id);
  let s = scale;
  if (n.width * n.height * s * s > MAX_GHOST_PX) s = Math.sqrt(MAX_GHOST_PX / (n.width * n.height));
  const pad = 4;
  const bmp = new OffscreenCanvas(Math.ceil((n.width + pad * 2) * s), Math.ceil((n.height + pad * 2) * s));
  const ctx = bmp.getContext('2d');
  if (!ctx) return null;
  ctx.scale(s, s);
  ctx.translate(pad - n.x, pad - n.y);
  drawNode(ctx, doc, n);
  return { bmp, x: b.x - pad, y: b.y - pad, w: n.width + pad * 2, h: n.height + pad * 2 };
}

/** Call with the mirror still in its old state. `scale` = screen pixels per world unit. */
export function before(doc: ArchaDocument, ops: Op[], scale: number): Pending {
  const p: Pending = { pos: new Map(), inserted: [], shown: [], ghosts: [] };
  const insertedIds = new Set(ops.flatMap((o) => (o.op === 'insert' ? [o.node.id] : [])));
  const deleted = new Set(ops.flatMap((o) => (o.op === 'delete' ? [o.id] : [])));
  const hidden = new Set<string>();
  const restyled = new Set<string>();
  const tops = new Set<string>();
  for (const o of ops) {
    if (o.op === 'insert') {
      if (!insertedIds.has(o.parentId)) p.inserted.push(o.node.id);
      const t = topOf(doc, o.parentId);
      if (t) tops.add(t.id);
    } else if (o.op === 'update' || o.op === 'move' || o.op === 'delete') {
      const t = topOf(doc, o.id) ?? doc.get(o.id);
      if (t && t.type !== 'page') tops.add(t.id);
      if (o.op === 'update') {
        const n = doc.get(o.id);
        if (n && o.patch.visible === false && n.visible) hidden.add(o.id);
        else if (n && o.patch.visible === true && !n.visible) p.shown.push(o.id);
        else if (n && Object.keys(o.patch).some((k) => !QUIET_KEYS.has(k))) restyled.add(o.id);
      }
    }
  }
  for (const t of tops) {
    for (const n of doc.walk(t)) {
      if (p.pos.size >= MAX_TRACKED) break;
      p.pos.set(n.id, { x: n.x, y: n.y, parentId: n.parentId });
    }
  }
  // Ghosts only for the outermost changed node: a restyled frame's dissolve already covers its children.
  const ghostIds = [...deleted, ...hidden, ...restyled];
  const covered = (id: string) => ghostIds.some((other) => other !== id && doc.get(other) && doc.isAncestor(other, id));
  for (const id of ghostIds) {
    if (p.ghosts.length >= MAX_GHOSTS) break;
    if (!doc.get(id) || covered(id)) continue;
    const g = snapshot(doc, id, scale);
    if (g) p.ghosts.push({ ...g, mode: restyled.has(id) ? 'fade' : 'vanish' });
  }
  return p;
}

/** Call once the ops are applied (and laid out). Returns whether anything will play. */
export function after(doc: ArchaDocument, p: Pending, now: number): boolean {
  for (const id of [...p.inserted, ...p.shown]) if (doc.get(id)) live.set(id, { ...live.get(id), appear: now });
  const fresh = new Set(p.inserted);
  for (const [id, old] of p.pos) {
    const n = doc.get(id);
    if (!n || fresh.has(id) || n.parentId !== old.parentId) continue;
    const dx = old.x - n.x, dy = old.y - n.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    // A glide still running continues from where the node is drawn now.
    const cur = slideOffset(live.get(id)?.slide, now);
    live.set(id, { ...live.get(id), slide: { dx: dx + cur.dx, dy: dy + cur.dy, start: now } });
  }
  for (const g of p.ghosts) ghosts.push({ ...g, start: now });
  return live.size > 0 || ghosts.length > 0;
}

function slideOffset(s: Live['slide'], now: number): { dx: number; dy: number } {
  if (!s) return { dx: 0, dy: 0 };
  const k = 1 - easeOut((now - s.start) / SLIDE_MS);
  return { dx: s.dx * k, dy: s.dy * k };
}

/** Per-node transforms for this frame, or null when nothing animates (the page draws from cache as usual). */
export function frame(doc: ArchaDocument, now: number): PageFx | null {
  const anim = new Map<string, NodeAnim>();
  const tops = new Set<string>();
  for (const [id, l] of live) {
    const a: NodeAnim = {};
    if (l.appear !== undefined) {
      const t = (now - l.appear) / APPEAR_MS;
      if (t >= 1) delete l.appear;
      else { a.alpha = easeOut(t * 1.6); a.scale = 0.92 + 0.08 * easeBack(t); }
    }
    if (l.slide) {
      if (now - l.slide.start >= SLIDE_MS) delete l.slide;
      else Object.assign(a, slideOffset(l.slide, now));
    }
    if (l.appear === undefined && !l.slide) { live.delete(id); continue; }
    if (!doc.get(id)) { live.delete(id); continue; }
    anim.set(id, a);
    const top = topOf(doc, id) ?? doc.get(id)!;
    tops.add(top.id);
  }
  return anim.size ? { anim, live: tops } : null;
}

/** Removed and restyled layers' old pixels, fading out on top of the page. Uses the content canvas' pixel space. */
export function drawGhosts(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, now: number) {
  if (!ghosts.length) return;
  ghosts = ghosts.filter((g) => now - g.start < (g.mode === 'vanish' ? VANISH_MS : FADE_MS));
  ctx.save();
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
  for (const g of ghosts) {
    const t = (now - g.start) / (g.mode === 'vanish' ? VANISH_MS : FADE_MS);
    const s = g.mode === 'vanish' ? 1 - 0.06 * easeIn(t) : 1;
    ctx.globalAlpha = g.mode === 'vanish' ? 1 - easeIn(t) : 1 - easeOut(t);
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    ctx.drawImage(g.bmp, cx - (g.w * s) / 2, cy - (g.h * s) / 2, g.w * s, g.h * s);
  }
  ctx.restore();
}

export const playing = () => live.size > 0 || ghosts.length > 0;

/** Another document, or a full resync: drop everything that was playing. */
export function reset() {
  live.clear();
  ghosts = [];
}
