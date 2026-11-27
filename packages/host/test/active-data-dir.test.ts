import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataDirFor } from '@archa/protocol/node';
import { newHost } from './helpers';

/* Which data folder stores use when a call names no document (blueprint STRUCTURE/03, AGENT_BRIDGE/07). */

let home: string;
let work: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-active-'));
  work = mkdtempSync(join(tmpdir(), 'archa-active-work-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const conn = { author: { kind: 'user', id: 'u' } } as never;
const call = <T>(ws: ReturnType<typeof newHost>, method: string, params: unknown): Promise<T> =>
  Promise.resolve((ws.handlers as unknown as Record<string, (p: unknown, c: unknown) => T>)[method]!(params, conn));

describe('HostContext.activeDataDir', () => {
  it('is null with no document open, and document-scoped stores degrade instead of throwing', () => {
    const ws = newHost();
    // The app always keeps one document open; empty the map to reach the state agents can still hit mid-close.
    ws.ctx.sessions.clear();
    expect(ws.ctx.activeDataDir()).toBeNull();
    expect(ws.ctx.activeDataDir('anything')).toBeNull();
    expect(ws.ctx.skillsDir()).toBeUndefined();
    expect(ws.ctx.findSession()).toBeNull();
    expect(ws.memory.list()).toEqual([]);
  });

  it('uses the given document, else the last one used', () => {
    const ws = newHost();
    const a = ws.ctx.newDoc('A');
    const b = ws.ctx.newDoc('B');
    expect(ws.ctx.activeDataDir(a)).toBe(dataDirFor(null, a));
    expect(ws.ctx.activeDataDir('A')).toBe(dataDirFor(null, a));
    expect(ws.ctx.activeDataDir()).toBe(dataDirFor(null, b));
    expect(ws.ctx.skillsDir()).toBe(join(dataDirFor(null, b), 'skills'));
    expect(ws.ctx.activeDataDir('not-open')).toBeNull();
  });

  it('follows a saved document to its <name>-data folder', async () => {
    const ws = newHost();
    const a = ws.ctx.newDoc('A');
    const path = join(work, 'landing.archa');
    await call(ws, 'doc.save', { docId: a, path });
    expect(ws.ctx.activeDataDir(a)).toBe(join(work, 'landing-data'));
    expect(ws.ctx.activeDataDir(path)).toBe(join(work, 'landing-data'));
  });

  it('gives an ambiguous name no folder instead of an error', () => {
    const ws = newHost();
    ws.ctx.newDoc('Same');
    ws.ctx.newDoc('Same');
    expect(ws.ctx.activeDataDir('Same')).toBeNull();
    expect(() => ws.ctx.session('Same')).toThrow(/2 open documents/);
  });

  it('keeps chat history of a closed document in its runtime folder', () => {
    const ws = newHost();
    expect(ws.chat.store.chatsDir('gone')).toBe(join(dataDirFor(null, 'gone'), 'chats'));
  });
});
