import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor, layerMoveOps, layerOrder, type LayerDrop } from '../src';

const user = { kind: 'user' as const, id: 'u1' };

function setup() {
  const s = new DocumentSession(ArchaDocument.create('Layers'));
  const root = s.doc.pages[0]!.rootId;
  const apply = (ops: Parameters<DocumentSession['apply']>[0]['ops']) => s.apply({ author: user, label: 't', baseRevision: s.revision, ops });
  apply(insertOpsFor({ type: 'frame', name: 'Board', x: 100, y: 100, width: 400, height: 300, children: [
    { type: 'rect', name: 'A', x: 10, y: 20, width: 40, height: 40 },
    { type: 'rect', name: 'B', x: 100, y: 60, width: 60, height: 20 },
    { type: 'rect', name: 'C', x: 300, y: 10, width: 20, height: 80 },
  ] } as never, root).ops);
  apply(insertOpsFor({ type: 'frame', name: 'Stack', x: 600, y: 0, width: 200, height: 300, layout: 'column', children: [
    { type: 'rect', name: 'S1', width: 50, height: 50 },
    { type: 'rect', name: 'S2', width: 50, height: 50, sizing: { horizontal: 'fill', vertical: 'fixed' } },
  ] } as never, root).ops);
  const id = (name: string) => s.doc.findByName(name)[0]!.id;
  const names = (parent: string) => layerOrder(s.doc, parent).map((c) => s.doc.require(c).name);
  const drop = (ids: string[], d: LayerDrop) => {
    const r = layerMoveOps(s.doc, ids.map(id), d);
    if (r.ops.length) apply(r.ops);
    return r;
  };
  return { s, root, apply, id, names, drop };
}

describe('layer order', () => {
  it('lists free-form containers top-most first and auto layout in flow order', () => {
    const { root, id, names } = setup();
    expect(names(id('Board'))).toEqual(['C', 'B', 'A']);
    expect(names(id('Stack'))).toEqual(['S1', 'S2']);
    expect(names(root)).toEqual(['Stack', 'Board']);
  });
});

describe('layer drag and drop', () => {
  it('reorders siblings in a free-form frame by list position', () => {
    const { s, id, names, drop } = setup();
    const r = drop(['A'], { targetId: id('C'), position: 'before' });
    expect(r.label).toBe('Reorder layers');
    expect(names(id('Board'))).toEqual(['A', 'C', 'B']);
    expect(s.doc.require(id('A')).x).toBe(10);
    drop(['A'], { targetId: id('B'), position: 'after' });
    expect(names(id('Board'))).toEqual(['C', 'B', 'A']);
  });

  it('reorders auto-layout children in flow order', () => {
    const { id, names, drop } = setup();
    drop(['S2'], { targetId: id('S1'), position: 'before' });
    expect(names(id('Stack'))).toEqual(['S2', 'S1']);
  });

  it('keeps a multi-row drag in its stacking order', () => {
    const { id, names, drop } = setup();
    drop(['A', 'C'], { targetId: id('B'), position: 'after' });
    expect(names(id('Board'))).toEqual(['B', 'C', 'A']);
    drop(['C', 'A'], { targetId: id('B'), position: 'before' });
    expect(names(id('Board'))).toEqual(['C', 'A', 'B']);
  });

  it('moves a layer out of a frame and keeps it where it is on the canvas', () => {
    const { s, root, id, names, drop } = setup();
    const r = drop(['B'], { targetId: id('Board'), position: 'before' });
    expect(r.label).toBe('Move out of frame');
    expect(names(root)).toEqual(['Stack', 'B', 'Board']);
    const b = s.doc.require(id('B'));
    expect(b.parentId).toBe(root);
    expect([b.x, b.y]).toEqual([200, 160]);
  });

  it('moves a layer into a free frame with its canvas position kept', () => {
    const { s, id, names, drop } = setup();
    drop(['B'], { targetId: id('Board'), position: 'before' });
    const r = drop(['B'], { targetId: id('Board'), position: 'inside' });
    expect(r.label).toBe('Move into frame');
    expect(names(id('Board'))[0]).toBe('B');
    expect([s.doc.require(id('B')).x, s.doc.require(id('B')).y]).toEqual([100, 60]);
  });

  it('moves into auto layout at the end of the flow and out with fill sizes fixed', () => {
    const { s, id, names, drop } = setup();
    drop(['A'], { targetId: id('Stack'), position: 'inside' });
    expect(names(id('Stack'))).toEqual(['S1', 'S2', 'A']);
    const before = s.doc.worldBounds(id('S2'));
    drop(['S2'], { targetId: id('C'), position: 'after' });
    const s2 = s.doc.require(id('S2'));
    expect(s2.parentId).toBe(id('Board'));
    expect(s2.sizing.horizontal).toBe('fixed');
    expect(s.doc.worldBounds(id('S2'))).toMatchObject({ x: before.x, y: before.y, width: before.width });
  });

  it('refuses to drop a frame into itself or its descendants', () => {
    const { s, id, drop } = setup();
    const rev = s.revision;
    expect(drop(['Board'], { targetId: id('Board'), position: 'inside' }).notes[0]).toMatch(/into itself/);
    drop(['Board'], { targetId: id('A'), position: 'before' });
    expect(s.revision).toBe(rev);
  });

  it('is undoable as one transaction', () => {
    const { s, id, names, drop } = setup();
    drop(['A'], { targetId: id('Stack'), position: 'inside' });
    s.undo(user);
    expect(names(id('Board'))).toEqual(['C', 'B', 'A']);
    expect(s.doc.require(id('A')).x).toBe(10);
  });

  it('returns no ops for a drop that changes nothing', () => {
    const { s, id } = setup();
    expect(layerMoveOps(s.doc, [id('B')], { targetId: id('C'), position: 'after' }).ops).toEqual([]);
    expect(layerMoveOps(s.doc, [id('B')], { targetId: id('B'), position: 'before' }).ops).toEqual([]);
  });
});
