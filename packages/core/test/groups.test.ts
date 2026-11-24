import { describe, expect, it } from 'vitest';
import type { Op } from '@archa/schema';
import { ArchaDocument, DocumentSession, emptiedGroups, groupOps, insertOpsFor, makeComponentOps, instanceOps, pageMatrix, applyMat, ungroupOps, canUngroup } from '../src';

const user = { kind: 'user' as const, id: 'u1' };

function setup() {
  const s = new DocumentSession(ArchaDocument.create('Groups'));
  const root = s.doc.pages[0]!.rootId;
  const apply = (ops: Op[]) => s.apply({ author: user, label: 't', baseRevision: s.revision, ops });
  const add = (input: Record<string, unknown>, parent = root) => { const r = insertOpsFor(input as never, parent); apply(r.ops); return r.rootId; };
  const id = (name: string) => s.doc.findByName(name)[0]!.id;
  const node = (name: string) => s.doc.require(id(name));
  const kids = (parent: string) => s.doc.children(parent).map((c) => c.name);
  /** Page position of a node's box centre — what the person sees, whatever the parents. */
  const centre = (name: string) => { const n = node(name); return applyMat(pageMatrix(s.doc, n.id), n.width / 2, n.height / 2); };
  const group = (names: string[]) => { const r = groupOps(s.doc, names.map(id)); if (r.ops.length) apply(r.ops); return r; };
  const groupIds = (ids: string[]) => { const r = groupOps(s.doc, ids); apply(r.ops); return r.selection[0]!; };
  const ungroup = (names: string[]) => { const r = ungroupOps(s.doc, names.map(id)); if (r.ops.length) apply(r.ops); return r; };
  return { s, root, apply, add, id, node, kids, centre, group, groupIds, ungroup };
}

const near = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  expect(p.x).toBeCloseTo(q.x, 3);
  expect(p.y).toBeCloseTo(q.y, 3);
};

function board(t: ReturnType<typeof setup>) {
  t.add({ type: 'frame', name: 'Board', x: 100, y: 100, width: 400, height: 300, children: [
    { type: 'rect', name: 'A', x: 10, y: 20, width: 40, height: 40 },
    { type: 'rect', name: 'X', x: 200, y: 200, width: 10, height: 10 },
    { type: 'rect', name: 'B', x: 100, y: 60, width: 60, height: 20 },
    { type: 'rect', name: 'C', x: 300, y: 10, width: 20, height: 80 },
  ] });
}

describe('group', () => {
  it('wraps a multi selection at the top-most item slot, keeping positions and z-order', () => {
    const t = setup();
    board(t);
    const before = { A: t.centre('A'), B: t.centre('B') };
    const r = t.group(['B', 'A']);
    expect(r.label).toBe('Group selection');
    const g = t.s.doc.require(r.selection[0]!);
    expect(g.type).toBe('group');
    expect(t.kids(t.id('Board'))).toEqual(['X', 'Group', 'C']);
    expect(t.kids(g.id)).toEqual(['A', 'B']);
    expect({ x: g.x, y: g.y, width: g.width, height: g.height }).toEqual({ x: 10, y: 20, width: 150, height: 60 });
    near(t.centre('A'), before.A);
    near(t.centre('B'), before.B);
    expect(t.node('A')).toMatchObject({ x: 0, y: 0 });
  });

  it('groups a single layer and an already grouped selection (nesting)', () => {
    const t = setup();
    board(t);
    const inner = t.group(['A']).selection[0]!;
    expect(t.s.doc.require(inner)).toMatchObject({ x: 10, y: 20, width: 40, height: 40 });
    const outer = t.groupIds([inner, t.id('B')]);
    expect(t.s.doc.children(outer).map((c) => c.id)).toEqual([inner, t.id('B')]);
    expect(t.s.doc.require(inner).parentId).toBe(outer);
    near(t.centre('A'), { x: 130, y: 140 });
  });

  it('puts a selection spanning parents into the parent of the top-most item', () => {
    const t = setup();
    board(t);
    t.add({ type: 'rect', name: 'Free', x: 0, y: 0, width: 20, height: 20 });
    const before = { A: t.centre('A'), Free: t.centre('Free') };
    // Free is painted after Board, so it is top-most: the group lands on the page.
    const r = t.group(['A', 'Free']);
    const g = t.s.doc.require(r.selection[0]!);
    expect(g.parentId).toBe(t.root);
    expect(t.kids(t.root)).toEqual(['Board', 'Group']);
    expect(t.kids(g.id)).toEqual(['A', 'Free']);
    near(t.centre('A'), before.A);
    near(t.centre('Free'), before.Free);
    // Top-most inside the board: the group goes into the board.
    const t2 = setup();
    t2.add({ type: 'rect', name: 'Under', x: 0, y: 0, width: 20, height: 20 });
    board(t2);
    expect(t2.s.doc.require(t2.group(['Under', 'C']).selection[0]!).parentId).toBe(t2.id('Board'));
  });

  it('drops descendants of selected layers and keeps them with their ancestor', () => {
    const t = setup();
    board(t);
    const r = t.group(['Board', 'A']);
    expect(t.kids(r.selection[0]!)).toEqual(['Board']);
    expect(t.node('A').parentId).toBe(t.id('Board'));
  });

  it('takes the flow slot inside auto layout and fixes fill sizing', () => {
    const t = setup();
    t.add({ type: 'frame', name: 'Stack', x: 0, y: 0, width: 200, height: 400, layout: 'column', gap: 10, children: [
      { type: 'rect', name: 'S1', width: 50, height: 50 },
      { type: 'rect', name: 'S2', width: 50, height: 30, sizing: { horizontal: 'fill', vertical: 'fixed' } },
      { type: 'rect', name: 'S3', width: 50, height: 40 },
    ] });
    const r = t.group(['S1', 'S2']);
    const g = t.s.doc.require(r.selection[0]!);
    expect(t.kids(t.id('Stack'))).toEqual(['Group', 'S3']);
    expect(t.node('S2')).toMatchObject({ width: 200, sizing: { horizontal: 'fixed' }, y: 60 });
    expect(g).toMatchObject({ x: 0, y: 0, width: 200, height: 90 });
    expect(t.node('S3').y).toBe(100);
  });

  it('keeps rotated children and children of a turned parent in place', () => {
    const t = setup();
    t.add({ type: 'frame', name: 'Turned', x: 100, y: 100, width: 200, height: 100, rotation: 30, children: [
      { type: 'rect', name: 'In', x: 20, y: 20, width: 40, height: 20, rotation: 10 },
    ] });
    t.add({ type: 'rect', name: 'Out', x: 400, y: 0, width: 40, height: 40, rotation: 45 });
    const before = { In: t.centre('In'), Out: t.centre('Out') };
    const r = t.group(['In', 'Out']);
    const g = t.s.doc.require(r.selection[0]!);
    expect(g.parentId).toBe(t.root);
    expect(t.node('In').rotation).toBeCloseTo(40, 4);
    expect(t.node('Out').rotation).toBe(45);
    near(t.centre('In'), before.In);
    near(t.centre('Out'), before.Out);
    // The group box covers both turned boxes.
    const outHalf = 20 * Math.SQRT2;
    expect(g.x + g.width).toBeCloseTo(420 + outHalf, 3);
  });

  it('is one undo step and refuses layers inside an instance', () => {
    const t = setup();
    board(t);
    const before = JSON.stringify(t.s.doc.toData().nodes);
    t.group(['A', 'B']);
    t.s.undo(user);
    expect(JSON.stringify(t.s.doc.toData().nodes)).toBe(before);
    t.apply(makeComponentOps(t.s.doc, t.id('Board')));
    const inst = instanceOps(t.s.doc, t.id('Board'), t.root, { x: 900, y: 0 });
    t.apply(inst.ops);
    const copyA = [...t.s.doc.walk(inst.rootId)].find((n) => n.name === 'A')!;
    const r = groupOps(t.s.doc, [copyA.id]);
    expect(r.ops).toEqual([]);
    expect(r.notes[0]).toMatch(/instance/);
    // The instance itself groups fine.
    expect(groupOps(t.s.doc, [inst.rootId]).ops.length).toBeGreaterThan(0);
  });

  it('groups locked and hidden layers as they are', () => {
    const t = setup();
    board(t);
    t.apply([{ op: 'update', id: t.id('A'), patch: { locked: true } }, { op: 'update', id: t.id('B'), patch: { visible: false } }]);
    const g = t.s.doc.require(t.group(['A', 'B']).selection[0]!);
    expect(t.node('A').locked).toBe(true);
    expect(t.node('B').visible).toBe(false);
    // A hidden child does not count towards the bounds while another child is shown.
    expect(g).toMatchObject({ x: 10, y: 20, width: 40, height: 40 });
  });
});

describe('group bounds', () => {
  it('follow their children when they move or resize, and undo restores them', () => {
    const t = setup();
    board(t);
    const gid = t.group(['A', 'B']).selection[0]!;
    const seen = { A: t.centre('A'), B: t.centre('B') };
    t.apply([{ op: 'update', id: t.id('A'), patch: { x: -30, y: -10 } }]);
    const g = t.s.doc.require(gid);
    expect({ x: g.x, y: g.y, width: g.width, height: g.height }).toEqual({ x: -20, y: 10, width: 180, height: 70 });
    expect(t.node('A')).toMatchObject({ x: 0, y: 0 });
    expect(t.node('B')).toMatchObject({ x: 120, y: 50 });
    near(t.centre('B'), seen.B);
    t.apply([{ op: 'update', id: t.id('B'), patch: { width: 200 } }]);
    expect(t.s.doc.require(gid).width).toBe(320);
    t.s.undo(user);
    t.s.undo(user);
    expect(t.s.doc.require(gid)).toMatchObject({ x: 10, y: 20, width: 150, height: 60 });
    near(t.centre('A'), seen.A);
    near(t.centre('B'), seen.B);
    t.s.redo(user);
    expect(t.s.doc.require(gid)).toMatchObject({ x: -20, y: 10 });
  });

  it('keeps children of a turned group in place when its box changes', () => {
    const t = setup();
    board(t);
    const gid = t.group(['A', 'B']).selection[0]!;
    t.apply([{ op: 'update', id: gid, patch: { rotation: 30 } }]);
    const seen = t.centre('B');
    t.apply([{ op: 'update', id: t.id('A'), patch: { x: -50, y: -40 } }]);
    expect(t.node('A')).toMatchObject({ x: 0, y: 0 });
    near(t.centre('B'), seen);
  });

  it('fits nested groups from the inside out and agent-made groups on insert', () => {
    const t = setup();
    const gid = t.add({ type: 'group', name: 'G', x: 50, y: 50, children: [
      { type: 'group', name: 'Inner', x: 10, y: 10, children: [{ type: 'rect', name: 'R', x: 5, y: 5, width: 10, height: 10 }] },
      { type: 'rect', name: 'S', x: 100, y: 0, width: 10, height: 10 },
    ] });
    expect(t.s.doc.require(gid)).toMatchObject({ x: 65, y: 50, width: 95, height: 25 });
    expect(t.node('Inner')).toMatchObject({ x: 0, y: 15, width: 10, height: 10 });
    expect(t.node('R')).toMatchObject({ x: 0, y: 0 });
    near(t.centre('R'), { x: 70, y: 70 });
  });
});

describe('ungroup', () => {
  it('restores children at the group slot with their positions, selecting them', () => {
    const t = setup();
    board(t);
    const before = JSON.stringify(t.kids(t.id('Board')));
    const seen = { A: t.centre('A'), B: t.centre('B') };
    t.group(['A', 'B']);
    const r = t.ungroup(['Group']);
    expect(r.label).toBe('Ungroup');
    expect(t.kids(t.id('Board'))).toEqual(['X', 'A', 'B', 'C']);
    expect(r.selection.map((i) => t.s.doc.require(i).name)).toEqual(['A', 'B']);
    near(t.centre('A'), seen.A);
    near(t.centre('B'), seen.B);
    expect(t.node('A')).toMatchObject({ x: 10, y: 20 });
    expect(before).toContain('X');
    t.s.undo(user);
    expect(t.kids(t.id('Board'))).toEqual(['X', 'Group', 'C']);
  });

  it('folds the group rotation, opacity, visibility and lock into the children', () => {
    const t = setup();
    board(t);
    const gid = t.group(['A', 'B']).selection[0]!;
    t.apply([{ op: 'update', id: t.id('A'), patch: { opacity: 0.5 } }]);
    t.apply([{ op: 'update', id: gid, patch: { rotation: 90, opacity: 0.5, visible: false, locked: true } }]);
    const seen = { A: t.centre('A'), B: t.centre('B') };
    t.ungroup(['Group']);
    expect(t.node('A')).toMatchObject({ rotation: 90, opacity: 0.25, visible: false, locked: true });
    expect(t.node('B')).toMatchObject({ rotation: 90, opacity: 0.5 });
    near(t.centre('A'), seen.A);
    near(t.centre('B'), seen.B);
  });

  it('ungroups several groups and nested picks in one step', () => {
    const t = setup();
    board(t);
    const g1 = t.group(['A', 'B']).selection[0]!;
    t.apply([{ op: 'update', id: g1, patch: { name: 'G1' } }]);
    const g2 = t.group(['X', 'C']).selection[0]!;
    t.apply([{ op: 'update', id: g2, patch: { name: 'G2' } }]);
    const outer = t.groupIds([g1, g2]);
    t.apply([{ op: 'update', id: outer, patch: { name: 'Outer' } }]);
    const rev = t.s.revision;
    const r = t.ungroup(['Outer', 'G1', 'G2']);
    expect(t.s.revision).toBe(rev + 1);
    expect(t.kids(t.id('Board'))).toEqual(['A', 'B', 'X', 'C']);
    expect(r.selection.map((i) => t.s.doc.require(i).name).sort()).toEqual(['A', 'B', 'C', 'X']);
    near(t.centre('A'), { x: 130, y: 140 });
  });

  it('releases a frame into auto layout at its slot, and refuses components, instances and plain layers', () => {
    const t = setup();
    t.add({ type: 'frame', name: 'Stack', x: 0, y: 0, width: 200, height: 400, layout: 'column', children: [
      { type: 'rect', name: 'S1', width: 50, height: 50 },
      { type: 'frame', name: 'Box', width: 100, height: 100, children: [{ type: 'rect', name: 'K1', width: 10, height: 10 }, { type: 'rect', name: 'K2', x: 20, width: 10, height: 10 }] },
      { type: 'rect', name: 'S3', width: 50, height: 40 },
    ] });
    t.ungroup(['Box']);
    expect(t.kids(t.id('Stack'))).toEqual(['S1', 'K1', 'K2', 'S3']);
    expect(ungroupOps(t.s.doc, [t.id('S1')]).ops).toEqual([]);
    expect(ungroupOps(t.s.doc, [t.id('S1')]).notes[0]).toMatch(/Only groups/);
    expect(canUngroup(t.s.doc, [t.id('S1')])).toBe(false);
    t.apply(makeComponentOps(t.s.doc, t.id('Stack')));
    expect(ungroupOps(t.s.doc, [t.id('Stack')]).notes[0]).toMatch(/component/);
  });

  it('lists groups a delete would leave empty', () => {
    const t = setup();
    board(t);
    const gid = t.group(['A', 'B']).selection[0]!;
    expect(emptiedGroups(t.s.doc, [t.id('A')])).toEqual([]);
    expect(emptiedGroups(t.s.doc, [t.id('A'), t.id('B')])).toEqual([gid]);
  });
});
