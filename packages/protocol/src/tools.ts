import { z } from 'zod';
import { EXECUTE_API_DOC } from './agent-docs';
import { BROWSER_TOOL_DOC, browserInputShape, PLACE_IMAGE_DOC, placeImageInputShape } from './browser';
import { GUIDE_INDEX } from './design-guides';
import type { MethodName } from './rpc';

/* ----------------------------------------------------------------------------
 * Agent (MCP) tool registry — single source for `archa mcp` (name, description, zod input),
 * the tools a Claude run may call (MCP_TOOLS), the tool list in agy's prompt and the chat line
 * of each call. Blueprint MCP/01 → Tool List. A tool with `rpc` relays to that core method;
 * `archa mcp` passes `doc` on as `docId`.
 * ------------------------------------------------------------------------- */

export type ToolDef = {
  description: string;
  input: z.ZodRawShape;
  /** Core method it relays to; none = answered inside `archa mcp`, or relayed by its own handler there. */
  rpc?: MethodName;
  /** Its entry in agy's tool list ("name { args } (what for)"); none = left out of that list. */
  agy?: string;
  /** Chat line for a call; default: the tool name. Input is whatever the agent sent (unchecked). */
  summary?: (i: Record<string, unknown>) => string;
};

const docParam = z.string().optional().describe('Document to act on: its id, its .archa path, or its name (get_state lists the open ones). Default: the active document.');
const s = (v: unknown) => String(v ?? '');

/** The line of a snippet worth showing in its summary: its leading comment, else its first statement. */
function codeHint(code: string): string {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean);
  const comment = lines.find((l) => l.startsWith('//'));
  const hint = (comment ? comment.replace(/^\/\/+\s*/, '') : lines[0] ?? '').replace(/\s+/g, ' ');
  return hint.length > 60 ? `${hint.slice(0, 57)}…` : hint;
}

const tool = <S extends z.ZodRawShape>(t: Omit<ToolDef, 'input'> & { input: S }) => t;

/** In the order `archa mcp` lists them. */
export const TOOLS = {
  get_state: tool({
    description: 'Overview of an open ArchaDev document: page root id, selection, top-level frames with ids and sizes, and the other open documents. Call first.',
    input: { doc: docParam }, rpc: 'agent.state', agy: 'get_state {}',
    summary: () => 'get_state · read the canvas',
  }),
  list_documents: tool({
    description: 'Every document open in ArchaDev: id, name, .archa path, its <name>-data/ folder, unsaved changes. Pass an id, path or name as `doc` to any tool.',
    input: {}, rpc: 'workspace.list', agy: 'list_documents {}',
  }),
  open_document: tool({
    description: 'Open a .archa file in ArchaDev (or get the id of it when it is already open). Returns the document id to pass as `doc`.',
    input: { path: z.string().describe('Absolute path of the .archa file') }, rpc: 'doc.open', agy: 'open_document { path }',
  }),
  new_document: tool({
    description: 'Create an empty document. Save it with save_document to give it a file and its <name>-data/ folder.',
    input: { name: z.string().max(200).optional() }, rpc: 'doc.new', agy: 'new_document { name? }',
  }),
  save_document: tool({
    description: 'Save a document to its .archa file, or to `path` (Save As: the data folder is copied to <new name>-data/).',
    input: { doc: docParam, path: z.string().optional().describe('Absolute .archa path; required the first time') }, rpc: 'doc.save', agy: 'save_document { path? }',
  }),
  execute: tool({
    description: EXECUTE_API_DOC,
    input: {
      code: z.string().optional().describe('JavaScript snippet'),
      editId: z.string().optional().describe('editId from a failed call, to patch it'),
      edits: z.array(z.object({ find: z.string(), replace: z.string() })).optional(),
      doc: docParam,
    },
    rpc: 'agent.execute', agy: 'execute { code } or { editId, edits }',
    summary: (i) => {
      if (typeof i.code === 'string') {
        const n = i.code.split('\n').length;
        const hint = codeHint(i.code);
        return `execute · ${hint ? `${hint} · ` : ''}${n} ${n === 1 ? 'line' : 'lines'}`;
      }
      return i.editId ? `execute · patch ${s(i.editId)}` : 'execute';
    },
  }),
  // Same as execute's svg(): the markup goes in as a tool argument, so the agent never escapes it inside JS.
  place_svg: tool({
    description: 'Place SVG markup you wrote (logo, illustration, chart, icon, pattern) on the canvas as a drawing — never as text. Shapes become editable vector layers; gradients, text, filters or masks make it an exact image instead (the reply says which). Replies like execute (ids, screenshot, issues).',
    input: {
      svg: z.string().describe('Complete SVG markup: <svg viewBox="…">…</svg>'),
      parent: z.string().optional().describe('Frame id or unique name to place it in; default the page (an empty spot)'),
      x: z.number().optional(), y: z.number().optional(),
      width: z.number().optional().describe('Size on the canvas; one side alone keeps the aspect ratio'),
      height: z.number().optional(),
      name: z.string().optional().describe('Layer name'),
      mode: z.enum(['auto', 'vector', 'image']).optional().describe('auto (default) | vector (fail if not editable) | image'),
      doc: docParam,
    },
    rpc: 'agent.execute', agy: 'place_svg { svg, parent?, x?, y?, width?, height?, name?, mode? }',
    summary: (i) => `place_svg · ${s(i.name ?? (typeof i.svg === 'string' ? `${i.svg.length} chars` : ''))}`,
  }),
  inspect: tool({
    description: 'Compact outline of layers as the design panel shows them: type, size, sizing, auto layout (gap/padding/align/justify), fills, strokes, effects, text and context notes people left on layers. No node = the current selection (else the page). Cheaper than get() for reading an existing design before editing it.',
    input: { node: z.string().optional().describe('Node id or unique name'), depth: z.number().int().min(0).max(12).optional().describe('Levels of children (default 3)'), doc: docParam },
    rpc: 'agent.outline', agy: 'inspect { node?, depth? }',
    summary: (i) => `inspect · ${i.node ? s(i.node) : 'whole page'}${i.depth !== undefined ? ` · depth ${s(i.depth)}` : ''}`,
  }),
  // ArchaDev's internal skill: short design guides, answered locally (no app round-trip).
  read_guide: tool({
    description: `Built-in ArchaDev design guide for a topic. Read the one that fits the task before designing. Topics:
${GUIDE_INDEX}`,
    input: { topic: z.string().describe('Topic name from the list') }, agy: 'read_guide { topic }',
    summary: (i) => `read_guide · ${s(i.topic)}`,
  }),
  read_skill: tool({
    description: 'Read a skill: its SKILL.md plus the list of files in its folder, or one of those files (references, examples, templates) with `file`. Works for this document\'s own skills, the ArchaDev library and the built-in ones. Use it whenever a skill fits the task or a SKILL.md points at one of its files — you have no other way to open them.',
    input: {
      name: z.string().min(1).max(120).describe('Skill name, e.g. "design-website"'),
      file: z.string().max(400).optional().describe('Path inside the skill folder, e.g. "references/tokens.md"'),
      doc: docParam,
    },
    rpc: 'agent.readSkill', agy: 'read_skill { name, file? } (a skill\'s SKILL.md and file list, or one of its files — the only way to read skills)',
    summary: (i) => `read_skill · ${s(i.name)}${i.file ? ` · ${s(i.file)}` : ''}`,
  }),
  screenshot: tool({
    description: 'PNG of a node (id or unique name) at full size — no size cap; the file is also saved to a temporary path you can open. A tall node (a whole landing page) comes back as full-width slices labelled with their y range, so text stays readable; slices: false forces one image, true forces slices. Says "unchanged" if it did not change since your last screenshot of it.',
    input: { node: z.string(), scale: z.number().min(0.1).max(4).optional(), slices: z.boolean().optional(), doc: docParam },
    rpc: 'agent.screenshot', agy: 'screenshot { node }',
    summary: (i) => `screenshot · ${s(i.node)}`,
  }),
  reference: tool({
    description: 'Read a reference (a PDF page or an image mockup) into numbers before rebuilding it: page size, fill palette, type scale, every text line with x/y/size/colour, rects and rounded rects with radius, and every placed image — already copied into this document\'s asset folder, ready for image(). The full data (with SVG paths) is written to <name>-data/reference/*.json. Follow read_guide("rebuild").',
    input: {
      path: z.string().describe('Absolute path of a .pdf, .png, .jpg or .webp'),
      page: z.number().int().min(1).optional().describe('PDF page, 1-based (default 1)'),
      images: z.boolean().optional().describe('Also return the page raster inline'),
      doc: docParam,
    },
    rpc: 'agent.reference', agy: 'reference { path, page? } (read a PDF/image mockup into numbers)',
  }),
  compare: tool({
    description: 'Visual diff of a node against a reference image or PDF page (fitted to the node width): % of pixels that differ, the worst regions with their y range and the nodes under them, and a heat map (reference faded, differences red) — sliced when tall. Use it after building to find what to fix.',
    input: {
      node: z.string().describe('Node id or unique name, e.g. the landing page frame'),
      reference: z.string().describe('Absolute path of the .pdf / .png / .jpg / .webp'),
      page: z.number().int().min(1).optional(),
      scale: z.number().min(0.1).max(4).optional().describe('Render scale for the diff (default 1)'),
      doc: docParam,
    },
    rpc: 'agent.compare', agy: 'compare { node, reference, page? } (visual diff against it)',
  }),
  export_svg: tool({
    description: 'SVG markup of a node and its subtree.',
    input: { node: z.string(), doc: docParam }, rpc: 'agent.exportSvg', agy: 'export_svg { node }',
    summary: (i) => `export_svg · ${s(i.node)}`,
  }),
  say: tool({
    description: 'One-line progress note shown in the ArchaDev activity feed (optionally pointing at a node).',
    input: { text: z.string().max(300), nodeId: z.string().optional(), doc: docParam }, rpc: 'agent.say', agy: 'say { text }',
    summary: (i) => s(i.text),
  }),
  // Memory (blueprint AGENT_BRIDGE/07): facts that ride along with the first message of every later chat.
  remember: tool({
    description: 'Keep one fact for later chats: a preference or correction the person gave ("no labels above headings", "always 8px radius"), a brand rule, or a lesson from a mistake. scope "global" = every document, "document" = this design only. One short, self-contained sentence or two; pass `replaces` (an id from the Memory list) to rewrite a fact instead of adding a near-duplicate. Do not store the task itself or anything already in the design.',
    input: {
      text: z.string().min(1).max(4000),
      scope: z.enum(['global', 'document']).describe('global: every document · document: this design only'),
      name: z.string().max(80).optional().describe('Short title (default: first sentence)'),
      replaces: z.string().max(200).optional().describe('Id of the fact this one rewrites, e.g. "global:no-eyebrow-labels"'),
      doc: docParam,
    },
    rpc: 'memory.remember', agy: 'remember { text, scope: "global"|"document", replaces? } (keep a preference, correction or lesson for later chats)',
  }),
  forget: tool({
    description: 'Remove a remembered fact that is wrong or no longer wanted (id from the Memory list or recall).',
    input: { id: z.string().min(1).max(200), doc: docParam }, rpc: 'memory.forget', agy: 'forget { id }',
  }),
  recall: tool({
    description: 'Every remembered fact (global and this document\'s), newest first. The newest ones already came with your first message; call this only to see older ones.',
    input: { doc: docParam }, rpc: 'memory.list', agy: 'recall {}',
  }),
  done: tool({
    description: 'Call once when you have finished the request (after your last canvas change): your cursor on the canvas stops and disappears. Optional one-line summary for the activity feed.',
    input: { summary: z.string().max(300).optional(), doc: docParam },
    rpc: 'agent.done', agy: 'done { summary? } (call once when finished — it puts your canvas cursor away)',
    summary: (i) => `done${i.summary ? ` · ${s(i.summary)}` : ''}`,
  }),
  // Orchestrate mode (blueprint AGENT_BRIDGE/06): only a lead thread may use these; others get an error.
  // Not in agy's list: the orchestrate brief (ORCHESTRATOR_PROMPT) names them for a lead.
  delegate: tool({
    description: 'Orchestrate mode only: start one worker agent per task, in parallel on this canvas. Returns their names.',
    input: {
      tasks: z.array(z.object({
        title: z.string().describe('Short task name'),
        prompt: z.string().describe('Self-contained brief: the worker does not see your conversation'),
        kind: z.string().optional().describe('research | design | copy | review | …'),
        agent: z.enum(['claude', 'agy', 'codex']).optional().describe('Default: your own agent'),
        model: z.string().optional(),
        frame: z.string().optional().describe('Id of the frame the worker builds inside'),
      })).min(1).max(8),
    },
    rpc: 'orchestra.delegate',
    summary: (i) => (Array.isArray(i.tasks) ? `delegate · ${(i.tasks as Array<{ title?: unknown }>).map((t) => s(t.title)).join(' · ')}` : 'delegate'),
  }),
  wait_workers: tool({
    description: 'Orchestrate mode only: wait until your workers finish (or the timeout) and get their reports. Call again while some are still working.',
    input: {
      workers: z.array(z.string()).optional().describe('Names or thread ids; default all'),
      timeoutSec: z.number().min(5).max(600).optional().describe('Default 240'),
    },
    rpc: 'orchestra.wait', summary: () => 'waiting for the team',
  }),
  tell_worker: tool({
    description: 'Orchestrate mode only: send a follow-up message to one of your workers (queued if it is still working).',
    input: { worker: z.string().describe('Worker name or thread id'), message: z.string() },
    rpc: 'orchestra.tell', summary: (i) => `tell ${s(i.worker)} · ${s(i.message).slice(0, 80)}`,
  }),
  browser: tool({
    description: BROWSER_TOOL_DOC,
    input: browserInputShape, rpc: 'agent.browser',
    agy: 'browser { action, … } (the built-in web browser: search, open, screenshot, images, download)',
    summary: (i) => `browser · ${s(i.action)}${i.query ? ` "${s(i.query)}"` : i.url ? ` ${s(i.url).slice(0, 120)}` : i.ref ? ` ${s(i.ref)}` : ''}`,
  }),
  place_image: tool({
    description: PLACE_IMAGE_DOC,
    input: { ...placeImageInputShape, doc: docParam }, rpc: 'agent.placeImage',
    agy: 'place_image { url | ref, parent? | fillOf?, x?, y?, width?, height?, fit? } (a real photo or logo onto the canvas; fillOf puts it into a frame\'s fills as a background)',
    summary: (i) => `place_image · ${s(i.name ?? (i.url ? s(i.url).slice(0, 120) : i.ref ?? i.selector ?? ''))}`,
  }),
};

export type ToolName = keyof typeof TOOLS;
export type ToolArgs<N extends ToolName> = z.output<z.ZodObject<(typeof TOOLS)[N]['input']>>;
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

/** The one-line chat summary of a tool call (`mcp__archadev__` prefix allowed). */
export function toolSummary(name: string, input: unknown): string {
  const short = name.replace(/^mcp__archadev__/, '');
  const t = Object.hasOwn(TOOLS, short) ? (TOOLS[short as ToolName] as ToolDef) : undefined;
  return t?.summary ? t.summary((input ?? {}) as Record<string, unknown>) : short;
}

/** agy's tool list: each tool's `agy` entry, in registry order. */
export const agyToolList = () => TOOL_NAMES.map((n) => (TOOLS[n] as ToolDef).agy).filter(Boolean).join(', ');
