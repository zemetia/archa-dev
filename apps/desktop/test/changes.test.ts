import { beforeEach, describe, expect, it } from 'vitest';
import { applyOps, ArchaDocument, insertOpsFor } from '@archa/core';
import type { Op } from '@archa/schema';
import * as changes from '../src/renderer/canvas/changes';

const agent = { kind: 'agent' as const, id: 'a1', name: 'Swift Heron' };
const user = { kind: 'user' as const, id: 'u1' };

/** A column frame with two rects; the mirror the renderer would hold. */
function setup() {
  const doc = ArchaDocument.create('Test');
  const root = doc.pages[0]!.rootId;
  const { ops, rootId } = insertOpsFor({
    type: 'frame', name: 'Card', layout: 'column', gap: 10, padding: 20, sizing: 'hug',
    children: [{ type: 'rect', name: 'A', width: 100, height: 40 }, { type: 'rect', name: 'B', width: 100, height: 40 }],
  } as never, root);
  applyOps(doc, ops);
  return { doc, card: rootId };
}

/** Plays one transaction the way the store does. */
function play(doc: ArchaDocument, ops: Op[], now: number) {
  const p = changes.before(doc, ops, 1);
  applyOps(doc, ops);
  return changes.after(doc, p, now);
}

beforeEach(() => changes.reset());

describe('canvas change animations', () => {
  it('agents animate; the person animates only discrete commands', () => {
    expect(changes.animates(agent, 'execute')).toBe(true);
    for (const l of ['Paste', 'Duplicate', 'Delete 2 layers', 'Undo: Move', 'Redo: Paste', 'Import Logo']) expect(changes.animates(user, l)).toBe(true);
    for (const l of ['Move', 'Resize', 'Nudge', 'Edit text', 'Rename', 'Create text']) expect(changes.animates(user, l)).toBe(false);
  });

  it('a new layer pops in and the siblings it pushes glide instead of jumping', () => {
    const { doc, card } = setup();
    const [a, b] = doc.children(card);
    const { ops, rootId } = insertOpsFor({ type: 'rect', name: 'New', width: 100, height: 40 } as never, card, 0);
    expect(play(doc, ops, 1000)).toBe(true);

    const start = changes.frame(doc, 1000)!;
    expect(start.live.has(card)).toBe(true); // the frame is drawn live, not from cache
    const pop = start.anim.get(rootId)!;
    expect(pop.alpha).toBeCloseTo(0);
    expect(pop.scale).toBeLessThan(1);
    // A and B moved down by 50 after layout; at t=0 they are drawn where they were.
    expect(start.anim.get(a!.id)!.dy).toBeCloseTo(-50);
    expect(start.anim.get(b!.id)!.dy).toBeCloseTo(-50);

    const mid = changes.frame(doc, 1150)!;
    expect(mid.anim.get(a!.id)!.dy!).toBeGreaterThan(-50);
    expect(mid.anim.get(a!.id)!.dy!).toBeLessThan(0);

    expect(changes.frame(doc, 2000)).toBeNull(); // settled: back to the cached path
    expect(changes.playing()).toBe(false);
  });

  it('a delete makes the remaining siblings close the gap smoothly', () => {
    const { doc, card } = setup();
    const [a, b] = doc.children(card);
    play(doc, [{ op: 'delete', id: a!.id }], 0);
    const f = changes.frame(doc, 0)!;
    expect(f.anim.get(b!.id)!.dy).toBeCloseTo(50); // starts where it was, glides up
    expect(f.anim.has(a!.id)).toBe(false);
  });

  it('a moved glide that is interrupted continues from where it is drawn', () => {
    const { doc, card } = setup();
    play(doc, [{ op: 'update', id: card, patch: { x: 300 } }], 0);
    const mid = changes.frame(doc, 100)!.anim.get(card)!.dx!;
    play(doc, [{ op: 'update', id: card, patch: { x: 600 } }], 100);
    expect(changes.frame(doc, 100)!.anim.get(card)!.dx).toBeCloseTo(mid - 300);
  });
});
