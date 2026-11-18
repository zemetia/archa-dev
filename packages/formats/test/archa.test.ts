import { describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor, subtreeHash } from '@archa/core';
import { decodeArcha, encodeArcha, exportSvg, FormatError } from '../src';

describe('.archa', () => {
  it('round-trips losslessly', () => {
    const s = new DocumentSession(ArchaDocument.create('Round trip'));
    const root = s.doc.pages[0]!.rootId;
    const { ops, rootId } = insertOpsFor({ type: 'frame', name: 'Hero', layout: 'row', gap: 8, padding: 16, sizing: 'hug', fill: '#0f172a', children: [
      { type: 'text', name: 'Title', text: 'Hello', fill: '#ffffff', fontSize: 32 },
      { type: 'ellipse', name: 'Dot', width: 12, height: 12, fill: '#ef4444' },
    ] } as never, root);
    s.apply({ author: { kind: 'user', id: 'u' }, label: 'x', baseRevision: 0, ops });

    const back = new DocumentSession(decodeArcha(encodeArcha(s.doc.toData())));
    expect(back.doc.meta.name).toBe('Round trip');
    expect(subtreeHash(back.doc, root)).toBe(subtreeHash(s.doc, root));
    expect(exportSvg(back.doc, rootId)).toContain('<tspan');
  });

  it('rejects garbage with a clear error', () => {
    expect(() => decodeArcha(new Uint8Array([1, 2, 3]))).toThrow(FormatError);
  });
});
