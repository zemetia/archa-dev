import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { guideText, sanitizeGeminiSchema, TOOL_NAMES, TOOLS, type ExecuteResult, type MethodName, type RpcClient, type Shot, type ToolArgs, type ToolDef, type ToolName } from '@archa/protocol';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export type McpServerOptions = {
  /** The core to relay to: the running app's, or a headless host in this process (blueprint MCP/01). */
  getCore: () => Promise<RpcClient>;
  /** Document for tools called without `doc`: `--doc`, else the run's ARCHA_DOC_ID. */
  defaultDoc?: string;
};

/**
 * The `archadev` MCP server: every tool in the registry relays to the core host, so the person
 * watches the agent work live (blueprint MCP/01). `archa mcp` serves it over stdio.
 */
export function createMcpServer({ getCore, defaultDoc }: McpServerOptions): McpServer {
  const server = new McpServer({ name: 'archadev', version: '1.8.0' });
  // Every document tool also takes `doc`, which wins over the default (blueprint MCP/01 → Tool List).
  registerTools(server, getCore, (doc) => doc || defaultDoc);
  return server;
}

/** Serves over stdio; agy's Gemini gets the tool schemas inside its subset. */
export async function serveStdio(server: McpServer, opts: { gemini?: boolean } = {}): Promise<StdioServerTransport> {
  const transport = new StdioServerTransport();
  if (opts.gemini) geminiTools(transport);
  await server.connect(transport);
  return transport;
}

type Ctx = { call: RpcClient['call']; pick: (doc?: string) => string | undefined };
type Reply<N extends ToolName> = (args: ToolArgs<N>, x: Ctx) => Promise<Content[]>;
const text = (t: string): Content[] => [{ type: 'text', text: t }];

/**
 * Every tool in the registry (packages/protocol/src/tools.ts), with its name, description and zod input.
 * A tool without a reply here is relayed to its `rpc` method (`doc` → `docId`) and its result shown as text.
 */
export function registerTools(server: Pick<McpServer, 'registerTool'>, getCore: () => Promise<RpcClient>, pick: Ctx['pick']) {
  const call = (async (method: MethodName, ...p: unknown[]) => (await getCore()).call(method, ...(p as [never]))) as RpcClient['call'];
  for (const name of TOOL_NAMES) {
    const t = TOOLS[name] as ToolDef;
    const reply = (REPLIES[name] ?? relay(t)) as (args: Record<string, unknown>, x: Ctx) => Promise<Content[]>;
    server.registerTool(name, { description: t.description, inputSchema: t.input }, async (args: Record<string, unknown>) => {
      try {
        return { content: await reply(args, { call, pick }) };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `ERROR: ${(e as Error).message}` }], isError: true };
      }
    });
  }
}

function relay(t: ToolDef) {
  return async ({ doc, ...args }: Record<string, unknown>, x: Ctx): Promise<Content[]> => {
    if (!t.rpc) throw new Error('This tool has no core method.');
    const params = 'doc' in t.input ? { docId: x.pick(doc as string | undefined), ...args } : args;
    const r = await (x.call as (m: MethodName, p: unknown) => Promise<unknown>)(t.rpc, params);
    return text(r === undefined || r === null ? 'ok' : typeof r === 'string' ? r : typeof (r as { text?: unknown }).text === 'string' ? (r as { text: string }).text : JSON.stringify(r, null, 2));
  };
}

/** Replies that format their result (or run locally); the rest use `relay`. */
const REPLIES: { [N in ToolName]?: Reply<N> } = {
  list_documents: async (_, { call }) => {
    const docs = await call('workspace.list');
    return text(docs.length ? docs.map((d) => `${d.name} (${d.id})${d.dirty ? ' · unsaved changes' : ''}\n  file: ${d.filePath ?? '(not saved yet)'}\n  data: ${d.dataDir}`).join('\n') : 'No documents are open.');
  },
  open_document: async ({ path }, { call }) => {
    const { docId } = await call('doc.open', { path: path.replace(/\\/g, '/') });
    return text(`Opened ${path} → doc "${docId}"`);
  },
  new_document: async ({ name }, { call }) => {
    const { docId } = await call('doc.new', { name });
    return text(`New document "${name ?? 'Untitled'}" → doc "${docId}"`);
  },
  save_document: async ({ doc, path }, { call, pick }) => {
    const docId = pick(doc);
    if (!docId && !path) throw new Error('Pass `doc` (or rely on the active document) and, for a new document, `path`.');
    const r = await call('doc.save', { docId: docId ?? '', ...(path ? { path: path.replace(/\\/g, '/') } : {}) });
    return text(`Saved → ${r.path}`);
  },
  execute: async ({ doc, ...args }, { call, pick }) => formatExecute(await call('agent.execute', { docId: pick(doc), ...args })),
  // Same as execute's svg(): the markup goes in as a tool argument, so the agent never escapes it inside JS.
  place_svg: async ({ svg, parent, doc, ...opts }, { call, pick }) => formatExecute(await call('agent.execute', { docId: pick(doc), code: `svg(${JSON.stringify(svg)}, ${JSON.stringify(parent ?? null)}, ${JSON.stringify(opts)})` })),
  // ArchaDev's internal skill: short design guides, answered locally (no app round-trip).
  read_guide: async ({ topic }) => text(guideText(topic)),
  screenshot: async ({ node, scale, slices, doc }, { call, pick }) => {
    const r = await call('agent.screenshot', { docId: pick(doc), node, scale, slices });
    if (r.unchanged) return text(`"${r.name}" is unchanged since your last screenshot.`);
    return [...shotContent(r), { type: 'text', text: verifyLine }];
  },
  reference: async ({ path, page, images, doc }, { call, pick }) => {
    const r = await call('agent.reference', { docId: pick(doc), path, page, images });
    return [{ type: 'text', text: r.text }, ...(r.png ? [{ type: 'image' as const, data: r.png, mimeType: 'image/png' }] : [])];
  },
  compare: async ({ node, reference, page, scale, doc }, { call, pick }) => {
    const r = await call('agent.compare', { docId: pick(doc), node, reference, page, scale });
    const st = r.stats;
    const lines = [
      `${st.mismatch}% of pixels differ (mean channel difference ${st.meanDiff}). Design ${st.width}×${st.height}, reference ${st.width}×${st.refHeight}${Math.abs(st.height - st.refHeight) > 4 ? ` — heights differ by ${st.height - st.refHeight}px: content below the first gap is shifted` : ''}.`,
      st.regions.length ? 'Worst regions (fix top to bottom; later ones may only be shifted):' : 'No region differs by more than 2%.',
      ...st.regions.map((g) => `  y ${g.y0}–${g.y1}, x ${g.x0}–${g.x1}: ${g.mismatch}%${g.nodes?.length ? ` — ${g.nodes.join(', ')}` : ''}`),
      r.path ? `Heat map (full size, temporary): ${r.path}` : '',
    ].filter(Boolean);
    const out: Content[] = [{ type: 'text', text: lines.join('\n') }];
    const total = (r.slices?.length ?? 0) + (r.omitted ?? 0);
    if (r.slices?.length) r.slices.forEach((sl, i) => { out.push({ type: 'text', text: `Heat map ${i + 1}/${total}: y ${sl.y0}–${sl.y1}` }, { type: 'image', data: sl.data, mimeType: sl.mime }); });
    else if (r.png) out.push({ type: 'image', data: r.png, mimeType: 'image/png' });
    if (r.omitted) out.push({ type: 'text', text: `${r.omitted} more heat-map slice${r.omitted === 1 ? '' : 's'} are only in the full file (reply size limit).` });
    return out;
  },
  export_svg: async ({ node, doc }, { call, pick }) => text((await call('agent.exportSvg', { docId: pick(doc), node })).svg),
  remember: async ({ text: t, scope, name, replaces, doc }, { call, pick }) => {
    const m = await call('memory.remember', { docId: pick(doc), text: t, scope, name, replaces });
    return text(`Remembered [${m.id}] ${m.name}`);
  },
  forget: async ({ id, doc }, { call, pick }) => {
    const m = await call('memory.forget', { docId: pick(doc), id });
    return text(`Forgot [${m.id}] ${m.name}`);
  },
  recall: async ({ doc }, { call, pick }) => {
    const list = await call('memory.list', { docId: pick(doc) });
    return text(list.length ? list.map((m) => `[${m.id}] ${m.text}`).join('\n') : 'Nothing remembered yet.');
  },
  done: async ({ summary, doc }, { call, pick }) => {
    await call('agent.done', { docId: pick(doc), summary });
    return text('Done — your cursor is put away. Now reply to the person with a 2-3 line summary.');
  },
  // Orchestrate mode (blueprint AGENT_BRIDGE/06): only a lead thread may use these; others get an error.
  delegate: async ({ tasks }, { call }) => {
    const r = await call('orchestra.delegate', { tasks });
    return text(`Started ${r.workers.length} worker${r.workers.length === 1 ? '' : 's'}:\n${r.workers.map((w) => `- ${w.persona} (${w.agent}) — ${w.title} [${w.threadId}]`).join('\n')}\nCall wait_workers to collect their reports.`);
  },
  wait_workers: async (args, { call }) => {
    const r = await call('orchestra.wait', args);
    const lines = r.workers.map((w) => `## ${w.persona} — ${w.title} (${w.status})\n${w.reply || '(no reply yet)'}`);
    return text(`${r.timedOut ? 'Timed out — some workers are still working; call wait_workers again.\n\n' : ''}${lines.join('\n\n') || 'No workers yet.'}`);
  },
  tell_worker: async (args, { call }) => {
    const r = await call('orchestra.tell', args);
    return text(r.queued ? 'Queued — it runs when the worker finishes its current turn.' : 'Sent.');
  },
  browser: async (args, { call }) => {
    const r = await call('agent.browser', args);
    return r.png ? [{ type: 'image', data: r.png, mimeType: 'image/png' }, { type: 'text', text: r.text }] : text(r.text);
  },
  place_image: async ({ doc, ...args }, { call, pick }) => formatExecute(await call('agent.placeImage', { docId: pick(doc), ...args })),
};

const verifyLine = 'Check: nothing broken, collapsed, clipped or overflowing; spacing and alignment even; contrast readable; matches what you intended.';


/** A screenshot as MCP content: the inline image plus where the full-size file is. */
function shotContent(s: Shot): Content[] {
  const out: Content[] = [];
  if (s.slices?.length) {
    const total = s.slices.length + (s.omitted ?? 0);
    s.slices.forEach((sl, i) => {
      out.push({ type: 'text', text: `Slice ${i + 1}/${total} of "${s.name}": y ${sl.y0}–${sl.y1}` });
      out.push({ type: 'image', data: sl.data, mimeType: sl.mime });
    });
    if (s.omitted) out.push({ type: 'text', text: `${s.omitted} more slice${s.omitted === 1 ? '' : 's'} left out to keep this reply small — screenshot a lower part of the page, or open the full file below.` });
  }
  if (s.png) out.push({ type: 'image', data: s.png, mimeType: 'image/png' });
  if (s.path) {
    const size = s.width && s.height ? `${s.width}×${s.height}` : 'full size';
    out.push({ type: 'text', text: s.preview ? `Preview above; the full ${size} PNG is at ${s.path} (temporary).` : `Full ${size} PNG: ${s.path} (temporary).` });
  }
  return out;
}

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
    if (s.png || s.path || s.slices) out.push(...shotContent(s));
    else out.push({ type: 'text', text: s.unchanged ? `Screenshot "${s.name}": unchanged since your last screenshot.` : `Screenshot "${s.name}" failed: ${s.error}` });
  }
  if (r.screenshots.some((s) => s.png)) out.push({ type: 'text', text: verifyLine });
  if (r.issues.length) {
    out.push({ type: 'text', text: ['Issues detected:', ...r.issues.map((i) => `  [${i.rule}] ${i.nodeName} "${i.nodeId}": ${i.message} → ${i.remedy}`), 'Resolve these in your next call.'].join('\n') });
  }
  return out;
}

/**
 * agy hands MCP tools to Gemini as function declarations, and Gemini refuses the whole request over one
 * keyword outside its schema subset ($schema, additionalProperties, exclusiveMinimum, …). The tool list
 * leaves this server already inside it; inputs are still checked against the full zod shapes.
 */
function geminiTools(transport: StdioServerTransport) {
  const send = transport.send.bind(transport);
  transport.send = (message) => {
    const tools = (message as { result?: { tools?: unknown } }).result?.tools;
    if (Array.isArray(tools)) for (const t of tools as { inputSchema?: unknown }[]) t.inputSchema = sanitizeGeminiSchema(t.inputSchema);
    return send(message);
  };
}
