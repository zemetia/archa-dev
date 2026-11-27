import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor, libraryInsertOps, makeComponentOps } from '@archa/core';
import { LibraryStore, libraryPublishSchema } from '../src/stores/library';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-library-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
});

function docWithButton() {
  const s = new DocumentSession(ArchaDocument.create('Lib'));
  const root = s.doc.pages[0]!.rootId;
  const { ops, rootId } = insertOpsFor({ type: 'frame', name: 'Button', fill: '#8b5cf6', children: [{ type: 'text', name: 'Label', text: 'Go' }] } as never, root);
  s.apply({ author: { kind: 'user', id: 'u' }, label: 'add', baseRevision: 0, ops });
  s.apply({ author: { kind: 'user', id: 'u' }, label: 'comp', baseRevision: s.revision, ops: makeComponentOps(s.doc, rootId, 'Primary action') });
  return { s, root, button: rootId };
}

describe('LibraryStore', () => {
  it('publishes a component with manifest and thumbnail, lists and removes it', () => {
    const lib = new LibraryStore();
    const { s, button } = docWithButton();
    const item = lib.publish(s.doc, button, 'my-library', Buffer.from('png').toString('base64'));
    expect(item).toMatchObject({ library: 'my-library', name: 'Button', description: 'Primary action', ref: `my-library:${item.id}` });
    const manifest = JSON.parse(readFileSync(join(home, 'libraries', 'my-library', 'library.json'), 'utf8'));
    expect(manifest).toMatchObject({ format: 'archa-library', exports: { components: [item.id] } });
    expect(lib.list()).toEqual([expect.objectContaining({ ref: item.ref, thumb: expect.stringMatching(/^data:image\/png;base64,/) })]);
    lib.remove('my-library', item.id);
    expect(lib.list()).toEqual([]);
    expect(existsSync(join(home, 'libraries', 'my-library', 'components', `${item.id}.png`))).toBe(false);
  });

  it('round-trips into another document as a main, and re-publishing that main updates the same entry', () => {
    const lib = new LibraryStore();
    const { s, button } = docWithButton();
    const item = lib.publish(s.doc, button, 'my-library');
    const other = new DocumentSession(ArchaDocument.create('Other'));
    const root = other.doc.pages[0]!.rootId;
    const r = libraryInsertOps(other.doc, item.ref, lib.read('my-library', item.id)!, root, { x: 0, y: 0 });
    other.apply({ author: { kind: 'user', id: 'u' }, label: 'ins', baseRevision: 0, ops: r.ops });
    const again = lib.publish(other.doc, r.rootId, 'my-library');
    expect(again.id).toBe(item.id);
    expect(lib.list()).toHaveLength(1);
  });

  it('rejects unsafe library names at the boundary', () => {
    expect(libraryPublishSchema.safeParse({ docId: 'd', nodeId: 'n', library: '../escape' }).success).toBe(false);
    expect(libraryPublishSchema.parse({ docId: 'd', nodeId: 'n' }).library).toBe('my-library');
  });
});
