import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BROWSER_TOOL_DOC, browserInputShape, EXECUTE_API_DOC, type ExecuteResult, type RpcClient } from '@archa/protocol';
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

  const server = new McpServer({ name: 'archadev', version: '0.3.0' });
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
