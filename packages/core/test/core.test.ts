import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentError, DocumentSession, insertOpsFor, lint, subtreeHash } from '../src';

const user = { kind: 'user' as const, id: 'u1' };
const agent = { kind: 'agent' as const, id: 'claude' };

function setup() {
  const s = new DocumentSession(ArchaDocument.create('Test'));
  const root = s.doc.pages[0]!.rootId;
  return { s, root };
}

describe('session.apply', () => {
  it('inserts a subtree from friendly input and lays out a column', () => {
    const { s, root } = setup();
    const { ops, rootId } = insertOpsFor({
      type: 'frame', name: 'Card', layout: 'column', gap: 10, padding: 20, sizing: 'hug', fill: '#ffffff',
      children: [
        { type: 'rect', name: 'A', width: 100, height: 40 },
        { type: 'rect', name: 'B', width: 60, height: 30 },
      ],
    } as never, root);
    s.apply({ author: user, label: 'add', baseRevision: 0, ops });
    const card = s.doc.require(rootId);
    expect(card.width).toBe(140);
    expect(card.height).toBe(20 + 40 + 10 + 30 + 20);
    const [a, b] = s.doc.children(rootId);
    expect([a!.x, a!.y, b!.y]).toEqual([20, 20, 70]);
  });

  it('wraps fill-width text at its final width before a hug frame measures it', () => {
    const { s, root } = setup();
    const { ops, rootId } = insertOpsFor({
      type: 'frame', name: 'Card', width: 360, layout: 'column', padding: 24, sizing: { horizontal: 'fixed', vertical: 'hug' },
      children: [{ type: 'text', name: 'Blurb', text: 'Everything in Free, plus unlimited agent runs and shared libraries.', textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' }, fontSize: 14, lineHeight: 1.5 }],
    } as never, root);
    s.apply({ author: user, label: 'add', baseRevision: 0, ops });
    const [blurb] = s.doc.children(rootId);
    expect(blurb!.width).toBe(312);
    expect(blurb!.height).toBeLessThanOrEqual(63); // 2–3 lines, not one word per line
    expect(s.doc.require(rootId).height).toBe(48 + blurb!.height);
  });

  it('rejects a bad property and leaves the document unchanged', () => {
    const { s, root } = setup();
    const { ops } = insertOpsFor({ type: 'rect', name: 'R', width: 10, height: 10 } as never, root);
    s.apply({ author: user, label: 'add', baseRevision: 0, ops });
    const id = ops[0]!.node.id;
    const before = subtreeHash(s.doc, root);
    expect(() => s.apply({ author: user, label: 'bad', baseRevision: 1, ops: [
      { op: 'update', id, patch: { width: 50 } },
      { op: 'update', id, patch: { width: '100%' } },
    ] })).toThrow(DocumentError);
    expect(subtreeHash(s.doc, root)).toBe(before);
    expect(s.revision).toBe(1);
  });

  it('refuses children on a primitive', () => {
    const { s, root } = setup();
    const { ops } = insertOpsFor({ type: 'rect', name: 'R' } as never, root);
    s.apply({ author: user, label: 'add', baseRevision: 0, ops });
    const bad = insertOpsFor({ type: 'text', text: 'x' } as never, ops[0]!.node.id);
    expect(() => s.apply({ author: user, label: 'bad', baseRevision: 1, ops: bad.ops })).toThrow(/cannot have children/);
  });
});

describe('undo', () => {
  it('is per author and restores hashes', () => {
    const { s, root } = setup();
    const h0 = subtreeHash(s.doc, root);
    const a = insertOpsFor({ type: 'frame', name: 'F', width: 200, height: 200, children: [{ type: 'rect', name: 'R' }] } as never, root);
    s.apply({ author: agent, label: 'agent frame', baseRevision: 0, ops: a.ops });
    const b = insertOpsFor({ type: 'ellipse', name: 'E' } as never, root);
    s.apply({ author: user, label: 'user ellipse', baseRevision: 1, ops: b.ops });

    s.undo(user);
    expect(s.doc.get(b.rootId)).toBeUndefined();
    expect(s.doc.get(a.rootId)).toBeDefined();

    s.apply({ author: user, label: 'delete frame', baseRevision: s.revision, ops: [{ op: 'delete', id: a.rootId }] });
    s.undo(user);
    expect(s.doc.children(a.rootId).map((n) => n.name)).toEqual(['R']);

    s.undoAll(agent);
    expect(subtreeHash(s.doc, root)).toBe(h0);
  });
});

describe('lint', () => {
  it('reports invisible text and clipping', () => {
    const { s, root } = setup();
    const { ops, rootId } = insertOpsFor({ type: 'frame', name: 'F', width: 100, height: 100, children: [
      { type: 'text', name: 'T', text: 'hello' },
      { type: 'rect', name: 'Big', x: 50, width: 100, height: 10, fill: '#000' },
    ] } as never, root);
    s.apply({ author: user, label: 'x', baseRevision: 0, ops });
    const rules = lint(s.doc, [rootId]).map((i) => i.rule);
    expect(rules).toContain('text/no-fill');
    expect(rules).toContain('layout/clipped');
  });

  it('reads text contrast against the shape behind it, and accepts a marked bleed', () => {
    const { s, root } = setup();
    const { ops, rootId } = insertOpsFor({ type: 'frame', name: 'Post', width: 1080, height: 1350, fill: '#f6efe4', children: [
      { type: 'text', name: 'Hero', text: '3', absolute: true, x: 600, y: 600, fontSize: 1100, fill: '#c8553d' },
      { type: 'frame', name: 'Sticker art', x: 400, y: 700, width: 300, height: 300, children: [{ type: 'ellipse', name: 'Disc', width: 300, height: 300, fill: '#c8553d' }] },
      { type: 'text', name: 'Price', text: '18K', x: 450, y: 800, fontSize: 92, fill: '#f6efe4' },
      { type: 'text', name: 'Ghost', text: 'faint', x: 72, y: 72, fontSize: 30, fill: '#efe6d8' },
    ] } as never, root);
    s.apply({ author: user, label: 'x', baseRevision: 0, ops });
    const issues = lint(s.doc, [rootId]);
    expect(issues.filter((i) => i.rule === 'a11y/contrast').map((i) => i.nodeName)).toEqual(['Ghost']); // Price sits on the disc, not the cream post
    expect(issues.some((i) => i.rule === 'layout/clipped')).toBe(false); // the hero bleed is marked absolute
  });
});
