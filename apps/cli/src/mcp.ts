import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BROWSER_TOOL_DOC, browserInputShape, EXECUTE_API_DOC, GUIDE_INDEX, guideText, type ExecuteResult, type RpcClient } from '@archa/protocol';
import { connectCore } from './connect';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

/**
 * `archa mcp`: stdio MCP server relaying to the running app's core host, so the person
 * watches the agent work live (blueprint MCP/01).
 */
export async function runMcp(opts: { doc?: string; agent?: string }) {
  const agentName = opts.agent ?? 'mcp-agent';
  let core: RpcClient | null = null;
  const getCore = async () => (core ??= await connectCore({ kind: 'mcp', name: agentName, agentId: agentName, runId: process.env.ARCHA_RUN_ID || undefined }));
  // Launched runs pass --doc; agy's globally registered server falls back to the run's env.
  const docId = opts.doc ?? process.env.ARCHA_DOC_ID;

  const server = new McpServer({ name: 'archadev', version: '1.4.1' });
  const guard = async (fn: (c: RpcClient) => Promise<Content[]>) => {
    try {
      return { content: await fn(await getCore()) };
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `ERROR: ${(e as Error).message}` }], isError: true };
    }
  };

  server.registerTool('get_state', {
    description: 'Overview of the open ArchaDev document: page root id, selection, top-level frames with ids and sizes. Call first.',
    inputSchema: {},
  }, () => guard(async (c) => [{ type: 'text', text: await c.call('agent.state', { docId }) }]));

  server.registerTool('execute', {
    description: EXECUTE_API_DOC,
    inputSchema: {
      code: z.string().optional().describe('JavaScript snippet'),
      editId: z.string().optional().describe('editId from a failed call, to patch it'),
      edits: z.array(z.object({ find: z.string(), replace: z.string() })).optional(),
    },
  }, (args) => guard(async (c) => formatExecute(await c.call('agent.execute', { docId, ...args }))));

  // Same as execute's svg(): the markup goes in as a tool argument, so the agent never escapes it inside JS.
  server.registerTool('place_svg', {
    description: 'Place SVG markup you wrote (logo, illustration, chart, icon, pattern) on the canvas as a drawing — never as text. Shapes become editable vector layers; gradients, text, filters or masks make it an exact image instead (the reply says which). Replies like execute (ids, screenshot, issues).',
    inputSchema: {
      svg: z.string().describe('Complete SVG markup: <svg viewBox="…">…</svg>'),
      parent: z.string().optional().describe('Frame id or unique name to place it in; default the page (an empty spot)'),
      x: z.number().optional(), y: z.number().optional(),
      width: z.number().optional().describe('Size on the canvas; one side alone keeps the aspect ratio'),
      height: z.number().optional(),
      name: z.string().optional().describe('Layer name'),
      mode: z.enum(['auto', 'vector', 'image']).optional().describe('auto (default) | vector (fail if not editable) | image'),
    },
  }, ({ svg, parent, ...opts }) => guard(async (c) => formatExecute(await c.call('agent.execute', { docId, code: `svg(${JSON.stringify(svg)}, ${JSON.stringify(parent ?? null)}, ${JSON.stringify(opts)})` }))));

  server.registerTool('inspect', {
    description: 'Compact outline of layers as the design panel shows them: type, size, sizing, auto layout (gap/padding/align/justify), fills, strokes, effects, text and context notes people left on layers. No node = the current selection (else the page). Cheaper than get() for reading an existing design before editing it.',
    inputSchema: { node: z.string().optional().describe('Node id or unique name'), depth: z.number().int().min(0).max(12).optional().describe('Levels of children (default 3)') },
  }, ({ node, depth }) => guard(async (c) => [{ type: 'text', text: await c.call('agent.outline', { docId, node, depth }) }]));

  // ArchaDev's internal skill: short design guides, answered locally (no app round-trip).
  server.registerTool('read_guide', {
    description: `Built-in ArchaDev design guide for a topic. Read the one that fits the task before designing. Topics:
${GUIDE_INDEX}`,
    inputSchema: { topic: z.string().describe('Topic name from the list') },
  }, async ({ topic }) => ({ content: [{ type: 'text' as const, text: guideText(topic) }] }));

  server.registerTool('screenshot', {
    description: 'PNG of a node (id or unique name). Says "unchanged" if it did not change since your last screenshot of it.',
    inputSchema: { node: z.string(), scale: z.number().min(0.1).max(4).optional() },
  }, ({ node, scale }) => guard(async (c) => {
    const r = await c.call('agent.screenshot', { docId, node, scale });
    if (r.unchanged) return [{ type: 'text', text: `"${r.name}" is unchanged since your last screenshot.` }];
    return [{ type: 'image', data: r.png!, mimeType: 'image/png' }, { type: 'text', text: verifyLine }];
  }));

  server.registerTool('export_svg', {
    description: 'SVG markup of a node and its subtree.',
    inputSchema: { node: z.string() },
  }, ({ node }) => guard(async (c) => [{ type: 'text', text: (await c.call('agent.exportSvg', { docId, node })).svg }]));

  server.registerTool('say', {
    description: 'One-line progress note shown in the ArchaDev activity feed (optionally pointing at a node).',
    inputSchema: { text: z.string().max(300), nodeId: z.string().optional() },
  }, ({ text, nodeId }) => guard(async (c) => {
    await c.call('agent.say', { docId, text, nodeId });
    return [{ type: 'text', text: 'ok' }];
  }));

  // Orchestrate mode (blueprint AGENT_BRIDGE/06): only a lead thread may use these; others get an error.
  server.registerTool('delegate', {
    description: 'Orchestrate mode only: start one worker agent per task, in parallel on this canvas. Returns their names.',
    inputSchema: {
      tasks: z.array(z.object({
        title: z.string().describe('Short task name'),
        prompt: z.string().describe('Self-contained brief: the worker does not see your conversation'),
        kind: z.string().optional().describe('research | design | copy | review | …'),
        agent: z.enum(['claude', 'agy', 'codex']).optional().describe('Default: your own agent'),
        model: z.string().optional(),
        frame: z.string().optional().describe('Id of the frame the worker builds inside'),
      })).min(1).max(8),
    },
  }, ({ tasks }) => guard(async (c) => {
    const r = await c.call('orchestra.delegate', { tasks });
    return [{ type: 'text', text: `Started ${r.workers.length} worker${r.workers.length === 1 ? '' : 's'}:\n${r.workers.map((w) => `- ${w.persona} (${w.agent}) — ${w.title} [${w.threadId}]`).join('\n')}\nCall wait_workers to collect their reports.` }];
  }));

  server.registerTool('wait_workers', {
    description: 'Orchestrate mode only: wait until your workers finish (or the timeout) and get their reports. Call again while some are still working.',
    inputSchema: {
      workers: z.array(z.string()).optional().describe('Names or thread ids; default all'),
      timeoutSec: z.number().min(5).max(600).optional().describe('Default 240'),
    },
  }, (args) => guard(async (c) => {
    const r = await c.call('orchestra.wait', args);
    const lines = r.workers.map((w) => `## ${w.persona} — ${w.title} (${w.status})\n${w.reply || '(no reply yet)'}`);
    return [{ type: 'text', text: `${r.timedOut ? 'Timed out — some workers are still working; call wait_workers again.\n\n' : ''}${lines.join('\n\n') || 'No workers yet.'}` }];
  }));

  server.registerTool('tell_worker', {
    description: 'Orchestrate mode only: send a follow-up message to one of your workers (queued if it is still working).',
    inputSchema: { worker: z.string().describe('Worker name or thread id'), message: z.string() },
  }, (args) => guard(async (c) => {
    const r = await c.call('orchestra.tell', args);
    return [{ type: 'text', text: r.queued ? 'Queued — it runs when the worker finishes its current turn.' : 'Sent.' }];
  }));

  server.registerTool('browser', {
    description: BROWSER_TOOL_DOC,
    inputSchema: browserInputShape,
  }, (args) => guard(async (c) => {
    const r = await c.call('agent.browser', args);
    return r.png ? [{ type: 'image', data: r.png, mimeType: 'image/png' }, { type: 'text', text: r.text }] : [{ type: 'text', text: r.text }];
  }));

  await server.connect(new StdioServerTransport());
}

const verifyLine = 'Check: nothing broken, collapsed, clipped or overflowing; spacing and alignment even; contrast readable; matches what you intended.';

/** Reply skeleton from blueprint MCP/03, in fixed order. */
function formatExecute(r: ExecuteResult): Content[] {
  if (!r.ok) {
    return [{ type: 'text', text: [
      `FAILED — rolled back, nothing changed (revision still ${r.revision}).`,
      r.statement ? `Statement: ${r.statement}` : '',
      `Reason: ${r.reason}`,
      `editId: ${r.editId} — fix with execute({ editId, edits: [{ find, replace }] }) instead of resending the snippet.`,
    ].filter(Boolean).join('\n') }];
  }
  const out: Content[] = [];
  const lines = [`OK (revision ${r.revision}). Globals you assigned carry over to later calls.`];
  if (r.created.length) lines.push('Created:', ...r.created.map((c) => `  ${c.name} → "${c.id}"`));
  if (r.changed.length) lines.push('Changed:', ...r.changed.map((c) => `  ${c.name} → "${c.id}"`));
  if (r.output.length) lines.push('Output:', ...r.output.map((o) => `  ${o}`));
  out.push({ type: 'text', text: lines.join('\n') });
  for (const s of r.screenshots) {
    if (s.png) out.push({ type: 'image', data: s.png, mimeType: 'image/png' });
    else out.push({ type: 'text', text: s.unchanged ? `Screenshot "${s.name}": unchanged since your last screenshot.` : `Screenshot "${s.name}" failed: ${s.error}` });
  }
  if (r.screenshots.some((s) => s.png)) out.push({ type: 'text', text: verifyLine });
  if (r.issues.length) {
    out.push({ type: 'text', text: ['Issues detected:', ...r.issues.map((i) => `  [${i.rule}] ${i.nodeName} "${i.nodeId}": ${i.message} → ${i.remedy}`), 'Resolve these in your next call.'].join('\n') });
  }
  return out;
}
