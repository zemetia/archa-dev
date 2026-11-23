import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BROWSER_TOOL_DOC, browserInputShape, EXECUTE_API_DOC, PLACE_IMAGE_DOC, placeImageInputShape, GUIDE_INDEX, guideText, type ExecuteResult, type RpcClient, type Shot } from '@archa/protocol';
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
  // Every document tool also takes `doc`, which wins over both (blueprint MCP/01 → Tool List).
  const defaultDoc = opts.doc ?? process.env.ARCHA_DOC_ID;
  const pick = (doc?: string) => doc || defaultDoc;

  const server = new McpServer({ name: 'archadev', version: '1.5.0' });
  const guard = async (fn: (c: RpcClient) => Promise<Content[]>) => {
    try {
      return { content: await fn(await getCore()) };
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `ERROR: ${(e as Error).message}` }], isError: true };
    }
  };

  server.registerTool('get_state', {
    description: 'Overview of an open ArchaDev document: page root id, selection, top-level frames with ids and sizes, and the other open documents. Call first.',
    inputSchema: { doc: docParam },
  }, ({ doc }) => guard(async (c) => [{ type: 'text', text: await c.call('agent.state', { docId: pick(doc) }) }]));

  server.registerTool('list_documents', {
    description: 'Every document open in ArchaDev: id, name, .archa path, its asset folder, unsaved changes. Pass an id, path or name as `doc` to any tool.',
    inputSchema: {},
  }, () => guard(async (c) => {
    const docs = await c.call('workspace.list');
    return [{ type: 'text', text: docs.length ? docs.map((d) => `${d.name} (${d.id})${d.dirty ? ' · unsaved changes' : ''}\n  file: ${d.filePath ?? '(not saved yet)'}\n  assets: ${d.assetDir}`).join('\n') : 'No documents are open.' }];
  }));

  server.registerTool('open_document', {
    description: 'Open a .archa file in ArchaDev (or get the id of it when it is already open). Returns the document id to pass as `doc`.',
    inputSchema: { path: z.string().describe('Absolute path of the .archa file') },
  }, ({ path }) => guard(async (c) => {
    const { docId } = await c.call('doc.open', { path: path.replace(/\\/g, '/') });
    return [{ type: 'text', text: `Opened ${path} → doc "${docId}"` }];
  }));

  server.registerTool('new_document', {
    description: 'Create an empty document. Save it with save_document to give it a file and its <name>-asset/ folder.',
    inputSchema: { name: z.string().max(200).optional() },
  }, ({ name }) => guard(async (c) => {
    const { docId } = await c.call('doc.new', { name });
    return [{ type: 'text', text: `New document "${name ?? 'Untitled'}" → doc "${docId}"` }];
  }));

  server.registerTool('save_document', {
    description: 'Save a document to its .archa file, or to `path` (Save As: the asset folder is copied to <new name>-asset/).',
    inputSchema: { doc: docParam, path: z.string().optional().describe('Absolute .archa path; required the first time') },
  }, ({ doc, path }) => guard(async (c) => {
    const docId = pick(doc);
    if (!docId && !path) throw new Error('Pass `doc` (or rely on the active document) and, for a new document, `path`.');
    const r = await c.call('doc.save', { docId: docId ?? '', ...(path ? { path: path.replace(/\\/g, '/') } : {}) });
    return [{ type: 'text', text: `Saved → ${r.path}` }];
  }));

  server.registerTool('execute', {
    description: EXECUTE_API_DOC,
    inputSchema: {
      code: z.string().optional().describe('JavaScript snippet'),
      editId: z.string().optional().describe('editId from a failed call, to patch it'),
      edits: z.array(z.object({ find: z.string(), replace: z.string() })).optional(),
      doc: docParam,
    },
  }, ({ doc, ...args }) => guard(async (c) => formatExecute(await c.call('agent.execute', { docId: pick(doc), ...args }))));

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
      doc: docParam,
    },
  }, ({ svg, parent, doc, ...opts }) => guard(async (c) => formatExecute(await c.call('agent.execute', { docId: pick(doc), code: `svg(${JSON.stringify(svg)}, ${JSON.stringify(parent ?? null)}, ${JSON.stringify(opts)})` }))));

  server.registerTool('inspect', {
    description: 'Compact outline of layers as the design panel shows them: type, size, sizing, auto layout (gap/padding/align/justify), fills, strokes, effects, text and context notes people left on layers. No node = the current selection (else the page). Cheaper than get() for reading an existing design before editing it.',
    inputSchema: { node: z.string().optional().describe('Node id or unique name'), depth: z.number().int().min(0).max(12).optional().describe('Levels of children (default 3)'), doc: docParam },
  }, ({ node, depth, doc }) => guard(async (c) => [{ type: 'text', text: await c.call('agent.outline', { docId: pick(doc), node, depth }) }]));

  // ArchaDev's internal skill: short design guides, answered locally (no app round-trip).
  server.registerTool('read_guide', {
    description: `Built-in ArchaDev design guide for a topic. Read the one that fits the task before designing. Topics:
${GUIDE_INDEX}`,
    inputSchema: { topic: z.string().describe('Topic name from the list') },
  }, async ({ topic }) => ({ content: [{ type: 'text' as const, text: guideText(topic) }] }));

  server.registerTool('screenshot', {
    description: 'PNG of a node (id or unique name) at full size — no size cap; the file is also saved to a temporary path you can open. A tall node (a whole landing page) comes back as full-width slices labelled with their y range, so text stays readable; slices: false forces one image, true forces slices. Says "unchanged" if it did not change since your last screenshot of it.',
    inputSchema: { node: z.string(), scale: z.number().min(0.1).max(4).optional(), slices: z.boolean().optional(), doc: docParam },
  }, ({ node, scale, slices, doc }) => guard(async (c) => {
    const r = await c.call('agent.screenshot', { docId: pick(doc), node, scale, slices });
    if (r.unchanged) return [{ type: 'text', text: `"${r.name}" is unchanged since your last screenshot.` }];
    return [...shotContent(r), { type: 'text', text: verifyLine }];
  }));

  server.registerTool('reference', {
    description: 'Read a reference (a PDF page or an image mockup) into numbers before rebuilding it: page size, fill palette, type scale, every text line with x/y/size/colour, rects and rounded rects with radius, and every placed image — already copied into this document\'s asset folder, ready for image(). The full data (with SVG paths) is written to <name>-asset/reference/*.json. Follow read_guide("rebuild").',
    inputSchema: {
      path: z.string().describe('Absolute path of a .pdf, .png, .jpg or .webp'),
      page: z.number().int().min(1).optional().describe('PDF page, 1-based (default 1)'),
      images: z.boolean().optional().describe('Also return the page raster inline'),
      doc: docParam,
    },
  }, ({ path, page, images, doc }) => guard(async (c) => {
    const r = await c.call('agent.reference', { docId: pick(doc), path, page, images });
    return [{ type: 'text', text: r.text }, ...(r.png ? [{ type: 'image' as const, data: r.png, mimeType: 'image/png' }] : [])];
  }));

  server.registerTool('compare', {
    description: 'Visual diff of a node against a reference image or PDF page (fitted to the node width): % of pixels that differ, the worst regions with their y range and the nodes under them, and a heat map (reference faded, differences red) — sliced when tall. Use it after building to find what to fix.',
    inputSchema: {
      node: z.string().describe('Node id or unique name, e.g. the landing page frame'),
      reference: z.string().describe('Absolute path of the .pdf / .png / .jpg / .webp'),
      page: z.number().int().min(1).optional(),
      scale: z.number().min(0.1).max(4).optional().describe('Render scale for the diff (default 1)'),
      doc: docParam,
    },
  }, ({ node, reference, page, scale, doc }) => guard(async (c) => {
    const r = await c.call('agent.compare', { docId: pick(doc), node, reference, page, scale });
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
  }));

  server.registerTool('export_svg', {
    description: 'SVG markup of a node and its subtree.',
    inputSchema: { node: z.string(), doc: docParam },
  }, ({ node, doc }) => guard(async (c) => [{ type: 'text', text: (await c.call('agent.exportSvg', { docId: pick(doc), node })).svg }]));

  server.registerTool('say', {
    description: 'One-line progress note shown in the ArchaDev activity feed (optionally pointing at a node).',
    inputSchema: { text: z.string().max(300), nodeId: z.string().optional(), doc: docParam },
  }, ({ text, nodeId, doc }) => guard(async (c) => {
    await c.call('agent.say', { docId: pick(doc), text, nodeId });
    return [{ type: 'text', text: 'ok' }];
  }));

  server.registerTool('done', {
    description: 'Call once when you have finished the request (after your last canvas change): your cursor on the canvas stops and disappears. Optional one-line summary for the activity feed.',
    inputSchema: { summary: z.string().max(300).optional(), doc: docParam },
  }, ({ summary, doc }) => guard(async (c) => {
    await c.call('agent.done', { docId: pick(doc), summary });
    return [{ type: 'text', text: 'Done — your cursor is put away. Now reply to the person with a 2-3 line summary.' }];
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

  server.registerTool('place_image', {
    description: PLACE_IMAGE_DOC,
    inputSchema: { ...placeImageInputShape, doc: docParam },
  }, ({ doc, ...args }) => guard(async (c) => formatExecute(await c.call('agent.placeImage', { docId: pick(doc), ...args }))));

  await server.connect(new StdioServerTransport());
}

const verifyLine = 'Check: nothing broken, collapsed, clipped or overflowing; spacing and alignment even; contrast readable; matches what you intended.';

const docParam = z.string().optional().describe('Document to act on: its id, its .archa path, or its name (get_state lists the open ones). Default: the active document.');

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
