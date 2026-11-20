import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Channel, ChatMessage, ChatRunEvent, Message } from '@archa/protocol';
import { Workspace } from '../src/core-host/workspace';
import { ADAPTERS, type Adapter, type AgentEvent } from '../src/core-host/agent-adapters';

/* Chat tool rows (input + paired result) and `/skill` mentions (blueprint AGENT_BRIDGE/03, /05). */

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-chat-details-'));
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

/** An agent CLI that prints the given events as JSON lines and exits; the last prompt it got is kept. */
let lastPrompt = '';
const fake = (events: AgentEvent[]) => ({
  id: 'fake', label: 'Fake', bin: 'node',
  build: ({ prompt }: { prompt: string }) => {
    lastPrompt = prompt;
    return { args: ['-e', events.map((e) => `console.log(${JSON.stringify(JSON.stringify(e))});`).join('')] };
  },
  parser: () => ({ line: (l: string) => { try { return [JSON.parse(l) as AgentEvent]; } catch { return []; } } }),
  models: async () => ({ models: [], source: '' }),
}) as unknown as Adapter;

async function runOnce(ws: Workspace, ui: ReturnType<typeof fakeChannel>, docId: string, prompt: string) {
  const r = ws.chat.send(docId, 'fake', prompt);
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (ui.events.some((e) => e.event === 'chat.run' && (e.data as ChatRunEvent).runId === r.runId && (e.data as ChatRunEvent).status !== 'running')) { clearInterval(check); resolve(); }
    }, 20);
  });
  return r;
}

describe('chat tool rows', () => {
  let adapter: Adapter;
  afterEach(() => { ADAPTERS.splice(ADAPTERS.indexOf(adapter), 1); });

  it('keep the full input and get the result filled in, also after a restart', async () => {
    adapter = fake([
      { kind: 'tool', text: 'execute · Hero · 2 lines', detail: '// Hero\ninsert()', callId: 'c1' },
      { kind: 'result', callId: 'c1', text: 'OK (revision 2).', failed: false },
      { kind: 'tool', text: 'inspect · whole page', callId: 'c2' },
      { kind: 'result', callId: 'c2', text: 'Reason: nope', failed: true },
    ]);
    ADAPTERS.push(adapter);
    const ws = new Workspace();
    const ui = fakeChannel();
    ws.attach(ui.channel, { kind: 'renderer', name: 'window' });
    const docId = ws.summaries()[0]!.id;
    await runOnce(ws, ui, docId, 'build a hero');

    const tools = ws.chat.list(docId).filter((m) => m.role === 'tool');
    expect(tools.map((m) => [m.text, m.detail, m.result, m.failed])).toEqual([
      ['execute · Hero · 2 lines', '// Hero\ninsert()', 'OK (revision 2).', undefined],
      ['inspect · whole page', undefined, 'Reason: nope', true],
    ]);
    // The result is sent again under the row's id, so the chat replaces the row instead of adding one.
    const sent = ui.events.filter((e) => e.event === 'chat.message' && (e.data as ChatMessage).role === 'tool').map((e) => (e.data as ChatMessage).id);
    expect(sent).toEqual([tools[0]!.id, tools[0]!.id, tools[1]!.id, tools[1]!.id]);

    // History on disk has each row twice; reading it back keeps one row per id, with the result.
    const reread = new Workspace();
    const back = reread.chat.list(docId).filter((m) => m.role === 'tool');
    expect(back.map((m) => [m.id, m.result])).toEqual([[tools[0]!.id, 'OK (revision 2).'], [tools[1]!.id, 'Reason: nope']]);
  }, 20_000);

  it('send the instructions of a /skill or /guide named in the message, and ignore unknown names', async () => {
    adapter = fake([{ kind: 'text', text: 'done' }]);
    ADAPTERS.push(adapter);
    const dir = join(home, 'skills', 'brand-voice');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: brand-voice\ndescription: Our tone of voice\n---\n\nAlways write in a calm, plain voice.\n');
    const ws = new Workspace();
    const ui = fakeChannel();
    ws.attach(ui.channel, { kind: 'renderer', name: 'window' });
    const docId = ws.summaries()[0]!.id;
    await runOnce(ws, ui, docId, 'a hero for a bakery /brand-voice, see /landing. Not a skill: /nope or a/path');

    expect(lastPrompt).toContain('Skills the person asked for with /name');
    expect(lastPrompt).toContain('## /brand-voice — Our tone of voice');
    expect(lastPrompt).toContain('Always write in a calm, plain voice.');
    expect(lastPrompt).toContain(`(Skill folder: ${dir}`);
    expect(lastPrompt).toContain('## /landing\n# Landing page');
    expect(lastPrompt).not.toContain('## /nope');
    expect(lastPrompt).not.toContain('## /path');
    // A CLI without a Skill tool is told which skills are on and where their SKILL.md is.
    expect(lastPrompt).toContain('Skills you can use');
    expect(lastPrompt).toContain(`- brand-voice: Our tone of voice (${join(dir, 'SKILL.md')})`);
    // The message itself is shown as typed.
    expect(ws.chat.list(docId).find((m) => m.role === 'user')!.text).toBe('a hero for a bakery /brand-voice, see /landing. Not a skill: /nope or a/path');
  }, 20_000);
});
