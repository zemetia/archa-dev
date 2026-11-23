import { describe, expect, it } from 'vitest';
import { alignOps, ArchaDocument, DocumentSession, distributeOps, insertOpsFor, normaliseInput, outline, placementOf, placementPatch, wrapOps } from '../src';
import type { FrameNode } from '@archa/schema';

const user = { kind: 'user' as const, id: 'u1' };

function setup() {
  const s = new DocumentSession(ArchaDocument.create('Arrange'));
  const root = s.doc.pages[0]!.rootId;
  const apply = (ops: Parameters<DocumentSession['apply']>[0]['ops']) => s.apply({ author: user, label: 't', baseRevision: s.revision, ops });
  const board = insertOpsFor({ type: 'frame', name: 'Board', x: 100, y: 100, width: 400, height: 300, children: [
    { type: 'rect', name: 'A', x: 10, y: 20, width: 40, height: 40 },
    { type: 'rect', name: 'B', x: 100, y: 60, width: 60, height: 20 },
    { type: 'rect', name: 'C', x: 300, y: 10, width: 20, height: 80 },
  ] } as never, root);
  apply(board.ops);
  const stack = insertOpsFor({ type: 'frame', name: 'Stack', x: 600, y: 0, width: 200, height: 200, layout: 'column', children: [
    { type: 'rect', name: 'S1', width: 50, height: 50 },
  ] } as never, root);
  apply(stack.ops);
  const id = (name: string) => s.doc.findByName(name)[0]!.id;
  return { s, root, apply, id };
}

describe('arrange', () => {
  it('aligns one free layer inside its parent frame', () => {
    const { s, apply, id } = setup();
    apply(alignOps(s.doc, [id('B')], 'right').ops);
    expect(s.doc.require(id('B')).x).toBe(340);
    apply(alignOps(s.doc, [id('B')], 'middle').ops);
    expect(s.doc.require(id('B')).y).toBe(140);
  });

  it('aligns several layers to their combined bounds', () => {
    const { s, apply, id } = setup();
    apply(alignOps(s.doc, [id('A'), id('B'), id('C')], 'top').ops);
    expect([id('A'), id('B'), id('C')].map((x) => s.doc.require(x).y)).toEqual([10, 10, 10]);
  });

  it('explains instead of moving a lone top-level layer', () => {
    const { s, id } = setup();
    const r = alignOps(s.doc, [id('Board')], 'left');
    expect(r.ops).toEqual([]);
    expect(r.notes[0]).toMatch(/nothing to align/);
  });

  it('sets the auto-layout parent instead of x/y for a flow child', () => {
    const { s, apply, id } = setup();
    const r = alignOps(s.doc, [id('S1')], 'center');
    expect(r.ops).toEqual([{ op: 'update', id: id('Stack'), patch: { align: 'center' } }]);
    apply(r.ops);
    expect(s.doc.require(id('S1')).x).toBe(75);
    apply(alignOps(s.doc, [id('S1')], 'bottom').ops);
    expect((s.doc.require(id('Stack')) as FrameNode).justify).toBe('end');
  });

  it('distributes free layers evenly or by a fixed gap', () => {
    const { s, apply, id } = setup();
    apply(distributeOps(s.doc, [id('A'), id('B'), id('C')], 'horizontal').ops);
    // span 10..320, sizes 40+60+20 → space 95 each
    expect(s.doc.require(id('B')).x).toBe(145);
    apply(distributeOps(s.doc, [id('A'), id('B'), id('C')], 'horizontal', 8).ops);
    expect([id('A'), id('B'), id('C')].map((x) => s.doc.require(x).x)).toEqual([10, 58, 126]);
  });

  it('wraps siblings in an auto-layout frame in reading order', () => {
    const { s, apply, id } = setup();
    const { ops, rootId } = wrapOps(s.doc, [id('C'), id('A')], { layout: 'row', gap: 4 });
    apply(ops);
    const f = s.doc.require(rootId) as FrameNode;
    expect(f.layout).toBe('row');
    expect(f.children).toEqual([id('A'), id('C')]);
    expect(f.width).toBe(40 + 4 + 20);
  });

  it('maps the 9-dot grid to align/justify per direction', () => {
    const { s, id } = setup();
    const stack = s.doc.require(id('Stack')) as FrameNode;
    expect(placementPatch(stack, 'end', 'center')).toEqual({ align: 'end', justify: 'center' });
    expect(placementOf({ ...stack, layout: 'row', align: 'end', justify: 'center' })).toEqual({ horizontal: 'center', vertical: 'end' });
    expect(placementPatch({ ...stack, justify: 'space-between' }, 'end', 'end')).toEqual({ align: 'end' });
  });

  it('lays out space-around with half gaps at the ends', () => {
    const { s, apply, id } = setup();
    apply([{ op: 'update', id: id('Stack'), patch: { justify: 'space-around' } }]);
    expect(s.doc.require(id('S1')).y).toBe(75);
  });
});

describe('agent-friendly input', () => {
  it('accepts CSS / Figma names and effect shorthands', () => {
    const n = normaliseInput({ type: 'frame', alignItems: 'center', justifyContent: 'space-evenly', flexDirection: 'horizontal', borderRadius: 8, stroke: '#000000',
      effects: [{ type: 'blur', blur: 6 }, { inset: true, x: 0, y: 2, blur: 4 }, { type: 'backdrop', radius: 20 }], context: 'Hero only' });
    expect(n).toMatchObject({ align: 'center', justify: 'space-around', layout: 'row', cornerRadius: 8, meta: { context: 'Hero only' } });
    expect((n.effects as Array<{ type: string }>).map((e) => e.type)).toEqual(['layer-blur', 'inner-shadow', 'background-blur']);
    expect((n.effects as Array<{ radius?: number }>)[0]!.radius).toBe(6);
  });

  it('outlines a subtree with context notes', () => {
    const { s, apply, id } = setup();
    apply([{ op: 'update', id: id('Board'), patch: { meta: { context: 'Keep this board square' } } }]);
    const text = outline(s.doc, id('Board'));
    expect(text).toContain('Board');
    expect(text).toContain('context: Keep this board square');
    expect(text.split('\n').filter((l) => l.includes('rect'))).toHaveLength(3);
  });
});
