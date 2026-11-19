import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel, ChatMessage, ChatRunEvent, ExecuteResult, Message } from '@archa/protocol';
import { guidesFor, guideText } from '@archa/protocol';
import { iconPath, searchIcons } from '@archa/core/icons';
import { Workspace } from '../src/core-host/workspace';
import { ADAPTERS, type Adapter } from '../src/core-host/agent-adapters';

/* Warm chat sessions, the internal design guides and the new execute helpers (plan CHAT_AGENT). */

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-warm-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

function fakeChannel() {
  const events: Array<{ event: string; data: unknown }> = [];
  const channel: Channel = { send: (m: Message) => { if (m.t === 'evt') events.push({ event: m.event, data: m.data }); }, onMessage: () => {} };
  return { channel, events };
}

/** A stand-in CLI: one NDJSON message per turn; replies with its pid; "slow" turns wait for an interrupt. */
const SCRIPT = `
const rl = require('readline').createInterface({ input: process.stdin });
let pending = null;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
rl.on('line', (l) => {
  const m = JSON.parse(l);
  if (m.interrupt) { clearTimeout(pending); out({ done: false }); return; }
  const first = m.text.split('\\n')[0];
  if (first === 'slow') { pending = setTimeout(() => out({ done: true }), 20000); return; }
  setTimeout(() => { out({ text: 'pid ' + process.pid + ' ' + first }); out({ done: true }); }, 30);
});`;

const fakeWarm = {
  id: 'fakewarm', label: 'Fake warm', bin: 'node',
  build: () => ({ args: ['-e', 'process.exit(0)'] }),
  warm: {
    args: () => ['-e', SCRIPT],
    message: (text: string) => JSON.stringify({ text }),
    interrupt: () => JSON.stringify({ interrupt: true }),
  },
  parser: () => ({
    line: (l: string) => {
      const e = JSON.parse(l) as { text?: string; done?: boolean };
      return e.text ? [{ kind: 'text', text: e.text }] : e.done !== undefined ? [{ kind: 'turn', ok: e.done }] : [];
    },
  }),
  models: async () => ({ models: [], source: '' }),
} as unknown as Adapter;

describe('warm chat sessions', () => {
  beforeEach(() => { ADAPTERS.push(fakeWarm); });
  afterEach(() => { ADAPTERS.splice(ADAPTERS.indexOf(fakeWarm), 1); });

  it('keeps one process per thread across turns, queues follow-ups and survives an interrupt', async () => {
    const ws = new Workspace();
    const ui = fakeChannel();
    ws.attach(ui.channel, { kind: 'renderer', name: 'window' });
    const docId = ws.summaries()[0]!.id;
    const ended = (runId: string) => new Promise<string>((resolve) => {
      const check = setInterval(() => {
        const e = ui.events.find((x) => x.event === 'chat.run' && (x.data as ChatRunEvent).runId === runId && (x.data as ChatRunEvent).status !== 'running');
        if (e) { clearInterval(check); resolve((e.data as ChatRunEvent).status); }
      }, 10);
    });
    const replies = () => ws.chat.list(docId).filter((m) => m.role === 'agent').map((m) => m.text);

    // Pre-warm reserves the thread and its session name before the first message.
    const { threadId, warm } = await ws.chat.warmUp(docId, 'fakewarm');
    expect(warm).toBe(true);
    const first = ws.chat.send(docId, 'fakewarm', 'one', undefined, undefined, threadId);
    expect(await ended(first.runId)).toBe('finished');
    const second = ws.chat.send(docId, 'fakewarm', 'two', undefined, undefined, threadId);
    expect(second.persona).toBe(first.persona);
    expect(await ended(second.runId)).toBe('finished');
    const pids = replies().map((t) => t.split(' ')[1]);
    expect(pids).toHaveLength(2);
    expect(pids[0]).toBe(pids[1]); // same process: no cold start on the follow-up
    expect(ws.chat.list(docId).some((m) => m.role === 'status' && /^Done in/.test(m.text))).toBe(true);

    // A slow turn is interrupted (process kept), and the queued message runs next in that process.
    const slow = ws.chat.send(docId, 'fakewarm', 'slow', undefined, undefined, threadId);
    const queued = ws.chat.send(docId, 'fakewarm', 'after', undefined, undefined, threadId, { now: true });
    expect(queued.queued).toBe(true);
    expect(await ended(slow.runId)).toBe('stopped');
    await new Promise<void>((resolve) => {
      const check = setInterval(() => { if (replies().length === 3) { clearInterval(check); resolve(); } }, 10);
    });
    // Same process; the stopped request had no reply yet, so it is carried into the next message.
    expect(replies()[2]).toBe(`pid ${pids[0]} Earlier request (stopped before you answered it):`);
    expect(ws.chat.list(docId).some((m) => m.role === 'status' && m.text === 'Stopped')).toBe(true);
    expect(ws.chat.active()).toEqual([]);
    await ws.chat.shutdown();
  }, 20_000);

  it("gives the warm process's `archa mcp` the thread's session name", async () => {
    const ws = new Workspace();
    const docId = ws.summaries()[0]!.id;
    const { threadId } = await ws.chat.warmUp(docId, 'fakewarm');
    const run = ws.chat.send(docId, 'fakewarm', 'one', undefined, undefined, threadId);
    // The MCP client of a warm process identifies with the process id (ARCHA_RUN_ID), not the turn id.
    const procId = (ws.chat as unknown as { warm: Map<string, { id: string }> }).warm.get(threadId)!.id;
    const conn = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'fakewarm', runId: procId });
    expect(conn.author.name).toBe(run.persona);
    expect(conn.threadId).toBe(threadId);
    await ws.chat.shutdown();
  });
});

describe('internal design guides', () => {
  it('picks guides from the request and serves them by topic', () => {
    expect(guidesFor('A pricing page with three tiers')).toEqual(['landing']);
    expect(guidesFor('Admin dashboard with a users table')).toEqual(['web-app']);
    expect(guidesFor('Mobile onboarding, 3 screens')).toEqual(['mobile']);
    expect(guideText('icons')).toContain('icon(name');
    expect(guideText('nope')).toContain('Topics:');
  });
});

describe('execute helpers', () => {
  it('icon() inserts a lucide vector, suggests names, and text without fill is auto-fixed with a screenshot', async () => {
    expect(iconPath('ArrowRight')).toBeTruthy();
    expect(searchIcons('arrow')).toContain('arrow-right');
    const ws = new Workspace();
    ws.attach(fakeChannel().channel, { kind: 'renderer', name: 'window' });
    ws.requestRender = async () => ({ png: 'AAAA' });
    const agent = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    const docId = ws.summaries()[0]!.id;
    const r = await ws.handlers['agent.execute']({ docId, code: `
      card = insert(null, { type: 'frame', name: 'Card', width: 320, height: 200, fills: ['#0b0b0e'], layout: 'row', gap: 8, padding: 16 });
      icon('search', card, { size: 20 });
      insert(card, { type: 'text', name: 'Label', text: 'Search' });
    ` }, agent) as ExecuteResult;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = ws.session(docId).doc;
    const ic = doc.findByName('Icon search')[0]!;
    expect(ic.type).toBe('path');
    expect(ic).toMatchObject({ width: 20, height: 20 });
    const label = doc.findByName('Label')[0]!;
    expect(label.type === 'text' && label.fills.length).toBe(1); // got light ink on the dark card
    expect(r.output.join('\n')).toMatch(/Auto-fixed: 1 text node/);
    expect(r.issues.some((i) => i.rule === 'text/no-fill')).toBe(false);
    expect(r.screenshots.map((s) => s.name)).toEqual(['Card']); // automatic, of the new top node

    const bad = await ws.handlers['agent.execute']({ docId, code: `icon('serch', 'Card')` }, agent) as ExecuteResult;
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/did you mean .*search/);
    void ({} as ChatMessage);
  });
});

describe('forgiving execute input', () => {
  it('maps CSS/Figma spellings and lets agents re-declare names between calls', async () => {
    const ws = new Workspace();
    ws.attach(fakeChannel().channel, { kind: 'renderer', name: 'window' });
    ws.requestRender = async () => ({ png: 'AAAA' });
    const agent = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    const docId = ws.summaries()[0]!.id;
    const run = (code: string) => ws.handlers['agent.execute']({ docId, code }, agent) as Promise<ExecuteResult>;
    const a = await run(`const page = insert(null, { type: 'frame', name: 'Box', layout: 'vertical', align: 'stretch', justify: 'between', padding: [8, 16], width: 300, height: 200,
      children: [{ type: 'text', name: 'T', content: 'Hello', fontWeight: 'bold', sizing: { horizontal: 'stretch', vertical: 'auto' } }] });`);
    expect(a.ok).toBe(true);
    const b = await run(`const page = get('Box'); print(page.name)`);
    expect(b.ok && b.output).toEqual(['Box']);
    const doc = ws.session(docId).doc;
    expect(doc.findByName('Box')[0]).toMatchObject({ layout: 'column', align: 'start', justify: 'space-between', padding: { top: 8, right: 16, bottom: 8, left: 16 } });
    expect(doc.findByName('T')[0]).toMatchObject({ text: 'Hello', fontWeight: 700, sizing: { horizontal: 'fill', vertical: 'hug' } });
    const t = await run(`insert('Box', { type: 'text', name: 'U', text: 'x', textSizing: 'auto', sizing: { vertical: 'auto-height' } })`);
    expect(t.ok).toBe(true);
    expect(doc.findByName('U')[0]).toMatchObject({ textSizing: 'auto-width', sizing: { horizontal: 'fixed', vertical: 'hug' } });
    const u = await run(`update('U', { sizing: { horizontal: 'fill' }, padding: { top: 4 } })`);
    expect(u.ok).toBe(true);
    expect(doc.findByName('U')[0]).toMatchObject({ sizing: { horizontal: 'fill', vertical: 'hug' } });
    const bad = await run(`insert('Box', { type: 'frame', name: 'Bad', sizing: { vertical: 'grow' } })`);
    expect(!bad.ok && bad.reason).toMatch(/\(got "grow"\)/);
    const c = await run(`icon('twitter', 'Box')`);
    expect(!c.ok && c.reason).toMatch(/no brand logos/);
  });
});
