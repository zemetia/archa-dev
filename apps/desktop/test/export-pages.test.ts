import { describe, expect, it } from 'vitest';
import { applyOps, ArchaDocument, insertOpsFor } from '@archa/core';
import { readingOrder } from '../src/renderer/lib/geometry';

/* Multi-page PDF export (blueprint RENDERING/03): which layers become pages, and in what order. */

function page(doc: ArchaDocument, name: string, x: number, y: number, width = 595, height = 842, parent = doc.pages[0]!.rootId) {
  const { ops, rootId } = insertOpsFor({ type: 'frame', name, x, y, width, height } as never, parent);
  applyOps(doc, ops);
  return rootId;
}

describe('PDF page order', () => {
  it('reads the canvas left to right, then top to bottom, whatever the selection order', () => {
    const doc = ArchaDocument.create('Deck');
    // Two rows; the second page of row one sits a little lower than the first.
    const a = page(doc, 'A', 0, 0), b = page(doc, 'B', 700, 40), c = page(doc, 'C', 1400, 0);
    const d = page(doc, 'D', 0, 1000), e = page(doc, 'E', 700, 1000);
    expect(readingOrder(doc, [e, c, a, d, b])).toEqual([a, b, c, d, e]);
  });

  it('keeps pages of different sizes, and drops layers already inside another selected page', () => {
    const doc = ArchaDocument.create('Mixed');
    const a4 = page(doc, 'A4', 0, 0);
    const slide = page(doc, 'Slide', 800, 0, 1920, 1080);
    const inner = page(doc, 'Logo', 20, 20, 100, 40, a4);
    expect(readingOrder(doc, [inner, slide, a4, 'missing'])).toEqual([a4, slide]);
    expect(readingOrder(doc, [inner])).toEqual([inner]);
  });
});
