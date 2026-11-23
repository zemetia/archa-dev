import { describe, expect, it } from 'vitest';
import { ArchaDocument, bundledFamily, DocumentSession, insertOpsFor, measureText, textLines, textWidth } from '../src';
import type { TextNode } from '@archa/schema';

/* Text measure (blueprint DOCUMENT_MODEL/03 → Text measure): real advances of the bundled fonts. */

const style = (fontFamily: string, fontWeight = 400, fontSize = 100, letterSpacing = 0) => ({ fontFamily, fontWeight, fontSize, letterSpacing });

describe('text measure', () => {
  it('uses real glyph widths: narrow and wide letters differ, Inter Tight is tighter than Inter', () => {
    expect(textWidth('iiii', style('Inter'))).toBeLessThan(textWidth('WWWW', style('Inter')) / 2);
    expect(textWidth('SEHATI', style('Inter Tight'))).toBeLessThan(textWidth('SEHATI', style('Inter')));
    expect(textWidth('Gudang', style('Inter', 700))).toBeGreaterThan(textWidth('Gudang', style('Inter', 400)));
  });

  it('adds letter spacing after every character and scales with size', () => {
    const base = textWidth('abc', style('Inter', 400, 20));
    expect(textWidth('abc', style('Inter', 400, 20, 2))).toBeCloseTo(base + 6, 6);
    expect(textWidth('abc', style('Inter', 400, 40))).toBeCloseTo(base * 2, 6);
  });

  it('measures unbundled families as Inter and estimates code points without a table', () => {
    expect(bundledFamily('"Inter Tight", sans-serif')).toBe('Inter Tight');
    expect(bundledFamily('Segoe UI')).toBe('Inter');
    expect(textWidth('Hello', style('Segoe UI'))).toBe(textWidth('Hello', style('Inter')));
    expect(textWidth('漢字', style('Inter'))).toBeCloseTo(200, 6);
  });

  it('wraps greedily at the width and keeps hard breaks', () => {
    const node = { text: 'one two three\nfour', ...style('Inter', 400, 16) };
    const w = textWidth('one two', node);
    expect(textLines(node, w + 1)).toEqual(['one two', 'three', 'four']);
    expect(textLines(node)).toEqual(['one two three', 'four']);
  });

  it('lays auto-width text out at its measured width', () => {
    const s = new DocumentSession(ArchaDocument.create('t'));
    const { ops, rootId } = insertOpsFor({ type: 'text', name: 'T', text: 'Gudang siap pakai', fontFamily: 'Inter Tight', fontSize: 56 } as never, s.doc.pages[0]!.rootId);
    s.apply({ author: { kind: 'user', id: 'u' }, label: 'x', baseRevision: 0, ops });
    const n = s.doc.get(rootId) as TextNode;
    expect(n.width).toBe(Math.ceil(textWidth('Gudang siap pakai', n)));
    expect(measureText(n).height).toBe(Math.ceil(56 * n.lineHeight));
  });
});
