import type { ArchaDocument, Rect } from './document';

/** First free spot on a page right of existing top-level frames, scanning rows (gap 80). */
export function findEmptySpace(doc: ArchaDocument, pageRootId: string, width: number, height: number, gap = 80): { x: number; y: number } {
  const rects: Rect[] = doc.children(pageRootId).filter((n) => n.visible).map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
  if (!rects.length) return { x: 0, y: 0 };
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const candidate = { x: right + gap, y: top, width, height };
  const hits = (c: Rect) => rects.some((r) => c.x < r.x + r.width + gap && c.x + c.width + gap > r.x && c.y < r.y + r.height + gap && c.y + c.height + gap > r.y);
  while (hits(candidate)) candidate.x += gap;
  return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
}
