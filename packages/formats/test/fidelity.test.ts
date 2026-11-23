import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, hexToColor, type TextNode } from '@archa/schema';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import { decodeArcha, encodeArcha, exportHtml, exportSvg } from '../src';

/** The v4 fixture: a hero with a photo fill under a scrim, and a two-tone headline whose accent is a token. */
function fixture() {
  const dir = join(__dirname, 'fixtures/archa-v4');
  const file = (p: string) => new Uint8Array(readFileSync(join(dir, p)));
  return decodeArcha(zipSync({ 'manifest.json': file('manifest.json'), 'document.json': file('document.json'), 'pages/page00001.json': file('pages/page00001.json') }));
}

describe('format 4: paints, rich text, bindings', () => {
  it('reads the v4 fixture and round-trips it', () => {
    const data = fixture();
    expect(data.meta.formatVersion).toBe(FORMAT_VERSION);
    const hero = data.nodes.hero000001;
    expect(hero?.type === 'frame' && hero.fills.map((f) => f.type)).toEqual(['image', 'linear-gradient']);
    const back = decodeArcha(encodeArcha(data));
    expect(back.nodes.text000001).toEqual(data.nodes.text000001);
  });

  it('exports gradients, picture fills, spans and bound tokens to HTML', () => {
    const s = new DocumentSession(fixture());
    const [page, css] = exportHtml(s.doc, 'hero000001', { style: 'css' });
    const html = String(page!.data), sheet = String(css!.data);
    // CSS lists the top layer first: the scrim over the photo.
    expect(sheet).toMatch(/\.hero \{[^}]*background-image: linear-gradient\(180deg, #00000000 0%, #000000b3 100%\), url\("hero-assets\/image-1\.png"\);/s);
    expect(sheet).toMatch(/background-size: auto, cover;/);
    expect(sheet).toMatch(/:root \{\s*--color-accent: #[0-9a-f]{6};\s*\}/);
    expect(html).toContain('Design <span style="color: var(--color-accent)">faster</span>');
  });

  it('follows the token when the variable changes, and exports SVG gradients and tspans', () => {
    const s = new DocumentSession(fixture());
    s.apply({ author: { kind: 'user', id: 'u' }, label: 'x', baseRevision: s.revision, ops: [{ op: 'setVariable', variable: { id: 'var0000001', name: 'color/accent', type: 'color', value: hexToColor('#22c55e') } }] });
    const t = s.doc.require('text000001') as TextNode;
    expect(t.spans[0]!.fills![0]!.type === 'solid' && t.spans[0]!.fills![0]!.color).toEqual(hexToColor('#22c55e'));
    const svg = exportSvg(s.doc, 'hero000001');
    expect(svg).toContain('<pattern id="p-hero000001"');
    expect(svg).toMatch(/<tspan x="24" y="[\d.]+">Design <tspan fill="rgba\(\d+, \d+, \d+, 1\)">faster<\/tspan><\/tspan>/);
    const doc = new ArchaDocument(s.doc.toData());
    doc.nodes.set('hero000001', { ...doc.require('hero000001'), fills: [{ type: 'linear-gradient', angle: 90, stops: [{ position: 0, color: hexToColor('#000000') }, { position: 1, color: hexToColor('#ffffff') }], visible: true }] } as never);
    expect(exportSvg(doc, 'hero000001')).toContain('<linearGradient id="p-hero000001" x1="0" y1="0.5" x2="1" y2="0.5">');
  });

  it('exports a grid frame as CSS grid with cells that fill their track', () => {
    const s = new DocumentSession(ArchaDocument.create('grid'));
    const { ops, rootId } = insertOpsFor({ type: 'frame', name: 'Features', columns: 3, gap: 24, rowGap: 32, width: 900, sizing: { horizontal: 'fixed', vertical: 'hug' },
      children: [1, 2, 3, 4].map((i) => ({ type: 'frame', name: `Card ${i}`, height: 120, sizing: { horizontal: 'fill', vertical: 'fixed' } })) } as never, s.doc.pages[0]!.rootId);
    s.apply({ author: { kind: 'user', id: 'u' }, label: 'x', baseRevision: 0, ops });
    expect(s.doc.children(rootId)[3]!.y).toBe(120 + 32);
    const css = String(exportHtml(s.doc, rootId, { style: 'css' })[1]!.data);
    expect(css).toMatch(/\.features \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*column-gap: 24px;[^}]*row-gap: 32px;/s);
    expect(css).toMatch(/\.card-1 \{[^}]*justify-self: stretch;[^}]*height: 120px;/s);
  });
});
