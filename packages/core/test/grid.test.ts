import { describe, expect, it } from 'vitest';
import type { Node, Op } from '@archa/schema';
import { ArchaDocument, DocumentSession, insertOpsFor, lint, normaliseInput, outline } from '../src';

const user = { kind: 'user' as const, id: 'u1' };

function build(input: Record<string, unknown>) {
  const s = new DocumentSession(ArchaDocument.create('Grid'));
  const root = s.doc.pages[0]!.rootId;
  const { ops, rootId } = insertOpsFor(input as never, root);
  s.apply({ author: user, label: 't', baseRevision: 0, ops });
  const apply = (o: Op[]) => s.apply({ author: user, label: 't', baseRevision: s.revision, ops: o });
  return { s, id: rootId, kids: () => s.doc.children(rootId), apply };
}
const cell = (i: number, extra: Record<string, unknown> = {}) => ({ type: 'rect', name: `C${i}`, width: 50, height: 40, ...extra });
const pos = (n: Node) => [n.x, n.y];

describe('grid frames (wrap)', () => {
  it('starts a new row after `wrap` items, columns sharing a fixed width', () => {
    const { s, id, kids } = build({ type: 'frame', name: 'G', layout: 'row', wrap: 5, width: 540, gap: 10, lineGap: 20, padding: 20,
      sizing: { horizontal: 'fixed', vertical: 'hug' }, children: Array.from({ length: 6 }, (_, i) => cell(i, { sizing: { horizontal: 'fill', vertical: 'fixed' } })) });
    // (540 - 40 padding - 4 gaps × 10) / 5 = 92 per column.
    expect(kids().map((k) => k.width)).toEqual([92, 92, 92, 92, 92, 92]);
    expect(kids().slice(0, 5).map((k) => k.y)).toEqual([20, 20, 20, 20, 20]);
    expect(pos(kids()[5]!)).toEqual([20, 80]);
    expect(pos(kids()[4]!)).toEqual([428, 20]);
    expect(s.doc.require(id).height).toBe(20 + 40 + 20 + 40 + 20);
  });

  it('hugs: tracks as wide as their widest item, lines as tall as their tallest', () => {
    const { s, id, kids } = build({ type: 'frame', name: 'G', layout: 'row', wrap: 2, gap: 8, sizing: 'hug', align: 'center', children: [
      cell(0, { width: 30 }), cell(1, { width: 70, height: 60 }), cell(2, { width: 50 }),
    ] });
    expect(s.doc.require(id)).toMatchObject({ width: 50 + 8 + 70, height: 60 + 8 + 40 });
    expect(pos(kids()[0]!)).toEqual([0, 10]);
    expect(pos(kids()[1]!)).toEqual([58, 0]);
    expect(pos(kids()[2]!)).toEqual([0, 68]);
  });

  it('a column grid fills columns top to bottom', () => {
    const { kids } = build({ type: 'frame', name: 'G', layout: 'column', wrap: 2, gap: 4, lineGap: 16, sizing: 'hug', children: [cell(0), cell(1), cell(2)] });
    expect(kids().map(pos)).toEqual([[0, 0], [0, 44], [66, 0]]);
  });

  it('reads CSS / Figma grid spellings', () => {
    expect(normaliseInput({ type: 'frame', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 32, columnGap: 16 })).toMatchObject({ layout: 'row', wrap: 4, gap: 16, lineGap: 32 });
    expect(normaliseInput({ type: 'frame', layout: 'grid', columns: 3 })).toMatchObject({ layout: 'row', wrap: 3 });
    expect(normaliseInput({ type: 'frame', rows: 2 })).toMatchObject({ layout: 'column', wrap: 2 });
    expect(normaliseInput({ type: 'frame', layout: 'column', rowGap: 12 })).toMatchObject({ gap: 12 });
  });

  it('describes the grid in the outline', () => {
    const { s, id } = build({ type: 'frame', name: 'G', columns: 3, gap: 8, children: [cell(0)] });
    expect(outline(s.doc, id)).toContain('grid 3 per row');
  });
});

describe('blur shorthands', () => {
  it('turns backdropBlur / CSS backdrop-filter / blur into effects', () => {
    expect(normaliseInput({ type: 'frame', backdropBlur: 16 }).effects).toEqual([{ type: 'background-blur', radius: 16, visible: true }]);
    expect(normaliseInput({ type: 'frame', backdropFilter: 'blur(12px)', effects: [{ type: 'shadow', y: 4 }] }).effects).toMatchObject([{ type: 'drop-shadow' }, { type: 'background-blur', radius: 12 }]);
    expect(normaliseInput({ type: 'rect', blur: 6 }).effects).toEqual([{ type: 'layer-blur', radius: 6, visible: true }]);
  });

  it('flags glass that cannot show through', () => {
    const { s, id, apply } = build({ type: 'frame', name: 'Nav', fills: ['#ffffff'], backdropBlur: 16 });
    expect(lint(s.doc, [id]).map((i) => i.rule)).toContain('effect/blur-hidden');
    apply([{ op: 'update', id, patch: normaliseInput({ fills: ['#ffffff26'] }) }]);
    expect(lint(s.doc, [id]).map((i) => i.rule)).not.toContain('effect/blur-hidden');
  });
});
