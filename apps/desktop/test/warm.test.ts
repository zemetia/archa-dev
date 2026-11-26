import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel, ChatMessage, ChatRunEvent, ExecuteResult, Message } from '@archa/protocol';
import { guidesFor, guideText } from '@archa/protocol';
import { getIcon, loadIconSet, searchIcons } from '@archa/icons';
import { colorToHex } from '@archa/schema';
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
    // Every turn ends with how long it worked.
    const timed = ws.chat.list(docId).filter((m) => m.role === 'status' && m.elapsedMs !== undefined);
    expect(timed).toHaveLength(2);
    expect(timed[0]!.text).toMatch(/^Worked for \d+s$/);

    // A follow-up sent during a slow turn waits in the queue (not in the history yet) until Send now
    // interrupts the turn (process kept) and runs it next in that process.
    const slow = ws.chat.send(docId, 'fakewarm', 'slow', undefined, undefined, threadId);
    const queued = ws.chat.send(docId, 'fakewarm', 'after', undefined, undefined, threadId);
    expect(queued.queued).toBe(true);
    const waiting = ws.chat.queued(threadId);
    expect(waiting.map((q) => q.text)).toEqual(['after']);
    expect(ws.chat.list(docId).some((m) => m.role === 'user' && m.text === 'after')).toBe(false);
    ws.chat.sendQueued(threadId, waiting[0]!.id);
    expect(await ended(slow.runId)).toBe('stopped');
    await new Promise<void>((resolve) => {
      const check = setInterval(() => { if (replies().length === 3) { clearInterval(check); resolve(); } }, 10);
    });
    // Same process; the stopped request had no reply yet, so it is carried into the next message.
    expect(replies()[2]).toBe(`pid ${pids[0]} Earlier request (stopped before you answered it):`);
    expect(ws.chat.list(docId).some((m) => m.role === 'status' && /^Stopped after \d+s$/.test(m.text))).toBe(true);
    expect(ws.chat.queued(threadId)).toEqual([]);
    expect(ws.chat.list(docId).filter((m) => m.role === 'user' && m.text === 'after')).toHaveLength(1);
    const queueEvents = ui.events.filter((x) => x.event === 'chat.queue').map((x) => (x.data as { items: unknown[] }).items.length);
    expect(queueEvents).toEqual([1, 1, 0]);
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
    expect(guidesFor('tolong buatkan konten tentang archa dev dengan ratio 4:5 berisi 5-6 slide')).toEqual(['social']);
    expect(guidesFor('Instagram carousel for a coffee shop landing page launch')).toEqual(['social']);
    expect(guidesFor('Landing page with a pricing table')).toEqual(['landing', 'web-app']);
    expect(guideText('social')).toContain('1080×1350');
    expect(guideText('icons')).toContain('icon(name');
    expect(guideText('nope')).toContain('Topics:');
  });
});

describe('execute helpers', () => {
  it('icon() inserts a lucide vector, suggests names, and text without fill is auto-fixed with a screenshot', async () => {
    expect(getIcon(await loadIconSet('lucide'), 'arrow-right')).toBeTruthy();
    expect(searchIcons('arrow', { sets: ['lucide'] })).toContain('arrow-right');
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

  it('svg() places AI-written markup as vectors or as an image, and SVG text becomes a drawing', async () => {
    const ws = new Workspace();
    ws.attach(fakeChannel().channel, { kind: 'renderer', name: 'window' });
    ws.requestRender = async () => ({ png: 'AAAA' });
    const agent = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    const docId = ws.summaries()[0]!.id;
    const r = await ws.handlers['agent.execute']({ docId, code: `
      card = insert(null, { type: 'frame', name: 'Card', width: 320, height: 200, fills: ['#ffffff'] });
      svg(\`<svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>\`, card, { width: 96, x: 16, y: 16, name: 'Badge' });
      svg('<svg width="40" height="20"><text x="0" y="15">Hi</text></svg>', card, { name: 'Word' });
      insert(card, { type: 'text', name: 'Raw', text: '<svg width="10" height="10"><rect width="10" height="10" fill="red"/></svg>' });
    ` }, agent) as ExecuteResult;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = ws.session(docId).doc;
    const badge = doc.findByName('Badge')[0]!;
    expect(badge).toMatchObject({ type: 'frame', width: 96, height: 96, x: 16, y: 16 });
    expect(doc.children(badge.id).map((n) => n.type)).toEqual(['path', 'path']);
    expect(doc.findByName('Word')[0]!.type).toBe('image');
    expect(doc.findByName('Raw')[0]!.type).toBe('frame');
    const out = r.output.join('\n');
    expect(out).toMatch(/"Badge" placed as 2 editable vector layers/);
    expect(out).toMatch(/"Word" placed as an image \(vectors cannot keep text\)/);
    expect(out).toMatch(/text was SVG markup/);

    const bad = await ws.handlers['agent.execute']({ docId, code: `svg('<svg><defs><linearGradient id="g"/></defs><rect width="4" height="4" fill="url(#g)"/></svg>', 'Card', { mode: 'vector' })` }, agent) as ExecuteResult;
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/gradients/);
  });

  it('icon() reaches every set, brand logos keep their colour, and uploaded icons work as my:<name>', async () => {
    const ws = new Workspace();
    ws.attach(fakeChannel().channel, { kind: 'renderer', name: 'window' });
    ws.requestRender = async () => ({ png: 'AAAA' });
    const agent = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    const docId = ws.summaries()[0]!.id;
    ws.icons.add([{ name: 'Brand mark', width: 48, height: 24, node: { type: 'path', name: 'x', d: 'M0 0h48v24H0Z', viewBox: { x: 0, y: 0, width: 48, height: 24 }, width: 48, height: 24, fills: ['#ff0000'] } as never }]);
    const r = await ws.handlers['agent.execute']({ docId, code: `
      icon('tabler:home', null, { size: 24, name: 'T' });
      icon('ph-fill:house', null, { size: 32, name: 'P' });
      icon('hero-solid:bell', null, { name: 'H' });
      icon('logos:github', null, { size: 40 });
      icon('my:Brand mark', null, { size: 96, color: '#00ff00' });
      print(icons('github').slice(0, 3).join(','));
      print(icons('house', { set: 'ph' }).slice(0, 2).join(','));
    ` }, agent) as ExecuteResult;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = ws.session(docId).doc;
    expect(doc.findByName('T')[0]).toMatchObject({ type: 'path', viewBox: { width: 24 }, fills: [] });
    expect(doc.findByName('P')[0]).toMatchObject({ type: 'path', width: 32, viewBox: { width: 256 }, strokes: [] });
    const logo = doc.findByName('GitHub')[0]!;
    expect(logo.type === 'path' && colorToHex(logo.fills[0]!.color)).toBe('#181717');
    const mine = doc.findByName('Brand mark')[0]!;
    expect(mine).toMatchObject({ width: 96, height: 48 });
    expect(mine.type === 'path' && colorToHex(mine.fills[0]!.color)).toBe('#00ff00');
    expect(r.output[0]).toContain('logos:github');
    expect(r.output[1]).toMatch(/^ph:house/);
    const unknown = await ws.handlers['agent.execute']({ docId, code: `icon('nope:x')` }, agent) as ExecuteResult;
    expect(!unknown.ok && unknown.reason).toMatch(/Unknown icon set "nope"/);
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
    expect(!c.ok && c.reason).toMatch(/logos:<brand>/);
  });
});
