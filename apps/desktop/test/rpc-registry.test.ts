import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVALID_PARAMS, RPC, TOOL_NAMES, TOOLS, type Channel, type Message, type ToolDef } from '@archa/protocol';
import { Workspace } from '../src/core-host/workspace';
import { AGY_TOOLS_NOTE, MCP_TOOLS } from '../src/core-host/agent-adapters';
import { registerTools } from '../../cli/src/mcp';

/* One registry (packages/protocol/src/rpc.ts + tools.ts) drives the handler map, the dispatcher's validation and every tool list. */

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-rpc-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
});

/** A client on the real dispatch path: requests in through onMessage, responses out through send. */
function client(ws: Workspace) {
  const replies: Message[] = [];
  let deliver: (m: Message) => void = () => {};
  const channel: Channel = { send: (m) => { if (m.t === 'res') replies.push(m); }, onMessage: (cb) => { deliver = cb; } };
  ws.attach(channel, { kind: 'renderer', name: 'window' });
  let id = 0;
  return async (method: string, params?: unknown) => {
    const n = ++id;
    deliver({ t: 'req', id: n, method, params });
    await vi.waitFor(() => { if (!replies.some((r) => r.t === 'res' && r.id === n)) throw new Error('no reply yet'); });
    return replies.find((r) => r.t === 'res' && r.id === n) as Extract<Message, { t: 'res' }>;
  };
}

describe('dispatcher validation', () => {
  it('rejects invalid params before the handler runs', async () => {
    const ws = new Workspace();
    const close = vi.spyOn(ws.handlers, 'doc.close');
    const say = vi.spyOn(ws.handlers, 'agent.say');
    const call = client(ws);
    const noDoc = await call('doc.close', {});
    expect(noDoc).toMatchObject({ ok: false, error: { code: INVALID_PARAMS } });
    expect(!noDoc.ok && noDoc.error.message).toMatch(/doc\.close — docId/);
    expect(await call('doc.close')).toMatchObject({ ok: false, error: { code: INVALID_PARAMS } });
    const badText = await call('agent.say', { text: 42 });
    expect(badText).toMatchObject({ ok: false, error: { code: INVALID_PARAMS } });
    expect(!badText.ok && badText.error.message).toMatch(/text/);
    expect(close).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();
    expect(ws.summaries()).toHaveLength(1);
  });

  it('still runs valid requests, with the parsed params', async () => {
    const ws = new Workspace();
    const call = client(ws);
    const made = await call('doc.new', {});
    expect(made).toMatchObject({ ok: true });
    expect(ws.summaries()).toHaveLength(2);
    const docId = (made as { result: { docId: string } }).result.docId;
    expect(await call('agent.say', { docId, text: 'hello' })).toMatchObject({ ok: true });
    expect(ws.activity.at(-1)?.text).toBe('hello');
    expect(await call('workspace.list')).toMatchObject({ ok: true });
  });

  it('answers unknown methods, including prototype keys, with NOT_FOUND', async () => {
    const call = client(new Workspace());
    expect(await call('doc.nope', {})).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await call('toString', {})).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('registry coverage', () => {
  it('has exactly one handler per registry method', () => {
    expect(Object.keys(new Workspace().handlers).sort()).toEqual(Object.keys(RPC).sort());
  });

  it('every tool relays to a registry method', () => {
    for (const name of TOOL_NAMES) {
      const t = TOOLS[name] as ToolDef;
      if (t.rpc) expect(Object.keys(RPC), name).toContain(t.rpc);
    }
  });

  it('MCP_TOOLS, the CLI server and the agy note list the registry tools', () => {
    expect([...MCP_TOOLS]).toEqual(TOOL_NAMES);
    const registered: string[] = [];
    registerTools({ registerTool: ((name: string) => { registered.push(name); }) as never }, async () => { throw new Error('no core'); }, (d) => d);
    expect(registered).toEqual(TOOL_NAMES);
    const list = AGY_TOOLS_NOTE.slice(AGY_TOOLS_NOTE.indexOf('): ') + 3, AGY_TOOLS_NOTE.indexOf('. Every document tool'));
    const inNote = [...list.matchAll(/(?:^|, )(\w+) \{/g)].map((m) => m[1]);
    // Orchestrate tools stay out of agy's list: the orchestrate brief names them for a lead.
    expect(inNote).toEqual(TOOL_NAMES.filter((n) => (TOOLS[n] as ToolDef).agy));
    expect(inNote.length).toBe(TOOL_NAMES.length - 3);
  });
});
