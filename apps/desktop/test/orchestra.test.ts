import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel, ChatRunEvent, Message } from '@archa/protocol';
import { Workspace } from '../src/core-host/workspace';
import { ADAPTERS, type Adapter } from '../src/core-host/agent-adapters';

/* Orchestrate mode (blueprint AGENT_BRIDGE/06): a lead thread delegates to worker threads and collects their reports. */

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-orchestra-'));
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

// Lead turns stay busy (as if planning); worker turns answer with the first line of what they were given.
const SCRIPT = `let d='';process.stdin.on('data',(c)=>d+=c).on('end',()=>{if(d.includes('ORCHESTRATE MODE')||d.includes('Your workers finished'))setTimeout(()=>{},8000);else console.log(d.split('\\n')[0]);});`;
const fake = {
  id: 'fake', label: 'Fake', bin: 'node',
  build: ({ prompt }: { prompt: string }) => ({ args: ['-e', SCRIPT], stdin: prompt }),
  parser: () => ({ line: (l: string) => [{ kind: 'text', text: l }] }),
  models: async () => ({ models: [], source: '' }),
} as unknown as Adapter;

function setup() {
  const ws = new Workspace();
  const ui = fakeChannel();
  ws.attach(ui.channel, { kind: 'renderer', name: 'window' });
  const docId = ws.summaries()[0]!.id;
  const ended = (threadId: string) => new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!ws.chat.active().some((r) => r.threadId === threadId)) { clearInterval(check); resolve(); }
    }, 20);
  });
  return { ws, ui, docId, ended };
}

describe('orchestrate mode', () => {
  beforeEach(() => { ADAPTERS.push(fake); });
  afterEach(() => { ADAPTERS.splice(ADAPTERS.indexOf(fake), 1); });

  it('refuses team tools outside an orchestrate chat', async () => {
    const { ws, docId, ended } = setup();
    const plain = ws.chat.send(docId, 'fake', 'just design');
    const conn = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'fake', agentId: 'fake', runId: plain.runId });
    expect(() => ws.handlers['orchestra.delegate']({ tasks: [{ title: 'A', prompt: 'a' }] }, conn)).toThrow(/Orchestrate chat/);
    await ended(plain.threadId);
  }, 20_000);

  it('starts workers in parallel, scopes them to a frame and collects their reports', async () => {
    const { ws, docId, ended } = setup();
    const lead = ws.chat.send(docId, 'fake', 'Build a landing page with a team', undefined, undefined, undefined, { mode: 'orchestrate' });
    const conn = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'fake', agentId: 'fake', runId: lead.runId });
    ws.requestRender = async () => ({ png: 'AAAA' });
    const made = await ws.handlers['agent.execute']({ docId, code: `insert(null, { type: 'frame', name: 'Hero', width: 400, height: 200 })` }, conn);
    expect(made.ok).toBe(true);
    const hero = made.ok ? made.created[0]!.id : '';

    const r = await ws.handlers['orchestra.delegate']({ tasks: [
      { title: 'Hero section', prompt: 'Build the hero', kind: 'design', frame: hero },
      { title: 'Research', prompt: 'Look at three competitors', kind: 'research' },
    ] }, conn);
    expect(r.workers).toHaveLength(2);
    const [a, b] = r.workers;
    expect(a!.persona).not.toBe(b!.persona);
    expect([a!.persona, b!.persona]).not.toContain(lead.persona);

    // Workers' chats show the lead's prompt and know their lead and task; the lead is tagged as lead.
    const list = ws.chat.list(docId);
    const firstOf = (threadId: string) => list.find((m) => (m.threadId ?? m.runId) === threadId)!;
    expect(firstOf(lead.threadId).orchestra).toEqual({ lead: true });
    expect(firstOf(a!.threadId)).toMatchObject({ role: 'user', text: 'Build the hero', persona: a!.persona, orchestra: { parent: lead.threadId, title: 'Hero section', kind: 'design', prompt: 'Build the hero' } });

    const done = await ws.handlers['orchestra.wait']({}, conn);
    expect(done.timedOut).toBe(false);
    expect(done.workers.map((w) => w.status)).toEqual(['finished', 'finished']);
    // Each worker received its team brief (its first line is echoed back by the fake agent).
    expect(done.workers[0]!.reply).toBe(`You are ${a!.persona}, a worker in a team led by ${lead.persona}. Do only this task.`);

    // A follow-up reaches one worker by name.
    expect(ws.handlers['orchestra.tell']({ worker: b!.persona, message: 'Add one more' }, conn)).toEqual({ queued: false });
    await ended(b!.threadId);

    // Stopping the lead stops the team.
    ws.chat.stop(lead.runId);
    await ended(lead.threadId);
    expect(ws.chat.active()).toEqual([]);
  }, 30_000);

  it('reports back to an idle lead once the whole team is done', async () => {
    const { ws, ui, docId, ended } = setup();
    const lead = ws.chat.send(docId, 'fake', 'Split this', undefined, undefined, undefined, { mode: 'orchestrate' });
    const conn = ws.attach(fakeChannel().channel, { kind: 'mcp', name: 'fake', agentId: 'fake', runId: lead.runId });
    const r = ws.chat.delegate(conn.threadId, [{ title: 'One', prompt: 'one' }, { title: 'Two', prompt: 'two' }]);
    // The lead ends its turn without waiting (not a stop by the person).
    ws.chat.stop(lead.runId, false);
    await Promise.all(r.workers.map((w) => ended(w.threadId)));
    // Once the lead is idle and every worker is done, the reports start a new lead turn.
    const notice = `Team finished — ${lead.persona} is checking their work`;
    await new Promise<void>((resolve) => {
      const check = setInterval(() => { if (ws.chat.list(docId).some((m) => m.threadId === lead.threadId && m.text === notice)) { clearInterval(check); resolve(); } }, 20);
    });
    const runs = ui.events.filter((e) => e.event === 'chat.run').map((e) => e.data as ChatRunEvent);
    expect(runs.filter((x) => x.threadId === lead.threadId && x.status === 'running')).toHaveLength(2);
    ws.chat.stop(ws.chat.active().find((x) => x.threadId === lead.threadId)!.runId);
    await ended(lead.threadId);
  }, 30_000);
});
