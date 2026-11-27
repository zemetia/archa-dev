import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, ClientInfo, Message } from '@archa/protocol';
// PARITY:HOST-BEGIN (the parity harness swaps this block to run the same scenario on the pre-split Workspace)
import { newHost } from './helpers';
const makeHost = () => newHost();
// PARITY:HOST-END

/*
 * Behaviour parity scenario: drives a core host over its Channel the way the window, `archa mcp` and the
 * CLI do, through every RPC method that runs without a real agent CLI, window canvas or browser. Each step
 * records its reply (or error) and the events both connections received. The same scenario ran against the
 * pre-split Workspace; the expectations below are what both produced, except where the router's param
 * schemas were tightened on purpose (marked `strict`).
 * PARITY_OUT=<file> writes the normalised log for diffing.
 */

type Reply = { ok: true; result: unknown } | { ok: false; code: string; message: string };
type Step = { label: string; method: string; reply: Reply; events: Record<string, Array<{ event: string; data: unknown }>> };

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function channelPair(): [Channel, Channel] {
  const aSubs: Array<(m: Message) => void> = [];
  const bSubs: Array<(m: Message) => void> = [];
  const to = (subs: Array<(m: Message) => void>) => (m: Message) => {
    const copy = structuredClone(m);
    queueMicrotask(() => { for (const s of subs) s(copy); });
  };
  return [{ send: to(bSubs), onMessage: (cb) => { aSubs.push(cb); } }, { send: to(aSubs), onMessage: (cb) => { bSubs.push(cb); } }];
}

type Host = { attach(channel: Channel, client: ClientInfo): unknown };

/** A raw client: replies by request id, every event in arrival order. */
function client(host: Host, info: ClientInfo, onEvent?: (c: Client, event: string, data: unknown) => void) {
  const [mine, theirs] = channelPair();
  let next = 1;
  const pending = new Map<number, (r: Reply) => void>();
  const events: Array<{ event: string; data: unknown }> = [];
  const c = {
    events,
    call(method: string, params?: unknown): Promise<Reply> {
      const id = next++;
      return new Promise((done) => { pending.set(id, done); theirs.send({ t: 'req', id, method, params } as Message); });
    },
  };
  theirs.onMessage((m) => {
    if (m.t === 'res') {
      const done = pending.get(m.id);
      pending.delete(m.id);
      done?.(m.ok ? { ok: true, result: m.result } : { ok: false, code: m.error.code, message: m.error.message });
    } else if (m.t === 'evt') {
      events.push({ event: m.event, data: m.data });
      onEvent?.(c, m.event, m.data);
    }
  });
  host.attach(mine, info);
  return c;
}
type Client = ReturnType<typeof client>;

const settle = () => new Promise((r) => setTimeout(r, 20));

async function scenario(work: string) {
  const host = makeHost();
  const steps: Step[] = [];
  // The window: answers render requests with a 1×1 PNG (the renderer owns the canvas engine).
  const win = client(host, { kind: 'renderer', name: 'window-1' }, (c, event, data) => {
    const d = data as { requestId: string; slice?: number };
    if (event === 'render.request') void c.call('render.respond', d.slice ? { requestId: d.requestId, slices: [PNG] } : { requestId: d.requestId, png: PNG });
    if (event === 'render.reference' || event === 'render.compare') void c.call('render.respond', { requestId: d.requestId, error: 'no canvas in this test' });
  });
  const agent = client(host, { kind: 'mcp', name: 'claude', agentId: 'claude' });
  const conns = { win, agent };
  const run = async (label: string, method: string, params: unknown, via: Client = win) => {
    const before = Object.fromEntries(Object.entries(conns).map(([k, c]) => [k, c.events.length]));
    const reply = await via.call(method, params);
    await settle();
    const events = Object.fromEntries(Object.entries(conns).map(([k, c]) => [k, c.events.slice(before[k])]));
    steps.push({ label, method, reply, events });
    return reply.ok ? (reply.result as never) : (null as never);
  };

  /* app, workspace, connections */
  await run('workspace.list initial', 'workspace.list', undefined);
  await run('app.info', 'app.info', undefined);
  const agents = await run('agents.list', 'agents.list', undefined) as Array<{ name: string }>;
  const persona = agents[0]?.name ?? '';

  /* documents */
  const { docId } = await run('doc.new named', 'doc.new', { name: 'Parity' }, agent) as { docId: string };
  await run('doc.new unnamed', 'doc.new', {});
  await run('doc.rename', 'doc.rename', { docId, name: 'Parity Doc' });
  const snap = await run('doc.snapshot', 'doc.snapshot', { docId }) as { data: { pages: Array<{ rootId: string }> }; revision: number };
  const root = snap.data.pages[0]!.rootId;
  await run('doc.apply insert', 'doc.apply', { docId, baseRevision: snap.revision, label: 'Add card', ops: [{ op: 'insert', parentId: root, node: { id: 'card000001', type: 'frame', name: 'Card', x: 600, y: 0, width: 120, height: 80 } }] });
  await run('doc.apply stale revision', 'doc.apply', { docId, baseRevision: 0, label: 'Stale', ops: [{ op: 'insert', parentId: root, node: { id: 'late000001', type: 'frame', name: 'Late', width: 10, height: 10 } }] });
  await run('doc.apply invalid op', 'doc.apply', { docId, baseRevision: 1, label: 'Bad', ops: [{ op: 'explode' }] });
  await run('doc.undo', 'doc.undo', { docId });
  await run('doc.redo', 'doc.redo', { docId });
  await run('doc.undo by agent (nothing of its own)', 'doc.undo', { docId }, agent);

  /* agent tools */
  await run('agent.execute ok', 'agent.execute', { docId, code: "const f = insert(null, { type: 'frame', name: 'Hero', width: 400, height: 300, fills: ['#1f5e3b'] }); insert(f, { type: 'text', name: 'Title', text: 'Hello' }); print('made')" }, agent);
  const bad = await run('agent.execute failing', 'agent.execute', { docId, code: "update('NoSuchLayer', { x: 1 })" }, agent) as { editId?: string };
  await run('agent.execute patch by editId', 'agent.execute', { docId, editId: bad?.editId, edits: [{ find: 'NoSuchLayer', replace: 'Hero' }] }, agent);
  await run('agent.execute unknown editId', 'agent.execute', { docId, editId: 'zzzzzz' }, agent);
  await run('agent.execute syntax error', 'agent.execute', { docId, code: 'insert(' }, agent);
  await run('selection.set', 'selection.set', { docId, ids: [] });
  await run('agent.state', 'agent.state', { docId }, agent);
  await run('agent.state default doc', 'agent.state', {}, agent);
  await run('agent.outline page', 'agent.outline', { docId }, agent);
  await run('agent.outline node', 'agent.outline', { docId, node: 'Hero', depth: 2 }, agent);
  await run('agent.outline missing node', 'agent.outline', { docId, node: 'Nope' }, agent);
  await run('agent.exportSvg', 'agent.exportSvg', { docId, node: 'Hero' }, agent);
  await run('agent.say', 'agent.say', { docId, text: 'Building the hero', nodeId: 'Hero' }, agent);
  await run('agent.say no node', 'agent.say', { docId, text: 'Thinking' }, agent);
  await run('agent.screenshot', 'agent.screenshot', { docId, node: 'Hero' }, agent);
  await run('agent.screenshot unchanged', 'agent.screenshot', { docId, node: 'Hero' }, agent);
  await run('agent.screenshot sliced', 'agent.screenshot', { docId, node: 'Hero', scale: 2, slices: true }, agent);
  const refPng = join(work, 'ref.png');
  writeFileSync(refPng, Buffer.from(PNG, 'base64'));
  await run('agent.reference png', 'agent.reference', { docId, path: refPng }, agent);
  await run('agent.reference missing', 'agent.reference', { docId, path: join(work, 'nope.pdf') }, agent);
  await run('agent.compare (window cannot)', 'agent.compare', { docId, node: 'Hero', reference: refPng }, agent);
  await run('agent.readSkill unknown', 'agent.readSkill', { docId, name: 'no-such-skill' }, agent);
  await run('agent.browser headless', 'agent.browser', { action: 'open', url: 'https://example.com' }, agent);
  await run('agent.browser invalid', 'agent.browser', { action: 'fly' }, agent);
  await run('agent.placeImage no source', 'agent.placeImage', { docId }, agent);
  await run('agent.done', 'agent.done', { docId, summary: '  Hero built  ' }, agent);
  await run('activity.list', 'activity.list', { docId, limit: 50 });
  await run('agents.list after work', 'agents.list', undefined);

  /* export */
  const hero = (await run('agent.execute find hero', 'agent.execute', { docId, code: "print(get('Hero').id)" }, agent) as { output?: string[] })?.output?.[0] ?? 'Hero';
  await run('export.code css', 'export.code', { docId, nodeId: hero, style: 'css' });
  await run('export.code tailwind', 'export.code', { docId, nodeId: hero, style: 'tailwind' });
  await run('export.page', 'export.page', { docId, nodeId: hero });
  await run('export.save svg', 'export.save', { docId, nodeId: hero, format: 'svg', path: join(work, 'out', 'hero.svg').replace(/out[\\/]/, '') });
  await run('export.save html', 'export.save', { docId, nodeId: hero, format: 'html', path: join(work, 'site', 'hero.html') });
  await run('export.save tailwind', 'export.save', { docId, nodeId: hero, format: 'tailwind', path: join(work, 'tw', 'hero.html') });
  await run('export.save png', 'export.save', { docId, nodeId: hero, format: 'png', path: join(work, 'hero.png'), image: PNG });
  await run('export.save jpg without image', 'export.save', { docId, nodeId: hero, format: 'jpg', path: join(work, 'hero.jpg') });
  await run('export.save relative path', 'export.save', { docId, nodeId: hero, format: 'svg', path: 'hero.svg' });

  /* library + icons */
  await run('library.list empty', 'library.list', undefined);
  const pub = await run('library.publish', 'library.publish', { docId, nodeId: hero, png: PNG }) as { library: string; id: string };
  await run('library.list', 'library.list', undefined);
  await run('library.insert main', 'library.insert', { docId, library: pub?.library, id: pub?.id });
  await run('library.insert instance', 'library.insert', { docId, library: pub?.library, id: pub?.id, x: 900, y: 900 });
  await run('library.insert missing', 'library.insert', { docId, library: pub?.library, id: 'nope' });
  await run('library.remove', 'library.remove', { library: pub?.library, id: pub?.id });
  await run('library.remove bad id', 'library.remove', { library: pub?.library, id: 'a b' });
  await run('icons.custom.list empty', 'icons.custom.list', undefined);
  await run('icons.custom.add', 'icons.custom.add', { icons: [{ name: 'Star', width: 24, height: 24, node: { type: 'frame', width: 24, height: 24 } }] });
  await run('agent.execute uses my icon', 'agent.execute', { docId, code: "icon('my:Star', null, { size: 24 })" }, agent);
  await run('icons.custom.list', 'icons.custom.list', undefined);
  await run('icons.custom.remove', 'icons.custom.remove', { name: 'Star' });
  await run('icons.custom.add invalid', 'icons.custom.add', { icons: [] });

  /* skills */
  await run('skills.create', 'skills.create', { name: 'parity-skill', description: 'Parity test skill', body: '# Parity\nUse 8px radius.' });
  await run('skills.list', 'skills.list', { docId });
  await run('skills.read', 'skills.read', { id: 'archadev:parity-skill', docId });
  await run('agent.readSkill', 'agent.readSkill', { docId, name: 'parity-skill' }, agent);
  await run('skills.update off', 'skills.update', { id: 'archadev:parity-skill', enabled: false });
  const skillSrc = join(work, 'imported-skill');
  mkdirSync(skillSrc, { recursive: true });
  writeFileSync(join(skillSrc, 'SKILL.md'), '---\nname: imported-skill\ndescription: Imported in the parity test\n---\nBody\n');
  await run('skills.import', 'skills.import', { dir: skillSrc });
  await run('skills.delete', 'skills.delete', { id: 'archadev:parity-skill' });
  await run('skills.create invalid', 'skills.create', { name: 'Bad Name', description: 'x', body: '' });

  /* memory */
  await run('memory.remember global', 'memory.remember', { scope: 'global', text: 'No small labels above headings.' }, agent);
  await run('memory.remember document', 'memory.remember', { docId, scope: 'document', text: 'Brand green is #1f5e3b.', name: 'Brand colour' }, agent);
  await run('memory.list doc', 'memory.list', { docId });
  await run('memory.list default', 'memory.list', undefined);
  await run('memory.forget', 'memory.forget', { id: 'global:no-small-labels-above-headings' });
  await run('memory.forget missing', 'memory.forget', { id: 'global:nope' });

  /* accounts, MCP servers (no logins, no real servers) */
  await run('accounts.overview', 'accounts.overview', undefined);
  const acc = await run('accounts.create', 'accounts.create', { agent: 'claude', name: 'Parity login' }) as { id: string };
  await run('accounts.update', 'accounts.update', { id: acc?.id, name: 'Renamed', isDefault: true });
  await run('accounts.useOnHost unknown', 'accounts.useOnHost', { id: 'nope' });
  await run('accounts.captureHost wrong agent', 'accounts.captureHost', { agent: 'claude' });
  await run('accounts.login.code unknown', 'accounts.login.code', { id: 'nope', code: 'abc' });
  await run('accounts.login.cancel unknown', 'accounts.login.cancel', { id: 'nope' });
  await run('accounts.login.start invalid', 'accounts.login.start', { id: '' });
  await run('accounts.delete', 'accounts.delete', { id: acc?.id });
  await run('mcp.list empty', 'mcp.list', undefined);
  const srv = await run('mcp.save', 'mcp.save', { name: 'parity', transport: 'stdio', command: 'node', args: ['-e', 'process.exit(0)'], env: [{ key: 'TOKEN', value: 's3cret' }] }) as { id: string };
  await run('mcp.save reserved', 'mcp.save', { name: 'archadev', transport: 'stdio', command: 'node' });
  await run('mcp.list', 'mcp.list', undefined);
  await run('mcp.test invalid', 'mcp.test', { name: '' });
  await run('mcp.import invalid', 'mcp.import', { source: 'nowhere', names: [] });
  await run('mcp.delete', 'mcp.delete', { id: srv?.id });

  /* chat (no agent process is started) */
  await run('chat.list', 'chat.list', { docId });
  await run('chat.runs', 'chat.runs', undefined);
  await run('chat.queued', 'chat.queued', { threadId: 'thread-1' });
  await run('chat.sendQueued unknown', 'chat.sendQueued', { threadId: 'thread-1', id: 'q1' });
  await run('chat.unqueue unknown', 'chat.unqueue', { threadId: 'thread-1', id: 'q1' });
  await run('chat.stop unknown run', 'chat.stop', { runId: 'nope' });
  await run('chat.send unknown agent', 'chat.send', { docId, agent: 'nobody', prompt: 'Hi' });
  await run('chat.send invalid thread', 'chat.send', { docId, agent: 'claude', prompt: 'Hi', threadId: 'bad id!' });
  await run('chat.warm unknown agent', 'chat.warm', { docId, agent: 'nobody' });
  await run('chat.deleteThread', 'chat.deleteThread', { docId, threadId: 'thread-1' });
  await run('agents.models invalid', 'agents.models', { agent: 'nobody' });
  await run('orchestra.delegate not a lead', 'orchestra.delegate', { tasks: [{ title: 'A', prompt: 'Do A' }] }, agent);
  await run('orchestra.wait not a lead', 'orchestra.wait', {}, agent);
  await run('orchestra.tell not a lead', 'orchestra.tell', { worker: 'w', message: 'hi' }, agent);
  await run('render.respond unknown', 'render.respond', { requestId: 'nope', error: 'x' });

  /* save, Save As, close, open */
  await run('doc.save no path yet', 'doc.save', { docId });
  await run('doc.save relative', 'doc.save', { docId, path: 'rel.archa' });
  const file = join(work, 'parity.archa');
  await run('doc.save first', 'doc.save', { docId, path: file });
  await run('memory.list after save (data folder moved)', 'memory.list', { docId });
  await run('doc.save again', 'doc.save', { docId });
  await run('doc.save as (no extension)', 'doc.save', { docId, path: join(work, 'copy') });
  await run('doc.close', 'doc.close', { docId });
  await run('workspace.list after close', 'workspace.list', undefined);
  const reopened = await run('doc.open', 'doc.open', { path: join(work, 'copy.archa') }) as { docId: string };
  await run('doc.open again', 'doc.open', { path: join(work, 'copy.archa') });
  await run('doc.open missing', 'doc.open', { path: join(work, 'missing.archa') });
  await run('agent.state reopened by path', 'agent.state', { docId: join(work, 'copy.archa') }, agent);
  await run('memory.list reopened', 'memory.list', { docId: reopened?.docId });
  await run('chat.list reopened', 'chat.list', { docId: reopened?.docId });
  await run('doc.close unknown', 'doc.close', { docId: 'nope' });

  /* callers' edge params: where the new router's schemas could differ from the old handlers */
  const { docId: untitled } = await run('doc.new for edge cases', 'doc.new', {}, agent) as { docId: string };
  await run('edge: MCP save_document without doc (docId "")', 'doc.save', { docId: '', path: join(work, 'edge.archa') }, agent);
  await run('edge: inspect with node ""', 'agent.outline', { docId: untitled, node: '' }, agent);
  await run('edge: say with nodeId ""', 'agent.say', { docId: untitled, text: 'hi', nodeId: '' }, agent);
  await run('edge: screenshot node ""', 'agent.screenshot', { docId: untitled, node: '' }, agent);
  await run('edge: say text over 10k', 'agent.say', { docId: untitled, text: 'x'.repeat(10_001) }, agent);
  await run('edge: doc.rename 250 chars', 'doc.rename', { docId: untitled, name: 'n'.repeat(250) });
  await run('edge: doc.new 250 chars', 'doc.new', { name: 'n'.repeat(250) });
  await run('edge: doc.apply without label', 'doc.apply', { docId: untitled, baseRevision: 0, ops: [] });
  await run('edge: doc.undo without docId', 'doc.undo', {});
  await run('edge: chat.list without docId', 'chat.list', {});
  await run('edge: agent.state docId null', 'agent.state', { docId: null }, agent);
  await run('edge: activity.list limit 5000', 'activity.list', { limit: 5000 });
  await run('edge: doc.save docId long path', 'doc.save', { docId: join(work, `${'d'.repeat(210)}.archa`) });
  await run('edge: unknown method', 'doc.explode', {});

  return { steps, persona };
}

/** Stable text for diffing: temp paths, random ids, persona names and timestamps replaced. */
function normalise(log: unknown, home: string, work: string, persona: string): unknown {
  const repo = resolve(__dirname, '../../..');
  const ids = new Map<string, string>();
  const str = (s: string) => {
    for (const [p, tag] of [[work, '<WORK>'], [home, '<HOME>'], [repo, '<REPO>']] as const) {
      for (const v of new Set([p, p.replace(/\\/g, '/'), p.replace(/\//g, '\\'), encodeURIComponent(p)])) s = s.split(v).join(tag);
    }
    if (persona) s = s.split(persona).join('<PERSONA>');
    s = s.replace(/-[0-9a-z]{7,9}\.png/g, '-<T>.png');
    // Random ids (newId): 10 chars, letters and digits, mapped in order of first appearance.
    return s.replace(/(?<![A-Za-z0-9])[0-9A-Za-z]{10}(?![A-Za-z0-9])/g, (m) => {
      if (!/\d/.test(m) && !(/[A-Z]/.test(m.slice(1)) && /[a-z]/.test(m))) return m;
      if (!ids.has(m)) ids.set(m, `ID${ids.size}`);
      return ids.get(m)!;
    });
  };
  const volatile = new Set(['ts', 'connectedAt', 'updatedAt', 'createdAt', 'publishedAt', 'startedAt', 'addedAt', 'elapsedMs', 'mtime']);
  const walk = (v: unknown, key = ''): unknown => {
    if (typeof v === 'string') return (key === 'editId' || key === 'threadId') && /^[0-9A-Za-z]{6}$/.test(v) ? '<ID6>' : str(v);
    if (typeof v === 'number') return volatile.has(key) ? 0 : v;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [str(k), walk(x, k)]));
    return v;
  };
  return walk(log);
}

let home: string;
let work: string;
let result: Awaited<ReturnType<typeof scenario>>;
const prevHome = process.env.ARCHA_HOME;

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'archa-parity-home-'));
  work = mkdtempSync(join(tmpdir(), 'archa-parity-work-'));
  process.env.ARCHA_HOME = home;
  result = await scenario(work);
  if (process.env.PARITY_OUT) writeFileSync(process.env.PARITY_OUT, JSON.stringify(normalise(result.steps, home, work, result.persona), null, 2));
}, 120_000);
afterAll(() => {
  if (prevHome === undefined) delete process.env.ARCHA_HOME; else process.env.ARCHA_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const step = (label: string) => {
  const s = result.steps.find((x) => x.label === label);
  if (!s) throw new Error(`no step "${label}"`);
  return s;
};
const ok = <T = never>(label: string): T => {
  const s = step(label);
  expect(s.reply, `${label}: ${JSON.stringify(s.reply).slice(0, 300)}`).toMatchObject({ ok: true });
  return (s.reply as { result: unknown }).result as T;
};
const fails = (label: string, code: string, message?: RegExp) => {
  const s = step(label);
  expect(s.reply.ok, label).toBe(false);
  if (!s.reply.ok) {
    expect(s.reply.code, label).toBe(code);
    if (message) expect(s.reply.message, label).toMatch(message);
  }
};
const events = (label: string, conn: 'win' | 'agent') => step(label).events[conn]!.map((e) => e.event);

describe('host behaviour parity scenario', () => {
  it('documents: new, rename, apply, undo/redo, save, Save As, close, open', () => {
    expect(events('doc.new named', 'win')).toEqual(['workspace.changed']);
    expect(events('doc.rename', 'agent')).toEqual(['workspace.changed']);
    expect(ok<{ revision: number }>('doc.apply insert').revision).toBe(1);
    expect(events('doc.apply insert', 'agent')).toEqual(['doc.applied', 'workspace.changed']);
    // An older baseRevision is rebased, not refused, when the ops do not touch what changed since.
    expect(ok<{ revision: number }>('doc.apply stale revision').revision).toBe(2);
    fails('doc.apply invalid op', 'VALIDATION', /Invalid ops/);
    expect(ok('doc.undo')).toEqual({ revision: 3 });
    expect(ok('doc.redo')).toEqual({ revision: 4 });
    expect(ok('doc.undo by agent (nothing of its own)')).toBeNull();
    fails('doc.save no path yet', 'VALIDATION', /No file path yet/);
    fails('doc.save relative', 'VALIDATION', /must be absolute/);
    expect(ok<{ path: string }>('doc.save first').path).toBe(join(work, 'parity.archa'));
    expect(ok<Array<{ id: string }>>('memory.list after save (data folder moved)').some((m) => m.id === 'document:brand-colour')).toBe(true);
    expect(ok<{ path: string }>('doc.save as (no extension)').path).toBe(join(work, 'copy.archa'));
    expect(events('doc.close', 'win')).toEqual(['workspace.changed']);
    const reopened = ok<{ docId: string }>('doc.open');
    expect(ok('doc.open again')).toEqual(reopened);
    fails('doc.open missing', 'ENOENT');
    expect(ok<string>('agent.state reopened by path')).toContain('Hero');
    expect(ok<Array<{ id: string }>>('memory.list reopened').some((m) => m.id === 'document:brand-colour')).toBe(true);
    ok('doc.close unknown');
    fails('edge: unknown method', 'NOT_FOUND', /Unknown method/);
  });

  it('agent tools: execute, state, outline, say, screenshot, reference, done', () => {
    expect(ok<{ ok: boolean }>('agent.execute ok').ok).toBe(true);
    const bad = ok<{ ok: boolean; editId?: string }>('agent.execute failing');
    expect(bad.ok).toBe(false);
    expect(bad.editId).toBeTruthy();
    expect(ok<{ ok: boolean }>('agent.execute patch by editId').ok).toBe(true);
    expect(ok<{ ok: boolean }>('agent.execute unknown editId').ok).toBe(false);
    expect(ok<{ ok: boolean }>('agent.execute syntax error').ok).toBe(false);
    expect(events('agent.execute ok', 'win')).toContain('doc.applied');
    expect(events('agent.execute ok', 'win')).toContain('agent.trail');
    expect(ok<string>('agent.state')).toContain('Hero');
    expect(ok<string>('agent.state default doc')).toContain('Hero');
    expect(ok<string>('agent.outline page')).toMatch(/^Nothing selected — the page:/);
    expect(ok<string>('agent.outline node')).toContain('Title');
    fails('agent.outline missing node', 'NOT_FOUND', /No node/);
    expect(ok<{ svg: string }>('agent.exportSvg').svg).toMatch(/^<svg/);
    expect(events('agent.say', 'win')).toEqual(['activity', 'agent.trail']);
    expect(events('agent.say no node', 'win')).toEqual(['activity']);
    // execute already verified Hero with a screenshot for this client, so the first explicit one is unchanged.
    expect(ok<{ unchanged?: boolean }>('agent.screenshot').unchanged).toBe(true);
    expect(ok<{ unchanged?: boolean }>('agent.screenshot unchanged').unchanged).toBe(true);
    expect(ok<{ slices?: unknown[] }>('agent.screenshot sliced').slices).toHaveLength(1);
    ok('agent.reference png');
    expect(step('agent.reference missing').reply.ok).toBe(false);
    fails('agent.compare (window cannot)', 'CONFLICT');
    expect(step('agent.readSkill unknown').reply.ok).toBe(false);
    fails('agent.browser headless', 'INTERNAL', /needs the ArchaDev app/);
    fails('agent.browser invalid', 'INVALID_PARAMS', /Invalid params for agent\.browser/);
    fails('agent.placeImage no source', 'VALIDATION', /place_image needs url/);
    expect(events('agent.done', 'win')).toEqual(['activity', 'agent.done']);
    const feed = ok<Array<{ tool: string; text: string }>>('activity.list');
    expect(feed.map((a) => a.tool)).toEqual(expect.arrayContaining(['say', 'screenshot', 'reference', 'done']));
    expect(feed.find((a) => a.tool === 'done')?.text).toBe('Hero built');
  });

  it('export, library and icons', () => {
    expect(ok<{ code: string }>('export.code css').code).toContain('<html');
    expect(ok<{ code: string }>('export.code tailwind').code).toContain('class=');
    expect(ok<{ width: number }>('export.page').width).toBe(400);
    expect(ok<{ files: string[] }>('export.save svg').files).toHaveLength(1);
    expect(ok<{ files: string[] }>('export.save html').files.length).toBeGreaterThanOrEqual(2);
    ok('export.save tailwind');
    ok('export.save png');
    fails('export.save jpg without image', 'VALIDATION', /needs the rendered image/);
    fails('export.save relative path', 'VALIDATION', /must be absolute/);
    expect(ok<unknown[]>('library.list empty')).toEqual([]);
    ok('library.publish');
    expect(ok<unknown[]>('library.list')).toHaveLength(1);
    expect(ok<{ placed: string }>('library.insert main').placed).toBe('main');
    expect(ok<{ placed: string }>('library.insert instance').placed).toBe('instance');
    fails('library.insert missing', 'NOT_FOUND');
    ok('library.remove');
    fails('library.remove bad id', 'INVALID_PARAMS');
    expect(ok<unknown[]>('icons.custom.add')).toHaveLength(1);
    expect(ok<{ ok: boolean }>('agent.execute uses my icon').ok).toBe(true);
    ok('icons.custom.remove');
    fails('icons.custom.add invalid', 'INVALID_PARAMS');
  });

  it('skills, memory, accounts and MCP servers', () => {
    ok('skills.create');
    expect(JSON.stringify(ok('skills.list'))).toContain('parity-skill');
    expect(JSON.stringify(ok('skills.read'))).toContain('8px radius');
    expect(ok<{ text: string }>('agent.readSkill').text).toContain('8px radius');
    expect(events('skills.update off', 'win')).toEqual(['skills.changed']);
    ok('skills.import');
    ok('skills.delete');
    fails('skills.create invalid', 'INVALID_PARAMS');
    expect(events('memory.remember global', 'win')).toEqual(['memory.changed']);
    expect(ok<Array<{ id: string }>>('memory.list doc').map((m) => m.id).sort()).toEqual(['document:brand-colour', 'global:no-small-labels-above-headings']);
    ok('memory.forget');
    fails('memory.forget missing', 'NOT_FOUND');
    ok('accounts.overview');
    expect(ok<{ id: string }>('accounts.create').id).toBeTruthy();
    expect(events('accounts.create', 'win')).toContain('accounts.changed');
    ok('accounts.update');
    ok('accounts.delete');
    fails('accounts.captureHost wrong agent', 'INVALID_PARAMS');
    expect(ok<unknown[]>('mcp.list empty')).toEqual([]);
    ok('mcp.save');
    fails('mcp.save reserved', 'INVALID_PARAMS');
    expect(ok<unknown[]>('mcp.list')).toHaveLength(1);
    fails('mcp.import invalid', 'INVALID_PARAMS');
    ok('mcp.delete');
  });

  it('chat and orchestrate without a running agent', () => {
    expect(ok<unknown[]>('chat.list')).toEqual([]);
    expect(ok<unknown[]>('chat.runs')).toEqual([]);
    expect(ok<unknown[]>('chat.queued')).toEqual([]);
    expect(step('chat.send unknown agent').reply.ok).toBe(false);
    fails('chat.send invalid thread', 'INVALID_PARAMS');
    expect(ok<{ warm: boolean }>('chat.warm unknown agent').warm).toBe(false);
    ok('chat.deleteThread');
    fails('agents.models invalid', 'INVALID_PARAMS');
    expect(step('orchestra.delegate not a lead').reply.ok).toBe(false);
    expect(step('orchestra.wait not a lead').reply.ok).toBe(false);
    expect(step('orchestra.tell not a lead').reply.ok).toBe(false);
    ok('render.respond unknown');
  });

  it('edge params callers send all get a reply', () => {
    // Logged for the parity diff (PARITY_OUT); the old and new hosts differ on some of these on purpose.
    for (const s of result.steps.filter((x) => x.label.startsWith('edge:'))) expect(s.reply, s.label).toHaveProperty('ok');
  });

  it('accepts what main accepted: save without doc, say with nodeId "", long names and long doc paths', () => {
    const reply = (label: string) => result.steps.find((x) => x.label === label)?.reply as { ok: boolean; error?: { code: string } } | undefined;
    for (const label of ['edge: MCP save_document without doc (docId "")', 'edge: say with nodeId ""', 'edge: doc.rename 250 chars', 'edge: doc.new 250 chars']) {
      expect(reply(label)?.ok, label).toBe(true);
    }
    expect(reply('edge: doc.save docId long path')?.error?.code, 'long path reaches session lookup').not.toBe('VALIDATION');
  });
});
