import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@archa/protocol';

/*
 * Live runs against the installed agent CLIs (blueprint AGENT_BRIDGE/01 → Tests).
 * Opt-in: ARCHA_AGENT_IT=1 [ARCHA_AGENT_IT_AGENTS=claude,agy]. Uses real logins and quota.
 * The prompt is read-only: the agent only calls get_state and replies.
 */
const enabled = process.env.ARCHA_AGENT_IT === '1';
const agents = (process.env.ARCHA_AGENT_IT_AGENTS ?? 'claude,agy').split(',').map((a) => a.trim()).filter(Boolean);
const MODELS: Record<string, string> = { claude: 'haiku', agy: 'gemini-3.8-flash-low' };

let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-agents-it-'));
  process.env.ARCHA_HOME = home;
});
afterAll(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe.skipIf(!enabled)('live agent runs', () => {
  for (const agent of agents) {
    it(`${agent}: streams a reply and calls the archadev MCP`, async () => {
      const { newHost } = await import('./helpers');
      const ws = newHost();
      const events: Array<{ event: string; data: unknown }> = [];
      const done = new Promise<string>((resolve) => {
        ws.ctx.broadcast = ((event: string, data: unknown) => {
          events.push({ event, data });
          const d = data as { status?: string };
          if (event === 'chat.run' && d.status && d.status !== 'running') resolve(d.status);
        }) as typeof ws.ctx.broadcast;
      });
      const docId = [...ws.ctx.sessions.keys()][0]!;
      ws.chat.send(docId, agent, 'Call the archadev get_state tool once. Change nothing. Then reply with one short sentence.', MODELS[agent], 'host');
      const status = await done;
      const msgs = events.filter((e) => e.event === 'chat.message').map((e) => e.data as ChatMessage);
      const summary = msgs.map((m) => `${m.role}: ${m.text.slice(0, 160)}`).join('\n');
      console.log(`[${agent}] ${status}\n${summary}`);
      expect(status, summary).toBe('finished');
      expect(msgs.some((m) => m.role === 'tool' && m.text.includes('get_state')), summary).toBe(true);
      expect(msgs.some((m) => m.role === 'agent' && m.text.trim().length > 0), summary).toBe(true);
    }, 300_000);
  }
});
