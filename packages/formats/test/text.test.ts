import { describe, expect, it } from 'vitest';
import { exportHtmlStandalone, exportSvg } from '../src';
import { applyCase, approxMeasure, ArchaDocument, curveBox, displayParagraphs, DocumentSession, insertOpsFor, outline, runLayout } from '@archa/core';
import type { NodeInput, TextNode } from '@archa/schema';

/* Canva-like text options: case, lists, curve, effects — measured, outlined and exported the same way. */

function make(input: Record<string, unknown>) {
  const s = new DocumentSession(ArchaDocument.create('t'));
  const root = s.doc.pages[0]!.rootId;
  const { ops, rootId } = insertOpsFor({ type: 'text', name: 'T', fills: ['#7c3aed'], ...input } as unknown as NodeInput, root);
  s.apply({ author: { id: 'u', kind: 'user' }, label: 'x', baseRevision: 0, ops });
  runLayout(s.doc);
  return { doc: s.doc, n: s.doc.require(rootId) as TextNode };
}

describe('text display', () => {
  it('applies letter case without changing what was typed', () => {
    expect(applyCase('big summer-sale', 'title')).toBe('Big Summer-Sale');
    expect(applyCase('Hello', 'upper')).toBe('HELLO');
    const { n } = make({ text: 'hello world', textCase: 'upper' });
    expect(n.text).toBe('hello world');
    expect(displayParagraphs(n)).toEqual(['HELLO WORLD']);
  });

  it('puts list markers in front of every line', () => {
    expect(displayParagraphs({ text: 'One\nTwo', textCase: 'none', list: 'number', curve: 0 })).toEqual(['1.  One', '2.  Two']);
    expect(displayParagraphs({ text: 'One\nTwo', textCase: 'none', list: 'bullet', curve: 0 })[1]).toBe('•  Two');
  });

  it('measures a list wider than the bare text', () => {
    const plain = make({ text: 'Coffee' }).n;
    const listed = make({ text: 'Coffee', list: 'bullet' }).n;
    expect(listed.width).toBeGreaterThan(plain.width);
  });
});

describe('curve', () => {
  it('turns one line into an arc box: taller, narrower', () => {
    const b = curveBox(300, 40, 50);
    expect(b.height).toBeGreaterThan(40);
    expect(b.width).toBeLessThan(300);
    expect(curveBox(300, 40, 0)).toMatchObject({ width: 300, height: 40 });
  });

  it('sizes a curved text box to its arc, joining lines', () => {
    const straight = make({ text: 'ROUND SEAL OF QUALITY' }).n;
    const { n } = make({ text: 'ROUND SEAL\nOF QUALITY', curve: 80 });
    expect(displayParagraphs(n)).toEqual(['ROUND SEAL OF QUALITY']);
    expect(n.height).toBeGreaterThan(straight.height * 2);
    expect(approxMeasure(n).width).toBe(n.width);
  });
});

describe('text effects', () => {
  it('validate, show in the outline and export to CSS', () => {
    const { doc, n } = make({ text: 'Sale', fontSize: 48, fontStyle: 'italic', underline: true, textEffect: { type: 'drop', offset: 50, direction: 90, transparency: 0 } });
    expect(n.textEffect).toMatchObject({ type: 'drop', blur: 0, thickness: 50 });
    expect(outline(doc, n.id)).toContain('italic underline effect drop');
    const html = exportHtmlStandalone(doc, n.id);
    expect(html).toMatch(/text-shadow: 0px 6px 0px #000000/);
    expect(html).toContain('font-style: italic');
    expect(html).toContain('text-decoration: underline');
  });

  it('exports hollow text and curves to SVG', () => {
    const { doc, n } = make({ text: 'Hollow', textEffect: { type: 'hollow' } });
    expect(exportSvg(doc, n.id)).toMatch(/fill="none" stroke="[^"]+" stroke-width/);
    const curved = make({ text: 'Arc', curve: 60 });
    expect(exportSvg(curved.doc, curved.n.id)).toContain('<textPath href="#t-');
  });

  it('rejects unknown effects', () => {
    expect(() => make({ text: 'x', textEffect: { type: 'wobble' } })).toThrow();
  });
});
