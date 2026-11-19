import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentTrail, Channel, ChatRunEvent, Message } from '@archa/protocol';
import { Workspace } from '../src/core-host/workspace';
import { ADAPTERS, type Adapter } from '../src/core-host/agent-adapters';
import { randomPersona } from '../src/core-host/personas';
import { personaColor } from '@archa/protocol';

/* Agent sessions (blueprint AGENT_BRIDGE/03 → Sessions): names, parallel runs, canvas trail. */

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-sessions-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
});

function fakeChannel() {
  const events: Array<{ event: string; data: unknown }> = [];
  const channel: Channel = { send: (m: Message) => { if (m.t === 'evt') events.push({ event: m.event, data: m.data }); }, onMessage: () => {} };
  return { channel, events };
}

describe('session names', () => {
  it('never repeats a name that is taken', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const n = randomPersona(taken);
      expect(taken.has(n)).toBe(false);
      taken.add(n);
    }
  });

  it('picks a colour no active session uses while one is free', () => {
    const active: string[] = [];
    for (let i = 0; i < 8; i++) active.push(randomPersona([], active));
    expect(new Set(active.map(personaColor)).size).toBe(8);
  });

  it('gives a terminal agent a session name instead of its CLI id', () => {
    const ws = new Workspace();
    const a = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    const b = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    expect(a.author.name).not.toBe('claude');
    expect(a.author.name).toMatch(/^\w+ \w+/);
    expect(a.author.name).not.toBe(b.author.name);
    expect(a.author.id).not.toBe(b.author.id);
    expect(ws.agents().map((x) => x.name)).toEqual([a.author.name, b.author.name]);
  });
});

describe('execute trail', () => {
  it('records where the snippet worked, in order, and copy() duplicates a subtree', async () => {
    const ws = new Workspace();
    const ui = fakeChannel();
    ws.attach(ui.channel, { kind: 'renderer', name: 'window' });
    const agent = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    ws.requestRender = async () => ({ png: 'AAAA' });
    const docId = ws.summaries()[0]!.id;
    const code = `
      card = insert(null, { type: 'frame', name: 'Card', x: 0, y: 0, width: 200, height: 100, children: [{ type: 'text', name: 'Title', text: 'Hi' }] });
      update('Title', { text: 'Hello' });
      twin = copy(card);
      get(twin);
    `;
    const r = await ws.handlers['agent.execute']({ docId, code }, agent);
    expect(r.ok).toBe(true);
    const trail = ui.events.find((e) => e.event === 'agent.trail')!.data as AgentTrail;
    expect(trail.author.name).toBe(agent.author.name);
    expect(trail.steps.map((s) => `${s.action}:${s.name}`)).toEqual(['create:Card', 'edit:Title', 'focus:Card', 'copy:Card', 'read:Card']);
    const copyStep = trail.steps[3]!;
    expect(copyStep.bounds).toMatchObject({ x: 240, y: 0, width: 200, height: 100 });
    const doc = ws.session(docId).doc;
    expect(doc.findByName('Title')).toHaveLength(2);
    const activity = ws.activity.find((e) => e.tool === 'execute')!;
    expect(activity.author.name).toBe(agent.author.name);
  });
});

describe('parallel chat sessions', () => {
  const fake = {
    id: 'fake', label: 'Fake', bin: 'node',
    build: () => ({ args: ['-e', 'setTimeout(() => {}, 5000)'] }),
    parser: () => ({ line: () => [] }),
    models: async () => ({ models: [], source: '' }),
  } as unknown as Adapter;
  beforeEach(() => { ADAPTERS.push(fake); });
  afterEach(() => { ADAPTERS.splice(ADAPTERS.indexOf(fake), 1); });

  it('runs two threads on one document at once, each under its own name', async () => {
    const ws = new Workspace();
    const ui = fakeChannel();
    ws.attach(ui.channel, { kind: 'renderer', name: 'window' });
    const docId = ws.summaries()[0]!.id;
    const one = ws.chat.send(docId, 'fake', 'first');
    const two = ws.chat.send(docId, 'fake', 'second');
    expect(one.threadId).not.toBe(two.threadId);
    expect(one.persona).not.toBe(two.persona);
    // A second message to a working thread waits for its turn instead of being refused.
    const queued = ws.chat.send(docId, 'fake', 'again', undefined, undefined, one.threadId);
    expect(queued).toMatchObject({ queued: true, threadId: one.threadId, persona: one.persona });
    expect(ws.chat.active().map((r) => r.persona).sort()).toEqual([one.persona, two.persona].sort());

    // The `archa mcp` a run starts works under that run's name.
    const conn = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'fake', agentId: 'fake', runId: one.runId });
    expect(conn.author).toMatchObject({ kind: 'agent', name: one.persona });
    expect(conn.threadId).toBe(one.threadId);
    const messages = ws.chat.list(docId).filter((m) => m.role === 'user');
    expect(messages.map((m) => m.persona)).toEqual([one.persona, two.persona, one.persona]);

    const stopped = (runId: string) => new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (ui.events.some((e) => e.event === 'chat.run' && (e.data as ChatRunEvent).runId === runId && (e.data as ChatRunEvent).status === 'stopped')) { clearInterval(check); resolve(); }
      }, 20);
    });
    ws.chat.stop(one.runId);
    ws.chat.stop(two.runId);
    await Promise.all([stopped(one.runId), stopped(two.runId)]);
    // The queued message started as soon as its thread was free.
    const next = ws.chat.active().find((r) => r.threadId === one.threadId)!;
    expect(next.persona).toBe(one.persona);
    ws.chat.stop(next.runId);
    await stopped(next.runId);
    expect(ws.chat.active()).toEqual([]);

    // A later turn in the same thread keeps the name.
    const again = ws.chat.send(docId, 'fake', 'third', undefined, undefined, one.threadId);
    expect(again.persona).toBe(one.persona);
    ws.chat.stop(again.runId);
    await stopped(again.runId);
  }, 20_000);
});
