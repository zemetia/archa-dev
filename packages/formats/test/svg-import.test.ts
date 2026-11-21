import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import { colorToHex } from '@archa/schema';
import { extractSvg, importSvg, isSvgMarkup, SvgImportError } from '../src';

type P = { type: string; name: string; d: string; x: number; y: number; width: number; height: number; fills: Array<{ color: never }>; strokes: Array<{ color: never; width: number }>; fillRule: string };
const kids = (r: ReturnType<typeof importSvg>) => (r.node as unknown as { children: P[] }).children;

describe('importSvg', () => {
  it('keeps basic shapes as vector paths with their paint and bounds', () => {
    const r = importSvg(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 200 100">
      <rect id="bg" x="0" y="0" width="200" height="100" rx="10" fill="#ff0000"/>
      <circle cx="100" cy="50" r="20" fill="none" stroke="blue" stroke-width="4"/>
      <line x1="0" y1="0" x2="200" y2="100" stroke="rgb(0, 128, 0)"/>
    </svg>`, { name: 'Logo' });
    expect(r.mode).toBe('vector');
    expect(r.node).toMatchObject({ type: 'frame', name: 'Logo', width: 100, height: 50 });
    const [bg, circle, line] = kids(r);
    expect(bg).toMatchObject({ type: 'path', name: 'bg', x: 0, y: 0, width: 100, height: 50 });
    expect(colorToHex(bg!.fills[0]!.color)).toBe('#ff0000');
    // viewBox scale 0.5: r 20 → 10, stroke 4 → 2
    expect(circle).toMatchObject({ x: 40, y: 15, width: 20, height: 20, fills: [] });
    expect(circle!.strokes[0]!.width).toBe(2);
    expect(colorToHex(circle!.strokes[0]!.color)).toBe('#0000ff');
    expect(line!.fills).toEqual([]);
    expect(colorToHex(line!.strokes[0]!.color)).toBe('#008000');
  });

  it('bakes rotation, nested group transforms, relative commands and arcs', () => {
    const r = importSvg(`<svg viewBox="0 0 100 100"><g transform="translate(50 50)"><g transform="rotate(45)">
      <path d="m-10 -10h20v20h-20z" fill="#000"/></g></g>
      <path d="M10 90 a10 10 0 1 1 20 0" stroke="#000" fill="none"/></svg>`);
    const [sq, arc] = kids(r);
    const diag = 10 * Math.SQRT2;
    expect(sq!.x).toBeCloseTo(50 - diag, 2);
    expect(sq!.width).toBeCloseTo(2 * diag, 2);
    expect(arc).toMatchObject({ x: 10, y: 80, width: 20 });
    expect(arc!.height).toBeCloseTo(10, 2);
  });

  it('applies <style> class rules, inline style, currentColor and inherited opacity', () => {
    const r = importSvg(`<svg viewBox="0 0 10 10" color="#123456"><style>.a { fill: #00ff00 } rect.b { fill-opacity: .5 }</style>
      <g opacity="0.5"><rect class="a b" width="10" height="10"/></g>
      <circle cx="5" cy="5" r="2" style="fill: currentColor"/></svg>`);
    const [rect, dot] = kids(r);
    const rc = rect!.fills[0]!.color as unknown as { a: number };
    expect(colorToHex(rect!.fills[0]!.color)).toBe('#00ff00');
    expect(rc.a).toBeCloseTo(0.25, 3);
    expect(colorToHex(dot!.fills[0]!.color)).toBe('#123456');
  });

  it('falls back to an image for what vectors cannot keep, and says why', () => {
    const grad = `<svg width="40" height="20"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="40" height="20" fill="url(#g)"/><script>alert(1)</script></svg>`;
    const r = importSvg(grad, { width: 80 });
    expect(r.mode).toBe('image');
    expect(r.reason).toMatch(/gradient/);
    expect(r.node).toMatchObject({ type: 'image', width: 80, height: 40 });
    const src = (r.node as unknown as { src: string }).src;
    expect(src.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = Buffer.from(src.split(',')[1]!, 'base64').toString('utf8');
    expect(decoded).not.toContain('<script');
    expect(decoded).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(importSvg('<svg width="10" height="10"><text>Hi</text></svg>').reason).toBe('text');
    expect(() => importSvg(grad, { mode: 'vector' })).toThrow(SvgImportError);
    expect(importSvg('<svg width="10" height="10"><rect width="5" height="5"/></svg>', { mode: 'image' }).mode).toBe('image');
  });

  it('rejects non-SVG input and finds SVG inside agent text', () => {
    expect(() => importSvg('<div>no</div>')).toThrow(/Not SVG/);
    expect(isSvgMarkup('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>')).toBe(true);
    expect(isSvgMarkup('Here is <svg>')).toBe(false);
    expect(extractSvg('Here you go:\n```svg\n<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>\n```')).toBe('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>');
  });

  it('produces nodes the document accepts', () => {
    const s = new DocumentSession(ArchaDocument.create('Svg'));
    const r = importSvg('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>', { name: 'Arrow' });
    const { ops, rootId } = insertOpsFor(r.node, s.doc.pages[0]!.rootId);
    s.apply({ author: { kind: 'user', id: 'u' }, label: 'svg', baseRevision: s.revision, ops });
    const frame = s.doc.require(rootId) as unknown as { children: string[] };
    expect(frame.children).toHaveLength(2);
    expect(s.doc.require(frame.children[1]!)).toMatchObject({ type: 'path', lineCap: 'round', x: 12, y: 5, width: 7, height: 14 });
  });
});
