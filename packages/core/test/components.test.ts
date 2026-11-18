import { describe, expect, it } from 'vitest';
import {
  ArchaDocument, DocumentError, DocumentSession, detachOps, insertOpsFor, instanceOf, instanceOps, instancesOf,
  listComponents, makeComponentOps, syncInstanceOps, unmakeComponentOps,
} from '../src';

const user = { kind: 'user' as const, id: 'u1' };

function setup() {
  const s = new DocumentSession(ArchaDocument.create('Test'));
  const root = s.doc.pages[0]!.rootId;
  const apply = (ops: Parameters<DocumentSession['apply']>[0]['ops']) => s.apply({ author: user, label: 't', baseRevision: s.revision, ops });
  const { ops, rootId } = insertOpsFor({
    type: 'frame', name: 'Button', layout: 'row', padding: 12, sizing: 'hug', fill: '#8b5cf6', cornerRadius: 8,
    children: [{ type: 'text', name: 'Label', text: 'Buy' }],
  } as never, root);
  apply(ops);
  return { s, root, apply, button: rootId };
}

describe('components (linked v1)', () => {
  it('marks a frame as a component and lists it with its instance count', () => {
    const { s, root, apply, button } = setup();
    apply(makeComponentOps(s.doc, button, 'Primary action'));
    apply(instanceOps(s.doc, button, root, { x: 300 }).ops);
    apply(instanceOps(s.doc, button, root, { x: 500 }).ops);
    expect(listComponents(s.doc)).toEqual([expect.objectContaining({ id: button, name: 'Button', description: 'Primary action', instances: 2 })]);
  });

  it('inserts an instance as a full copy linked to its main, with no second main', () => {
    const { s, root, apply, button } = setup();
    apply(makeComponentOps(s.doc, button));
    const { ops, rootId } = instanceOps(s.doc, button, root, { x: 300, y: 10 });
    apply(ops);
    const inst = s.doc.require(rootId);
    expect(instanceOf(inst)).toBe(button);
    expect(inst.meta.component).toBeUndefined();
    expect([inst.x, inst.y]).toEqual([300, 10]);
    expect(s.doc.children(rootId).map((c) => c.name)).toEqual(['Label']);
    expect(listComponents(s.doc)).toHaveLength(1);
  });

  it('syncs an instance after the main changes, keeping its position', () => {
    const { s, root, apply, button } = setup();
    apply(makeComponentOps(s.doc, button));
    const { ops, rootId } = instanceOps(s.doc, button, root, { x: 300 });
    apply(ops);
    const label = s.doc.children(button)[0]!.id;
    apply([{ op: 'update', id: label, patch: { text: 'Buy now' } }, { op: 'update', id: button, patch: { cornerRadius: 20 } }]);
    apply(syncInstanceOps(s.doc, rootId));
    const inst = s.doc.require(rootId);
    expect(inst.type === 'frame' && inst.cornerRadius).toBe(20);
    expect(inst.x).toBe(300);
    const text = s.doc.children(rootId)[0]!;
    expect(text.type === 'text' && text.text).toBe('Buy now');
    expect(instanceOf(inst)).toBe(button);
  });

  it('detaches instances when a component is unmade', () => {
    const { s, root, apply, button } = setup();
    apply(makeComponentOps(s.doc, button));
    apply(instanceOps(s.doc, button, root).ops);
    apply(unmakeComponentOps(s.doc, button));
    expect(listComponents(s.doc)).toEqual([]);
    expect(instancesOf(s.doc, button)).toEqual([]);
  });

  it('refuses non-frames and instances as components', () => {
    const { s, root, apply, button } = setup();
    const label = s.doc.children(button)[0]!.id;
    expect(() => makeComponentOps(s.doc, label)).toThrow(DocumentError);
    apply(makeComponentOps(s.doc, button));
    const { ops, rootId } = instanceOps(s.doc, button, root);
    apply(ops);
    expect(() => makeComponentOps(s.doc, rootId)).toThrow(/instance/);
    apply(detachOps(s.doc, rootId));
    expect(() => makeComponentOps(s.doc, rootId)).not.toThrow();
  });
});

describe('library insert', () => {
  it('places a main on first use and instances afterwards', async () => {
    const { libraryInsertOps, subtreeInput, libraryRef, componentMeta } = await import('../src');
    const { s, root, apply, button } = setup();
    const item = { id: 'btn', name: 'Button', description: 'Primary', width: 80, height: 40, node: subtreeInput(s.doc, button) };
    const first = libraryInsertOps(s.doc, 'mine:btn', item, root, { x: 400 });
    apply(first.ops);
    expect(first.placed).toBe('main');
    expect(libraryRef(s.doc.require(first.rootId))).toBe('mine:btn');
    expect(componentMeta(s.doc.require(first.rootId))?.description).toBe('Primary');
    const second = libraryInsertOps(s.doc, 'mine:btn', item, root, { x: 600 });
    apply(second.ops);
    expect(second.placed).toBe('instance');
    expect(instanceOf(s.doc.require(second.rootId))).toBe(first.rootId);
  });
});
