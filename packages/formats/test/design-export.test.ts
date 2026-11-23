import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import { exportHtml, exportSvg } from '../src';

/* Gradients and rich text survive SVG and HTML export. */

function doc(input: Record<string, unknown>) {
  const s = new DocumentSession(ArchaDocument.create('x'));
  const r = insertOpsFor(input as never, s.doc.pages[0]!.rootId);
  s.apply({ author: { kind: 'user', id: 'u' }, label: 'x', baseRevision: 0, ops: r.ops });
  return { d: s.doc as ArchaDocument, id: r.rootId };
}

describe('export of new paint and text features', () => {
  it('writes gradients as SVG defs and CSS gradients', () => {
    const { d, id } = doc({ type: 'frame', name: 'Hero', width: 200, height: 100, fills: ['linear-gradient(180deg, #000000 0%, #ffffff 100%)'] });
    const svg = exportSvg(d, id);
    expect(svg).toContain('<linearGradient');
    expect(svg).toMatch(/fill="url\(#g-/);
    const css = exportHtml(d, id, { style: 'css', name: 'p' }).find((f) => f.path.endsWith('.css'))!.data as string;
    expect(css).toContain('linear-gradient(180deg');
  });

  it('writes rich text runs as positioned tspans and styled spans', () => {
    const { d, id } = doc({ type: 'text', name: 'T', fontSize: 20, runs: ['Kami ', { text: 'modern', fill: '#8c9196', fontWeight: 700 }] });
    const svg = exportSvg(d, id);
    expect(svg).toContain('>Kami </tspan>');
    expect(svg).toMatch(/font-weight="700"[^>]*>modern<\/tspan>/);
    const html = exportHtml(d, id, { style: 'css', name: 'p' }).find((f) => f.path.endsWith('.html'))!.data as string;
    expect(html).toMatch(/<span style="color: #8c9196; font-weight: 700">modern<\/span>/);
  });
});
