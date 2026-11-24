import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import {
  DEFAULT_SLIDE_SIZE, SLIDE_PRESETS, defaultSizeAt, newSlideOps, parseSize, placeSlide, presetFor, resizeSlideOps, sizeLabel, slideFrames,
} from '../src/renderer/lib/slides';

const user = { kind: 'user' as const, id: 'u1' };

/** Two 16:9 slides with a loose rect between them in the page's child order. */
function setup() {
  const s = new DocumentSession(ArchaDocument.create('Deck'));
  const root = s.doc.pages[0]!.rootId;
  const add = (input: object) => {
    const r = insertOpsFor(input as never, root);
    s.apply({ author: user, label: 'add', baseRevision: s.doc.revision, ops: r.ops });
    return r.rootId;
  };
  const a = add({ type: 'frame', name: 'Cover', x: 0, y: 0, width: 1920, height: 1080 });
  const note = add({ type: 'rect', name: 'Note', x: 0, y: 1300, width: 100, height: 100 });
  const b = add({ type: 'frame', name: 'Agenda', x: 2000, y: 0, width: 1920, height: 1080 });
  return { s, root, a, b, note };
}

const apply = (s: DocumentSession, ops: Parameters<DocumentSession['apply']>[0]['ops']) =>
  s.apply({ author: user, label: 'slide', baseRevision: s.doc.revision, ops });

describe('slide presets', () => {
  it('covers the deck, document and social sizes with unique ids', () => {
    const byId = Object.fromEntries(SLIDE_PRESETS.map((p) => [p.id, [p.width, p.height]]));
    expect(byId['16:9']).toEqual([1920, 1080]);
    expect(byId['a4-portrait']).toEqual([794, 1123]);
    expect(byId['a4-landscape']).toEqual([1123, 794]);
    expect(byId.square).toEqual([1080, 1080]);
    expect(byId.portrait).toEqual([1080, 1350]);
    expect(byId.story).toEqual([1080, 1920]);
    expect(new Set(SLIDE_PRESETS.map((p) => p.id)).size).toBe(SLIDE_PRESETS.length);
    for (const p of SLIDE_PRESETS.filter((x) => x.id.includes(':'))) {
      const [w, h] = p.id.split(':').map(Number);
      expect(p.width / p.height).toBeCloseTo(w! / h!, 5);
    }
  });

  it('names a size by its preset, else as custom', () => {
    expect(presetFor({ width: 1080.2, height: 1350 })?.id).toBe('portrait');
    expect(sizeLabel({ width: 1920, height: 1080 })).toBe('Presentation 16:9');
    expect(sizeLabel({ width: 1000, height: 500 })).toBe('Custom 1000×500');
  });

  it('parses custom sizes and rejects unusable ones', () => {
    expect(parseSize('1200', ' 628 ')).toEqual({ width: 1200, height: 628 });
    expect(parseSize('0', '100')).toBeNull();
    expect(parseSize('abc', '100')).toBeNull();
    expect(parseSize('20000', '100')).toBeNull();
  });
});

describe('slide order and creation', () => {
  it('lists visible top-level frames in page order', () => {
    const { s, root } = setup();
    expect(slideFrames(s.doc, root).map((n) => n.name)).toEqual(['Cover', 'Agenda']);
  });

  it('defaults a new slide to the size of the slide before it', () => {
    const { s, root, b } = setup();
    apply(s, [{ op: 'update', id: b, patch: { width: 1080, height: 1350 } }]);
    const slides = slideFrames(s.doc, root);
    expect(defaultSizeAt(slides, 2)).toEqual({ width: 1080, height: 1350 });
    expect(defaultSizeAt(slides, 1)).toEqual({ width: 1920, height: 1080 });
    expect(defaultSizeAt(slides, 0)).toEqual({ width: 1920, height: 1080 });
    expect(defaultSizeAt([], 0)).toEqual(DEFAULT_SLIDE_SIZE);
  });

  it('inserts between slides as one undoable step', () => {
    const { s, root } = setup();
    const r = newSlideOps(s.doc, root, 1, { width: 1080, height: 1080 });
    expect(r.ops).toHaveLength(1);
    apply(s, r.ops);
    expect(slideFrames(s.doc, root).map((n) => n.name)).toEqual(['Cover', r.name, 'Agenda']);
    const made = s.doc.require(r.rootId);
    expect([made.width, made.height]).toEqual([1080, 1080]);
    s.undo(user);
    expect(slideFrames(s.doc, root).map((n) => n.name)).toEqual(['Cover', 'Agenda']);
  });

  it('adds at the top and after the last slide', () => {
    const { s, root } = setup();
    const top = newSlideOps(s.doc, root, 0, DEFAULT_SLIDE_SIZE);
    apply(s, top.ops);
    const end = newSlideOps(s.doc, root, 99, DEFAULT_SLIDE_SIZE);
    apply(s, end.ops);
    const names = slideFrames(s.doc, root).map((n) => n.name);
    expect(names[0]).toBe(top.name);
    expect(names.at(-1)).toBe(end.name);
    expect(top.name).not.toBe(end.name);
  });

  it('starts an empty page with a slide at the origin', () => {
    const s = new DocumentSession(ArchaDocument.create('Empty'));
    const root = s.doc.pages[0]!.rootId;
    const r = newSlideOps(s.doc, root, 0, DEFAULT_SLIDE_SIZE);
    apply(s, r.ops);
    expect(s.doc.require(r.rootId)).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080, name: 'Slide 1' });
  });

  it('places a new slide on the canvas without overlapping other layers', () => {
    const rects = [{ x: 0, y: 0, width: 100, height: 100 }, { x: 180, y: 0, width: 100, height: 100 }];
    const at = placeSlide(rects, rects[0], { width: 100, height: 100 });
    expect(at).toEqual({ x: 360, y: 0 });
    expect(placeSlide([], undefined, DEFAULT_SLIDE_SIZE)).toEqual({ x: 0, y: 0 });
  });

  it('resizes a slide and pins hug axes to fixed', () => {
    const { s, a } = setup();
    apply(s, [{ op: 'update', id: a, patch: { sizing: { horizontal: 'hug', vertical: 'hug' } } }]);
    const node = s.doc.require(a);
    expect(resizeSlideOps(s.doc.require(a), { width: 1080, height: 1920 })).toHaveLength(1);
    apply(s, resizeSlideOps(node, { width: 1080, height: 1920 }));
    expect(s.doc.require(a)).toMatchObject({ width: 1080, height: 1920, sizing: { horizontal: 'fixed', vertical: 'fixed' } });
    expect(resizeSlideOps(s.doc.require(a), { width: 1080, height: 1920 })).toEqual([]);
  });
});
