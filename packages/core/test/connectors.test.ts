import { describe, expect, it } from 'vitest';
import type { ConnectorNode } from '@archa/schema';
import { ArchaDocument, connectorGeometry, DocumentSession, insertOpsFor } from '../src';

const user = { kind: 'user' as const, id: 'u1' };

function setup() {
  const s = new DocumentSession(ArchaDocument.create('Test'));
  const root = s.doc.pages[0]!.rootId;
  const apply = (ops: Parameters<DocumentSession['apply']>[0]['ops']) => s.apply({ author: user, label: 't', baseRevision: s.revision, ops });
  const add = (input: Record<string, unknown>) => { const r = insertOpsFor(input as never, root); apply(r.ops); return r.rootId; };
  const a = add({ type: 'rect', name: 'A', x: 0, y: 0, width: 100, height: 50 });
  const b = add({ type: 'rect', name: 'B', x: 300, y: 200, width: 100, height: 50 });
  const conn = (input: Record<string, unknown>) => s.doc.require(add({ type: 'connector', ...input })) as ConnectorNode;
  return { s, apply, a, b, conn };
}

/** Points of a connector in page coordinates. */
const world = (n: ConnectorNode) => n.points.map((p) => ({ x: p.x + n.x, y: p.y + n.y }));

describe('connectors', () => {
  it('routes an elbow from the facing sides with 90° segments only', () => {
    const { a, b, conn } = setup();
    const pts = world(conn({ start: a, end: b }));
    expect(pts[0]).toEqual({ x: 100, y: 25 });
    expect(pts.at(-1)).toEqual({ x: 300, y: 225 });
    expect(pts).toHaveLength(4);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.x === pts[i - 1]!.x || pts[i]!.y === pts[i - 1]!.y).toBe(true);
  });

  it('draws a straight line between the box edges facing each other', () => {
    const { a, b, conn } = setup();
    const n = conn({ from: a, to: b, routing: 'straight' });
    expect(n.start.nodeId).toBe(a);
    expect(world(n)).toHaveLength(2);
  });

  it('follows an attached node when it moves, and keeps its place when that node is deleted', () => {
    const { s, apply, a, b, conn } = setup();
    const id = conn({ start: a, end: b }).id;
    apply([{ op: 'update', id: b, patch: { x: 300, y: 0 } }]);
    const moved = s.doc.require(id) as ConnectorNode;
    expect(world(moved)).toEqual([{ x: 100, y: 25 }, { x: 300, y: 25 }]);
    apply([{ op: 'delete', id: b }]);
    expect(world(s.doc.require(id) as ConnectorNode).at(-1)).toEqual({ x: 300, y: 25 });
  });

  it('supports a free end and explicit sides', () => {
    const { a, conn } = setup();
    const pts = world(conn({ start: { nodeId: a, side: 'bottom' }, end: { x: 200, y: 300 } }));
    expect(pts[0]).toEqual({ x: 50, y: 50 });
    expect(pts.at(-1)).toEqual({ x: 200, y: 300 });
  });

  it('rounds corners and adds an arrow head at the end only by default', () => {
    const { a, b, conn } = setup();
    const g = connectorGeometry(conn({ start: a, end: b, cornerRadius: 12 }));
    expect(g.line).toContain('Q');
    expect(g.caps).toHaveLength(1);
    const sharp = connectorGeometry(conn({ start: a, end: b, cornerRadius: 0, endCap: 'none' }));
    expect(sharp.line).not.toContain('Q');
    expect(sharp.caps).toHaveLength(0);
  });
});
