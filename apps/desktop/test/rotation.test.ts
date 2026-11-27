import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import { exportHtmlStandalone, exportSvg } from '@archa/formats';
import type { NodeInput } from '@archa/schema';
import type { AgentTrail, Channel, Message } from '@archa/protocol';
import { hitPath, nodeCorners, nodeHandlePoint, normalizeAngle, resizedBox, resizeFrame, rotateHandlePoint, turnedCursor, visualBounds } from '../src/renderer/lib/geometry';
import { cursorAlive, markDone, pushTrail } from '../src/renderer/canvas/cursors';
import { newHost } from './host-helper';

/* Rotation, Canva-like text handles, and done() putting the agent cursor away. */

function docWith(...inputs: NodeInput[]) {
  const s = new DocumentSession(ArchaDocument.create('rot'));
  const root = s.doc.pages[0]!.rootId;
  for (const input of inputs) s.apply({ author: { id: 't', kind: 'user' }, label: 'x', baseRevision: s.revision, ops: insertOpsFor(input, root).ops });
  return s.doc;
}
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => { expect(a.x).toBeCloseTo(b.x, 4); expect(a.y).toBeCloseTo(b.y, 4); };

describe('rotation geometry', () => {
  it('turns corners about the box centre', () => {
    const d = docWith({ type: 'rect', name: 'R', x: 0, y: 0, width: 100, height: 50, rotation: 90 } as never);
    const id = d.findByName('R')[0]!.id;
    const [nw, ne] = nodeCorners(d, id);
    close(nw!, { x: 75, y: -25 });
    close(ne!, { x: 75, y: 75 });
    expect(visualBounds(d, id)).toMatchObject({ x: 25, y: -25, width: 50, height: 100 });
  });

  it('hit-tests the turned shape, not its upright box', () => {
    const d = docWith({ type: 'rect', name: 'Bar', x: 0, y: 0, width: 200, height: 20, rotation: 90 } as never);
    expect(hitPath(d, 100, 80).map((n) => n.name)).toEqual(['Bar']);
    expect(hitPath(d, 10, 10)).toEqual([]);
  });

  it('puts the rotate knob above the top edge, along the turn', () => {
    const d = docWith({ type: 'rect', name: 'R', x: 0, y: 0, width: 100, height: 100, rotation: 90 } as never);
    const id = d.findByName('R')[0]!.id;
    close(rotateHandlePoint(d, id, 1), { x: 122, y: 50 });
    close(nodeHandlePoint(d, id, 'n'), { x: 100, y: 50 });
  });

  it('keeps the opposite corner in place when resizing a turned box', () => {
    const d = docWith({ type: 'rect', name: 'R', x: 0, y: 0, width: 100, height: 50, rotation: 30 } as never);
    const id = d.findByName('R')[0]!.id;
    const n = d.require(id);
    const frame = resizeFrame(d, id, 'se');
    const anchor = nodeCorners(d, id)[0]!;
    const b = resizedBox(frame, 'se', n, 40, 10, false);
    d.nodes.set(id, { ...n, ...b });
    close(nodeCorners(d, id)[0]!, anchor);
  });

  it('matches the plain resize when nothing is turned', () => {
    const d = docWith({ type: 'rect', name: 'R', x: 10, y: 20, width: 100, height: 50 } as never);
    const n = d.findByName('R')[0]!;
    expect(resizedBox(resizeFrame(d, n.id, 'nw'), 'nw', n, -10, -5, false)).toMatchObject({ x: 0, y: 15, width: 110, height: 55 });
    expect(resizedBox(resizeFrame(d, n.id, 'e'), 'e', n, 20, 999, false)).toMatchObject({ x: 10, y: 20, width: 120, height: 50 });
  });

  it('normalises angles and turns cursors', () => {
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-190)).toBe(170);
    expect(turnedCursor('e', 90)).toBe('ns-resize');
    expect(turnedCursor('ne', 0)).toBe('nesw-resize');
  });
});

describe('rotation export', () => {
  it('writes rotate() in SVG and CSS rotate in HTML', () => {
    const d = docWith({ type: 'frame', name: 'Card', width: 300, height: 200, children: [{ type: 'text', name: 'Tag', text: 'Sale', x: 20, y: 30, rotation: -15 }] } as never);
    const card = d.findByName('Card')[0]!.id;
    expect(exportSvg(d, card)).toMatch(/rotate\(-15 [\d.]+ [\d.]+\)/);
    expect(exportHtmlStandalone(d, card)).toContain('rotate: -15deg');
  });
});

describe('done()', () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'archa-done-')); process.env.ARCHA_HOME = home; });
  afterEach(() => { delete process.env.ARCHA_HOME; rmSync(home, { recursive: true, force: true }); });

  it('broadcasts agent.done and logs it', async () => {
    const ws = newHost();
    const events: Array<{ event: string; data: unknown }> = [];
    const ui: Channel = { send: (m: Message) => { if (m.t === 'evt') events.push({ event: m.event, data: m.data }); }, onMessage: () => {} };
    ws.attach(ui, { kind: 'renderer', name: 'window' });
    const agent = ws.attach({ send: () => {}, onMessage: () => {} }, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    const docId = ws.ctx.summaries()[0]!.id;
    await ws.handlers['agent.done']({ docId, summary: 'Built the hero' }, agent);
    expect(events.find((e) => e.event === 'agent.done')?.data).toMatchObject({ docId, author: { id: agent.author.id } });
    expect(ws.ctx.activity.at(-1)).toMatchObject({ tool: 'done', text: 'Built the hero' });
  });

  it('lets a cursor fade while its agent process is still up, until the next turn', () => {
    const trail = { docId: 'd', author: { id: 'a1', kind: 'agent', name: 'Ada' }, steps: [{ action: 'create', nodeId: 'n', name: 'N', bounds: { x: 0, y: 0, width: 10, height: 10 } }] } as unknown as AgentTrail;
    const c = pushTrail(undefined, trail, 0);
    const later = 60_000;
    expect(cursorAlive(c, later, true)).toBe(true);
    // Done: it lingers and fades (~1.2 s) instead of idling for as long as the process lives.
    expect(cursorAlive(markDone(c), later + 1500, true)).toBe(false);
    expect(cursorAlive(c, later + 1500, true)).toBe(true);
    expect(pushTrail(markDone(c), trail, later).done).toBeUndefined();
  });
});
