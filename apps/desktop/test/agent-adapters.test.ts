import { describe, expect, it } from 'vitest';
import { ADAPTERS, type AgentEvent } from '../src/core-host/agent-adapters';

const adapter = (id: string) => ADAPTERS.find((a) => a.id === id)!;
const mcp = { command: 'node', args: ['archa.cjs', 'mcp', '--doc', 'd1', '--agent', 'x'], env: {} };
const feed = (id: string, lines: unknown[]): AgentEvent[] => {
  const p = adapter(id).parser();
  return lines.flatMap((l) => p.line(JSON.stringify(l)));
};

describe('agent adapters: build', () => {
  it('claude reads the prompt from stdin and keeps user hooks/plugins out', () => {
    const b = adapter('claude').build({ prompt: 'make a card; rm -rf /', mcp, mcpConfigFile: 'cfg.json', model: 'sonnet', sessionId: 's1' });
    expect(b.stdin).toBe('make a card; rm -rf /');
    expect(b.args).not.toContain('make a card; rm -rf /');
    expect(b.args).toEqual(expect.arrayContaining(['-p', '--setting-sources', 'project,local', '--strict-mcp-config', '--model', 'sonnet', '--resume', 's1', '--include-partial-messages']));
  });

  it('agy passes the prompt as one argv element and trims the canvas state past the argv limit', () => {
    const big = `do it\n\n---\nCurrent canvas state (fresh):\n${'x'.repeat(40_000)}`;
    const b = adapter('agy').build({ prompt: big, mcp, mcpConfigFile: 'cfg.json', model: 'gemini-3.8-flash-low' });
    const prompt = b.args[b.args.indexOf('-p') + 1]!;
    expect(prompt.length).toBeLessThan(28_100);
    expect(prompt).toContain('do it');
    expect(prompt).toContain('get_state');
    expect(b.args).toEqual(expect.arrayContaining(['--output-format', 'stream-json', '--model', 'gemini-3.8-flash-low']));
    expect(adapter('agy').build({ prompt: 'again', mcp, mcpConfigFile: 'c', sessionId: 'conv-1' }).args).toEqual(expect.arrayContaining(['--conversation', 'conv-1']));
  });

  it('codex gets the MCP server through -c overrides and the prompt on stdin', () => {
    const b = adapter('codex').build({ prompt: 'hello', mcp, mcpConfigFile: 'c', sessionId: 't1' });
    expect(b.args[0]).toBe('exec');
    expect(b.args).toContain('mcp_servers.archadev.command="node"');
    expect(b.args.slice(-3)).toEqual(['resume', 't1', '-']);
    expect(b.stdin).toBe('hello');
  });
});

describe('agent adapters: stream parsers', () => {
  it('claude streams text deltas, then the finished message and tool calls', () => {
    const ev = feed('claude', [
      { type: 'system', subtype: 'init', session_id: 's9' },
      { type: 'stream_event', event: { type: 'message_start' } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }, { type: 'tool_use', name: 'mcp__archadev__execute', input: { code: 'a\nb' } }] } },
      { type: 'result', is_error: false, result: 'Hello' },
    ]);
    expect(ev).toContainEqual({ kind: 'session', id: 's9' });
    expect(ev.filter((e) => e.kind === 'delta').map((e) => (e as { text: string }).text)).toEqual(['Hel', 'Hello']);
    expect(ev).toContainEqual({ kind: 'text', text: 'Hello' });
    expect(ev).toContainEqual({ kind: 'tool', text: 'execute · 2 lines' });
  });

  it('agy joins text deltas per step and unwraps call_mcp_tool', () => {
    const ev = feed('agy', [
      { event: 'init', conversation_id: 'c1', init: { model: 'm' } },
      { event: 'step_update', step_update: { conversation_id: 'c1', step_index: 2, state: 'ACTIVE', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'archadev', ToolName: 'get_state', Arguments: {} } } } },
      { event: 'step_update', step_update: { step_index: 3, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Done ' } },
      { event: 'step_update', step_update: { step_index: 3, state: 'DONE', step_type: 'agent_response', text_delta: 'designing.' } },
      { event: 'result', result: { status: 'SUCCESS', response: 'Done designing.' } },
    ]);
    expect(ev).toContainEqual({ kind: 'session', id: 'c1' });
    expect(ev).toContainEqual({ kind: 'tool', text: 'get_state' });
    expect(ev).toContainEqual({ kind: 'delta', text: 'Done ' });
    expect(ev).toContainEqual({ kind: 'text', text: 'Done designing.' });
  });

  it('agy reports a failed result as an error', () => {
    const ev = feed('agy', [{ event: 'result', result: { status: 'ERROR', error: 'No capacity' } }]);
    expect(ev).toEqual([{ kind: 'error', text: 'No capacity' }]);
  });

  it('codex maps thread, agent messages and failures', () => {
    const ev = feed('codex', [
      { type: 'thread.started', thread_id: 't1' },
      { type: 'item.completed', item: { type: 'agent_message', text: 'Built it' } },
      { type: 'turn.failed', error: { message: 'usage limit' } },
    ]);
    expect(ev).toEqual([{ kind: 'session', id: 't1' }, { kind: 'text', text: 'Built it' }, { kind: 'error', text: 'usage limit' }]);
  });

  it('claude reports a CLI error once, with a sign-in hint for auth failures', () => {
    const ev = feed('claude', [
      { type: 'assistant', error: 'authentication_failed', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Failed to authenticate' }] } },
      { type: 'result', is_error: true, result: 'Failed to authenticate' },
    ]);
    expect(ev.filter((e) => e.kind !== 'session')).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'error' });
    expect((ev[0] as { text: string }).text).toContain('Settings → Agents');
  });

  it('shows say as a message, not a tool line', () => {
    expect(feed('claude', [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__archadev__say', input: { text: 'Building the header' } }] } }]))
      .toEqual([{ kind: 'text', text: 'Building the header' }]);
  });

  it('surfaces a rolled-back execute with its reason', () => {
    const failed = 'FAILED — rolled back, nothing changed (revision still 3).\nReason: insert: parent "x" not found\neditId: e1 — fix with execute(...)';
    expect(feed('claude', [{ type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: failed }] }] } }]))
      .toEqual([{ kind: 'tool', text: 'execute failed · insert: parent "x" not found' }]);
    expect(feed('agy', [{ event: 'step_update', step_update: { step_index: 4, state: 'DONE', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { output: failed } } }]))
      .toEqual([{ kind: 'tool', text: 'execute failed · insert: parent "x" not found' }]);
    expect(feed('claude', [{ type: 'user', message: { content: [{ type: 'tool_result', content: 'OK (revision 4).' }] } }])).toEqual([]);
  });

  it('ignores non-JSON lines', () => {
    expect(adapter('claude').parser().line('Warning: something')).toEqual([]);
  });
});
