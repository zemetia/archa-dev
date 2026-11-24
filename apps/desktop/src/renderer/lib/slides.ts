import { insertOpsFor, type ArchaDocument, type Rect } from '@archa/core';
import type { Node, NodeInput, Op } from '@archa/schema';

/*
 * Slide logic shared by the Slides tab and the slide view (blueprint APP_UI/05). DOM-free so it is
 * tested on its own. A slide is a visible top-level frame of the page; slide order is the page
 * root's child order, so inserting "between slides" is an insert at that child index.
 */

export type SlideSize = { width: number; height: number };
export type SlidePreset = SlideSize & { id: string; label: string; group: 'Presentation' | 'Document' | 'Social' };

export const SLIDE_PRESETS: readonly SlidePreset[] = [
  { id: '16:9', label: 'Presentation 16:9', group: 'Presentation', width: 1920, height: 1080 },
  { id: '4:3', label: 'Presentation 4:3', group: 'Presentation', width: 1600, height: 1200 },
  { id: '5:4', label: 'Presentation 5:4', group: 'Presentation', width: 1500, height: 1200 },
  { id: 'a4-portrait', label: 'A4 portrait', group: 'Document', width: 794, height: 1123 },
  { id: 'a4-landscape', label: 'A4 landscape', group: 'Document', width: 1123, height: 794 },
  { id: 'letter', label: 'US Letter', group: 'Document', width: 816, height: 1056 },
  { id: 'square', label: 'Square post', group: 'Social', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Portrait post 4:5', group: 'Social', width: 1080, height: 1350 },
  { id: 'story', label: 'Story 9:16', group: 'Social', width: 1080, height: 1920 },
];

export const DEFAULT_SLIDE_SIZE: SlideSize = { width: 1920, height: 1080 };
/** Space kept between a new slide and the layers around it on the canvas. */
const GAP = 80;
const MAX_SIDE = 10000;

export function slideFrames(doc: ArchaDocument, rootId: string): Node[] {
  return doc.children(rootId).filter((n) => n.type === 'frame' && n.visible);
}

export function presetFor(size: SlideSize): SlidePreset | undefined {
  return SLIDE_PRESETS.find((p) => p.width === Math.round(size.width) && p.height === Math.round(size.height));
}

export function sizeLabel(size: SlideSize): string {
  return presetFor(size)?.label ?? `Custom ${Math.round(size.width)}×${Math.round(size.height)}`;
}

/** Custom size from the picker's fields; null when either side is not a usable number. */
export function parseSize(width: string, height: string): SlideSize | null {
  const w = Math.round(Number(width)), h = Math.round(Number(height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) return null;
  return { width: w, height: h };
}

/** Size a new slide starts with: the slide it follows (or the first one when added at the top). */
export function defaultSizeAt(slides: readonly Node[], at: number): SlideSize {
  const ref = slides[at - 1] ?? slides[at];
  return ref ? { width: Math.round(ref.width), height: Math.round(ref.height) } : DEFAULT_SLIDE_SIZE;
}

/** Free spot right of `prev` on its row (or at 0,0 on an empty page), stepping past anything it would overlap. */
export function placeSlide(rects: readonly Rect[], prev: Rect | undefined, size: SlideSize): { x: number; y: number } {
  if (!rects.length) return { x: 0, y: 0 };
  const start = prev ?? { x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)), width: 0, height: 0 };
  const c = { x: start.x + start.width + (prev ? GAP : 0), y: start.y, ...size };
  const hit = () => rects.find((r) => c.x < r.x + r.width + GAP && c.x + c.width + GAP > r.x && c.y < r.y + r.height + GAP && c.y + c.height + GAP > r.y);
  for (let r = hit(); r; r = hit()) c.x = r.x + r.width + GAP;
  return { x: Math.round(c.x), y: Math.round(c.y) };
}

/**
 * Ops for a new slide at slide position `at` (0 = before the first slide, slides.length = after the last).
 * One insert into the page root, so it is one undo step.
 */
export function newSlideOps(doc: ArchaDocument, rootId: string, at: number, size: SlideSize): { ops: Op[]; rootId: string; name: string } {
  const slides = slideFrames(doc, rootId);
  const pos = Math.max(0, Math.min(at, slides.length));
  const children = doc.children(rootId);
  const next = slides[pos];
  const prev = slides[pos - 1];
  const index = next ? children.findIndex((n) => n.id === next.id) : prev ? children.findIndex((n) => n.id === prev.id) + 1 : children.length;
  const rects = children.filter((n) => n.visible).map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
  const { x, y } = placeSlide(rects, prev && { x: prev.x, y: prev.y, width: prev.width, height: prev.height }, size);
  const name = uniqueName(new Set(children.map((n) => n.name)));
  const input = { type: 'frame', name, x, y, width: size.width, height: size.height, fills: ['#ffffff'], clip: true } as unknown as NodeInput;
  const r = insertOpsFor(input, rootId, index);
  return { ops: r.ops, rootId: r.rootId, name };
}

/** Resize a slide; hug / fill axes become fixed so the new size sticks. */
export function resizeSlideOps(node: Node, size: SlideSize): Op[] {
  if (Math.round(node.width) === size.width && Math.round(node.height) === size.height) return [];
  return [{ op: 'update', id: node.id, patch: { width: size.width, height: size.height, sizing: { horizontal: 'fixed', vertical: 'fixed' } } } as Op];
}

function uniqueName(taken: Set<string>): string {
  let n = 1;
  while (taken.has(`Slide ${n}`)) n++;
  return `Slide ${n}`;
}
