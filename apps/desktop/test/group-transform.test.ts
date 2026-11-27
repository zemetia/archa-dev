import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import type { Node, NodeInput, Op } from '@archa/schema';
import { nodeCorners, visualBounds } from '../src/renderer/lib/geometry';
import { groupHandleAt, groupPatches, groupScale, groupStart, itemCenter, mappedCorners, pivotOf, placeItem, rotateAbout, scaleAbout, type Item } from '../src/renderer/lib/groupTransform';

/* Multi-selection transform: scale about an anchor, turn about a pivot, mixed parents, flips. */

const ID: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const item = (o: Partial<Item>): Item => ({ id: 'a', x: 0, y: 0, width: 100, height: 50, rotation: 0, parent: ID, parentRotation: 0, inLayout: false, ...o });
const close = (a: { x: number; y: number }, b: { x: number; y: number }, digits = 4) => { expect(a.x).toBeCloseTo(b.x, digits); expect(a.y).toBeCloseTo(b.y, digits); };

function session(...inputs: NodeInput[]) {
  const s = new DocumentSession(ArchaDocument.create('grp'));
  const root = s.doc.pages[0]!.rootId;
  for (const input of inputs) s.apply({ author: { id: 't', kind: 'user' }, label: 'x', baseRevision: s.revision, ops: insertOpsFor(input, root).ops });
  return s;
}
const idOf = (s: DocumentSession, name: string) => s.doc.findByName(name)[0]!.id;
/** Applies the patches the way the canvas commits them: one transaction. */
function commit(s: DocumentSession, patches: Map<string, Record<string, unknown>>) {
  const ops: Op[] = [...patches].map(([id, patch]) => ({ op: 'update', id, patch }) as Op);
  s.apply({ author: { id: 't', kind: 'user' }, label: 'Scale', baseRevision: s.revision, ops });
}

describe('group scale factors', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('keeps the opposite handle fixed', () => {
    const r = groupScale(box, 'e', 100, 30);
    expect(r).toMatchObject({ anchor: { x: 100, y: 150 }, sx: 1.5, sy: 1 });
    const t = scaleAbout(r.anchor, r.sx, r.sy);
    expect(mappedCorners(box, t)[0]).toEqual({ x: 100, y: 100 });
    expect(mappedCorners(box, t)[2]).toEqual({ x: 400, y: 200 });
  });

  it('Alt scales from the centre (both sides move)', () => {
    const r = groupScale(box, 'se', 50, 50, { fromCenter: true });
    expect(r.anchor).toEqual({ x: 200, y: 150 });
    expect(r.sx).toBeCloseTo(1.5);
    expect(r.sy).toBeCloseTo(2);
  });

  it('Shift keeps the aspect ratio: corners take the larger change, sides follow without flipping', () => {
    expect(groupScale(box, 'se', 100, 10, { keepRatio: true })).toMatchObject({ sx: 1.5, sy: 1.5 });
    const side = groupScale(box, 'w', 300, 0, { keepRatio: true });
    expect(side.sx).toBeCloseTo(-0.5);
    expect(side.sy).toBeCloseTo(0.5);
  });

  it('dragging past the anchor flips; it never collapses to zero', () => {
    expect(groupScale(box, 'e', -300, 0).sx).toBeCloseTo(-0.5);
    expect(Math.abs(groupScale(box, 'e', -200, 0).sx)).toBeGreaterThan(0);
  });

  it('finds handles and the knob on the shared box', () => {
    expect(groupHandleAt(box, { x: 300, y: 200 }, 1)).toBe('se');
    expect(groupHandleAt(box, { x: 200, y: 78 }, 1)).toBe('rotate');
    expect(groupHandleAt(box, { x: 200, y: 150 }, 1)).toBeNull();
  });
});

describe('placing one layer', () => {
  it('scales position and size about the anchor (the arrangement keeps its shape)', () => {
    const t = scaleAbout({ x: 0, y: 0 }, 2, 3);
    expect(placeItem(item({ x: 10, y: 20 }), t)).toMatchObject({ x: 20, y: 60, width: 200, height: 150, rotation: 0 });
  });

  it('turns about a pivot: the centre orbits and the turn adds up, size untouched', () => {
    const it0 = item({ x: 200, y: 0, width: 100, height: 50, rotation: 30 });
    const b = placeItem(it0, rotateAbout({ x: 0, y: 0 }, 90));
    expect(b.rotation).toBeCloseTo(120);
    expect(b.width).toBeCloseTo(100);
    close({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: -25, y: 250 });
  });

  it('a turned layer under a 90°-multiple-aligned scale stretches along the right axis', () => {
    // Turned 90°: its own width runs down the page, so a vertical stretch widens it.
    const b = placeItem(item({ rotation: 90 }), scaleAbout({ x: 50, y: 25 }, 1, 2));
    expect(b.width).toBeCloseTo(200);
    expect(b.height).toBeCloseTo(50);
    expect(b.rotation).toBeCloseTo(90);
  });

  it('a flip keeps the outline and mirrors the turn (upright stays upright)', () => {
    const flipX = placeItem(item({ x: 10, y: 0 }), scaleAbout({ x: 0, y: 0 }, -1, 1));
    expect(flipX).toMatchObject({ x: -110, y: 0, width: 100, height: 50, rotation: 0 });
    const flipY = placeItem(item({ rotation: 30 }), scaleAbout({ x: 0, y: 0 }, 1, -1));
    expect(flipY.rotation).toBeCloseTo(-30);
    expect(flipY.width).toBeCloseTo(100);
    close({ x: flipY.x + 50, y: flipY.y + 25 }, { x: 50, y: -25 });
  });

  it('both axes flipped is a half turn', () => {
    expect(placeItem(item({}), scaleAbout({ x: 0, y: 0 }, -1, -1)).rotation).toBeCloseTo(180);
  });

  it('works through a turned, moved parent (local coordinates in, local coordinates out)', () => {
    // Parent at (100, 0) turned 90° about its own centre (100×100 box).
    const parent: Item['parent'] = [0, 1, -1, 0, 200, 0];
    const it0 = item({ x: 0, y: 0, width: 20, height: 10, parent, parentRotation: 90 });
    const c0 = itemCenter(it0);
    close(c0, { x: 195, y: 10 });
    const b = placeItem(it0, rotateAbout(c0, 45));
    expect(b.rotation).toBeCloseTo(45);
    close({ x: b.x, y: b.y }, { x: 0, y: 0 });
  });
});

describe('pivots', () => {
  const items = [item({ id: 'a', x: 0, y: 0, width: 10, height: 10 }), item({ id: 'b', x: 0, y: 90, width: 10, height: 10 }), item({ id: 'c', x: 290, y: 0, width: 10, height: 10 })];
  const box = { x: 0, y: 0, width: 300, height: 100 };
  it('box centre vs mean of centres', () => {
    expect(pivotOf(items, box, 'box')).toEqual({ x: 150, y: 50 });
    close(pivotOf(items, box, 'mean'), { x: (5 + 5 + 295) / 3, y: (5 + 95 + 5) / 3 });
  });
});

describe('document patches', () => {
  it('scales two layers as one unit, in one transaction', () => {
    const s = session({ type: 'rect', name: 'A', x: 0, y: 0, width: 100, height: 100 } as never, { type: 'rect', name: 'B', x: 200, y: 0, width: 100, height: 50, cornerRadius: 8 } as never);
    const ids = [idOf(s, 'A'), idOf(s, 'B')];
    const start = groupStart(s.doc, ids)!;
    expect(start.box).toEqual({ x: 0, y: 0, width: 300, height: 100 });
    const g = groupScale(start.box, 'se', 300, 100);
    const rev = s.revision;
    commit(s, groupPatches(start, scaleAbout(g.anchor, g.sx, g.sy), ids, false));
    expect(s.revision).toBe(rev + 1);
    expect(s.doc.require(ids[0]!)).toMatchObject({ x: 0, y: 0, width: 200, height: 200 });
    expect(s.doc.require(ids[1]!)).toMatchObject({ x: 400, y: 0, width: 200, height: 100, cornerRadius: 8 });
  });

  it('Scale tool mode also scales radii, strokes and font sizes', () => {
    const s = session({ type: 'rect', name: 'A', x: 0, y: 0, width: 100, height: 100, cornerRadius: 8, strokes: [{ color: '#000', width: 2 }] } as never, { type: 'text', name: 'T', x: 200, y: 0, text: 'Hi', fontSize: 20 } as never);
    const ids = [idOf(s, 'A'), idOf(s, 'T')];
    const start = groupStart(s.doc, ids)!;
    commit(s, groupPatches(start, scaleAbout({ x: 0, y: 0 }, 2, 2), ids, true));
    const a = s.doc.require(ids[0]!) as Node & { cornerRadius: number; strokes: Array<{ width: number }> };
    expect(a.cornerRadius).toBe(16);
    expect(a.strokes[0]!.width).toBe(4);
    expect((s.doc.require(ids[1]!) as Node & { fontSize: number }).fontSize).toBe(40);
  });

  it('normal resize keeps the font size and wraps text at its new width', () => {
    const s = session({ type: 'text', name: 'T', x: 0, y: 0, text: 'Hello', fontSize: 20 } as never, { type: 'rect', name: 'R', x: 0, y: 100, width: 100, height: 100 } as never);
    const ids = [idOf(s, 'T'), idOf(s, 'R')];
    const start = groupStart(s.doc, ids)!;
    commit(s, groupPatches(start, scaleAbout({ x: 0, y: 0 }, 2, 1), ids, false));
    expect(s.doc.require(ids[0]!)).toMatchObject({ fontSize: 20, textSizing: 'auto-height' });
  });

  it('turns layers in different parents about one pivot', () => {
    const s = session(
      { type: 'frame', name: 'F', x: 300, y: 0, width: 200, height: 200, rotation: 90, children: [{ type: 'rect', name: 'In', x: 0, y: 0, width: 40, height: 20 }] } as never,
      { type: 'rect', name: 'Out', x: 0, y: 0, width: 40, height: 20, rotation: 10 } as never,
    );
    const ids = [idOf(s, 'In'), idOf(s, 'Out')];
    const start = groupStart(s.doc, ids)!;
    const pivot = pivotOf(start.items, start.box, 'mean');
    const t = rotateAbout(pivot, 30);
    const before = ids.map((id) => nodeCorners(s.doc, id));
    commit(s, groupPatches(start, t, ids, false));
    // Every corner of every layer moved exactly by the group turn.
    ids.forEach((id, i) => { nodeCorners(s.doc, id).forEach((p, k) => {
      const q = before[i]![k]!;
      close(p, { x: t[0] * q.x + t[2] * q.y + t[4], y: t[1] * q.x + t[3] * q.y + t[5] }, 1);
    }); });
    expect(s.doc.require(ids[0]!).rotation).toBeCloseTo(30);
    expect(s.doc.require(ids[1]!).rotation).toBeCloseTo(40);
  });

  it('auto-layout children keep their slot: size changes, position stays with the layout', () => {
    const s = session({ type: 'frame', name: 'Row', x: 0, y: 0, width: 400, height: 100, layout: 'row', gap: 10, children: [{ type: 'rect', name: 'A', width: 50, height: 50 }, { type: 'rect', name: 'B', width: 50, height: 50 }] } as never);
    const ids = [idOf(s, 'A'), idOf(s, 'B')];
    const start = groupStart(s.doc, ids)!;
    const patches = groupPatches(start, scaleAbout({ x: start.box.x, y: start.box.y }, 2, 2), ids, false);
    expect(patches.get(ids[0]!)).not.toHaveProperty('x');
    commit(s, patches);
    expect(s.doc.require(ids[0]!)).toMatchObject({ width: 100, height: 100 });
    expect(s.doc.require(ids[1]!).x).toBe(s.doc.require(ids[0]!).x + 110);
  });

  it('a layer inside another selected layer rides along instead of moving twice', () => {
    const s = session({ type: 'frame', name: 'F', x: 0, y: 0, width: 100, height: 100, children: [{ type: 'rect', name: 'In', x: 10, y: 10, width: 20, height: 20 }] } as never);
    const ids = [idOf(s, 'F'), idOf(s, 'In')];
    const start = groupStart(s.doc, ids)!;
    expect(start.items.map((i) => i.id)).toEqual([ids[0]]);
    commit(s, groupPatches(start, scaleAbout({ x: 0, y: 0 }, 2, 2), ids, false));
    expect(visualBounds(s.doc, ids[1]!)).toMatchObject({ x: 10, y: 10 });
  });
});
