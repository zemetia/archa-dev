import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, hexToColor } from '@archa/schema';
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

  it('keeps variables, comments and the new node types', () => {
    const s = new DocumentSession(ArchaDocument.create('v2'));
    const root = s.doc.pages[0]!.rootId;
    const shapes = [
      { type: 'polygon', sides: 5, fill: '#22c55e' },
      { type: 'path', d: 'M0 0 L10 10', viewBox: { x: 0, y: 0, width: 10, height: 10 }, strokes: ['#000000'] },
      { type: 'image', src: 'data:image/png;base64,AAAA' },
      { type: 'sticky', text: 'Idea', fill: '#fde68a' },
      { type: 'embed', url: 'https://example.com' },
    ].flatMap((n) => insertOpsFor(n as never, root).ops);
    s.apply({ author: { kind: 'user', id: 'u' }, label: 'x', baseRevision: 0, ops: [
      ...shapes,
      { op: 'setVariable', variable: { id: 'v1', name: 'color/accent', type: 'color', value: hexToColor('#8b5cf6') } },
      { op: 'setComment', comment: { id: 'c1', nodeId: null, x: 10, y: 20, resolved: false, messages: [{ id: 'm1', author: 'Ana', text: 'Bigger title', ts: 1 }] } },
    ] });
    const back = decodeArcha(encodeArcha(s.doc.toData()));
    expect(back.variables).toEqual(s.doc.toData().variables);
    expect(back.comments?.[0]?.messages[0]?.text).toBe('Bigger title');
    expect(Object.values(back.nodes).map((n) => n.type).sort()).toEqual(['embed', 'image', 'page', 'path', 'polygon', 'sticky']);
    const path = Object.values(back.nodes).find((n) => n.type === 'path')!;
    expect(exportSvg(new ArchaDocument(back), path.id)).toContain('<path');
  });

  it('migrates the v1 fixture to the current format', () => {
    const dir = join(__dirname, 'fixtures/archa-v1');
    const file = (p: string) => new Uint8Array(readFileSync(join(dir, p)));
    const data = decodeArcha(zipSync({ 'manifest.json': file('manifest.json'), 'document.json': file('document.json'), 'pages/page00001.json': file('pages/page00001.json') }));
    expect(data.meta.formatVersion).toBe(FORMAT_VERSION);
    expect(data.variables).toEqual([]);
    expect(data.comments).toEqual([]);
    expect(data.nodes.frame00001?.name).toBe('Card');
  });

  it('migrates the v2 fixture to the current format', () => {
    const dir = join(__dirname, 'fixtures/archa-v2');
    const file = (p: string) => new Uint8Array(readFileSync(join(dir, p)));
    const data = decodeArcha(zipSync({ 'manifest.json': file('manifest.json'), 'document.json': file('document.json'), 'pages/page00001.json': file('pages/page00001.json') }));
    expect(data.meta.formatVersion).toBe(FORMAT_VERSION);
    const card = data.nodes.frame00001;
    expect(card?.type === 'frame' && card.effects[0]?.type).toBe('drop-shadow');
  });

  it('rejects garbage with a clear error', () => {
    expect(() => decodeArcha(new Uint8Array([1, 2, 3]))).toThrow(FormatError);
  });
});
