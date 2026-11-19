import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSWASMModule } from 'quickjs-emscripten';
import {
  applyOps, DocumentError, findEmptySpace, insertOpsFor, instanceOps, libraryInsertOps, instancesOf, lint, listComponents, makeComponentOps, normaliseInput, subtreeInput, syncInstanceOps,
  type ArchaDocument, type DocumentSession,
} from '@archa/core';
import { colorToHex, hexToColor, isContainer, newId, type Node, type NodeInput, type Op } from '@archa/schema';
import type { ExecuteResult, TrailAction, TrailStep } from '@archa/protocol';
import type { Connection, Workspace } from './workspace';

/*
 * `execute`: an agent's JS snippet runs in QuickJS against a copy of the document.
 * The whole snippet is one transaction (blueprint MCP/02). Reply shape follows MCP/03.
 */

let quickjs: Promise<QuickJSWASMModule> | null = null;

const PRELUDE = `
const __call = (name, args) => { const r = JSON.parse(__host(name, JSON.stringify(args))); if (r && r.__error) throw new Error(r.__error); return r; };
var insert = (parent, node, index) => __call('insert', [parent, node, index]);
var update = (ref, patch) => __call('update', [ref, patch]);
var move = (ref, parent, index) => __call('move', [ref, parent, index]);
var remove = (ref) => __call('remove', [ref]);
var get = (ref, opts) => __call('get', [ref, opts || {}]);
var children = (ref) => __call('children', [ref]);
var getPage = () => __call('page', []);
var getSelection = () => __call('selection', []);
var findEmptySpace = (width, height) => __call('space', [width, height]);
var screenshot = (ref, opts) => __call('screenshot', [ref, opts || {}]);
var components = () => __call('components', []);
var makeComponent = (ref, description) => __call('makeComponent', [ref, description || '']);
var instance = (component, parent, opts) => __call('instance', [component, parent, opts || {}]);
var syncInstances = (component) => __call('syncInstances', [component]);
var copy = (ref, parent, opts) => __call('copy', [ref, parent, opts || {}]);
var fromLibrary = (ref, parent, opts) => __call('fromLibrary', [ref, parent, opts || {}]);
var variables = () => __call('variables', []);
var setVariable = (name, value) => __call('setVariable', [name, value]);
var resolveComment = (id) => __call('resolveComment', [id]);
var print = (...v) => __call('print', [v.map((x) => typeof x === 'string' ? x : JSON.stringify(x))]);
var find = (visitor, opts) => {
  if (!opts || !opts.under) throw new Error('find() needs { under: <frame id or name> } — use get_state for the page overview');
  const out = []; const limit = opts.limit || 500;
  const walk = (id) => { if (out.length >= limit) return; const n = get(id); const r = visitor(n); if (r === true) out.push(n); if (r !== 'skip' && n.children) for (const c of n.children) walk(c); };
  walk(get(opts.under).id); return out;
};
`;

type Pending = { code: string; createdAt: number };

export class AgentExecutor {
  private ctx: QuickJSContext | null = null;
  private failed = new Map<string, Pending>();
  private state = { working: null as ArchaDocument | null, ops: [] as Op[], created: [] as Array<{ name: string; id: string }>, changed: new Map<string, string>(), output: [] as string[], shots: [] as Array<{ id: string; scale: number }>, pageRoot: '', selection: [] as string[], steps: [] as TrailStep[] };

  constructor(private ws: Workspace, private conn: Connection) {}

  private async context(): Promise<QuickJSContext> {
    if (this.ctx) return this.ctx;
    const QuickJS = await (quickjs ??= getQuickJS());
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(64 * 1024 * 1024);
    runtime.setMaxStackSize(1024 * 1024);
    const ctx = runtime.newContext();
    const host = ctx.newFunction('__host', (nameH, argsH) => {
      const name = ctx.getString(nameH);
      const args = JSON.parse(ctx.getString(argsH)) as unknown[];
      try {
        return ctx.newString(JSON.stringify(this.hostCall(name, args) ?? null));
      } catch (e) {
        return ctx.newString(JSON.stringify({ __error: (e as Error).message }));
      }
    });
    ctx.setProp(ctx.global, '__host', host);
    host.dispose();
    ctx.unwrapResult(ctx.evalCode(PRELUDE, 'prelude.js')).dispose();
    this.ctx = ctx;
    return ctx;
  }

  async run(session: DocumentSession, params: { code?: string; editId?: string; edits?: Array<{ find: string; replace: string }> }): Promise<ExecuteResult> {
    let code = params.code;
    let editId = params.editId;
    if (editId) {
      const prev = this.failed.get(editId);
      if (!prev) return { ok: false, revision: session.revision, reason: `Unknown or expired editId "${editId}". Resend the full snippet.`, editId: newId(6) };
      code = prev.code;
      for (const [i, e] of (params.edits ?? []).entries()) {
        if (!code.includes(e.find)) return { ok: false, revision: session.revision, reason: `edits[${i}].find not found in the snippet: ${JSON.stringify(e.find.slice(0, 80))}`, editId };
        code = code.replace(e.find, e.replace);
      }
    }
    if (!code?.trim()) return { ok: false, revision: session.revision, reason: 'Pass `code` (a JS snippet) or `editId` + `edits`.', editId: newId(6) };

    const ctx = await this.context();
    const page = session.doc.pages[0]!;
    this.state = { working: session.doc.clone(), ops: [], created: [], changed: new Map(), output: [], shots: [], pageRoot: page.rootId, selection: this.ws.selection.get(session.id) ?? [], steps: [] };
    ctx.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + 5000));
    const result = ctx.evalCode(code, 'snippet.js');

    if (result.error) {
      const err = ctx.dump(result.error) as { message?: string; stack?: string } | string;
      result.error.dispose();
      const raw = typeof err === 'string' ? err : err.message ?? String(err);
      // const/let names persist between calls (globals carry over), so reusing one is the commonest agent slip.
      const message = /^redeclaration of '([^']+)'/.test(raw)
        ? `${raw} — "${/'([^']+)'/.exec(raw)![1]}" already exists from an earlier call. Reuse it (it still holds that node), or pick a new name.`
        : raw;
      const line = typeof err === 'object' ? /snippet\.js:(\d+)/.exec(err.stack ?? '')?.[1] : undefined;
      const id = editId ?? newId(6);
      this.failed.set(id, { code, createdAt: Date.now() });
      this.trimFailed();
      return { ok: false, revision: session.revision, statement: line ? code.split('\n')[Number(line) - 1]?.trim() : undefined, reason: message, editId: id };
    }
    result.value.dispose();
    if (editId) this.failed.delete(editId);

    let revision = session.revision;
    const touched = new Set<string>([...this.state.created.map((c) => c.id), ...this.state.changed.keys()]);
    if (this.state.ops.length) {
      try {
        revision = session.apply({ author: this.conn.author, label: `Agent: ${summarise(this.state.created, this.state.changed)}`, baseRevision: session.revision, ops: this.state.ops }).revision;
      } catch (e) {
        const id = newId(6);
        this.failed.set(id, { code, createdAt: Date.now() });
        return { ok: false, revision: session.revision, reason: (e as Error).message, editId: id };
      }
      this.ws.log(session.id, this.conn.author, 'execute', summarise(this.state.created, this.state.changed), [...touched].filter((id) => session.doc.get(id)), this.conn.client.runId);
    }
    this.ws.trail(this.conn, session.id, finishTrail(session.doc, this.state.steps));

    const screenshots: Extract<ExecuteResult, { ok: true }>['screenshots'] = [];
    for (const s of this.state.shots) {
      if (!session.doc.get(s.id)) continue;
      screenshots.push(await this.ws.screenshot(this.conn, session.id, s.id, s.scale));
    }
    const lintScope = [...touched].filter((id) => session.doc.get(id));
    return {
      ok: true,
      revision,
      created: this.state.created,
      changed: [...this.state.changed].map(([id, name]) => ({ id, name })).filter((c) => !this.state.created.some((x) => x.id === c.id)),
      output: this.state.output,
      screenshots,
      issues: lint(session.doc, lintScope).slice(0, 30),
    };
  }

  private trimFailed() {
    const keys = [...this.failed.keys()];
    for (const k of keys.slice(0, Math.max(0, keys.length - 20))) this.failed.delete(k);
  }

  private hostCall(name: string, args: unknown[]): unknown {
    const st = this.state;
    const doc = st.working!;
    const ref = (r: unknown) => resolveIn(doc, String(r));
    const commit = (ops: Op[]) => { applyOps(doc, ops); st.ops.push(...ops); };
    // Trail (AGENT_BRIDGE/03 → Sessions): where this call worked, in order, for the session cursor.
    const step = (action: TrailAction, id: string) => {
      if (id === st.pageRoot || st.steps.length >= 400) return;
      const last = st.steps.at(-1);
      if (last?.nodeId === id && last.action === action) return;
      const n = doc.get(id);
      if (n) st.steps.push({ action, nodeId: id, name: n.name, bounds: doc.worldBounds(id) });
    };
    switch (name) {
      case 'insert': {
        const [parent, input, index] = args as [string | undefined, NodeInput, number | undefined];
        if (!input || typeof input !== 'object' || !input.type) throw new Error('insert(parent, node): node needs a type ("frame" | "rect" | "ellipse" | "polygon" | "path" | "text" | "image" | "sticky" | "embed" | "group")');
        const parentId = parent ? ref(parent) : st.pageRoot;
        const { ops, rootId, created } = insertOpsFor(input, parentId, index ?? undefined);
        commit(ops);
        st.created.push(...created);
        step('create', rootId);
        return rootId;
      }
      case 'update': {
        const [r, patch] = args as [string, Record<string, unknown>];
        const id = ref(r);
        const norm = normaliseInput({ ...patch, type: doc.require(id).type });
        delete norm.type;
        if (!('name' in patch)) delete norm.name;
        commit([{ op: 'update', id, patch: norm }]);
        st.changed.set(id, doc.require(id).name);
        step('edit', id);
        return null;
      }
      case 'move': {
        const [r, parent, index] = args as [string, string, number | undefined];
        const id = ref(r);
        commit([{ op: 'move', id, parentId: ref(parent), ...(index === undefined || index === null ? {} : { index }) }]);
        st.changed.set(id, doc.require(id).name);
        step('move', id);
        return null;
      }
      case 'remove': {
        const id = ref(args[0]);
        const n = doc.require(id).name;
        step('delete', id);
        commit([{ op: 'delete', id }]);
        st.changed.set(id, n);
        return null;
      }
      case 'get': {
        const id = ref(args[0]);
        const depth = (args[1] as { depth?: number }).depth ?? 0;
        step('read', id);
        return view(doc, doc.require(id), depth);
      }
      case 'children': {
        const id = ref(args[0]);
        step('read', id);
        return doc.children(id).map((n) => view(doc, n, 0));
      }
      case 'page':
        return view(doc, doc.require(st.pageRoot), 0);
      case 'selection': {
        const ids = st.selection.filter((id) => doc.get(id));
        for (const id of ids.slice(0, 5)) step('focus', id);
        return ids;
      }
      case 'space':
        return findEmptySpace(doc, st.pageRoot, Number(args[0]) || 400, Number(args[1]) || 400);
      case 'screenshot': {
        const id = ref(args[0]);
        st.shots.push({ id, scale: (args[1] as { scale?: number }).scale ?? 1 });
        step('look', id);
        return null;
      }
      case 'components':
        return listComponents(doc);
      case 'makeComponent': {
        const id = ref(args[0]);
        commit(makeComponentOps(doc, id, String(args[1] ?? '')));
        st.changed.set(id, doc.require(id).name);
        step('edit', id);
        return id;
      }
      case 'instance': {
        const [c, parent, opts] = args as [string, string | null | undefined, { x?: number; y?: number; index?: number; name?: string }];
        const main = ref(c);
        const { ops, rootId, created } = instanceOps(doc, main, parent ? ref(parent) : st.pageRoot, opts ?? {});
        step('focus', main);
        commit(ops);
        st.created.push(...created.slice(0, 1));
        step('copy', rootId);
        return rootId;
      }
      case 'copy': {
        // Unlinked copy of any subtree; by default next to the source, after it in the same parent.
        const [r, parent, opts] = args as [string, string | null | undefined, { x?: number; y?: number; index?: number; name?: string }];
        const id = ref(r);
        const src = doc.require(id);
        const parentId = parent ? ref(parent) : src.parentId!;
        const target = doc.require(parentId);
        const input = subtreeInput(doc, id) as NodeInput & { x: number; y: number; name: string };
        if (opts?.name) input.name = opts.name;
        const inLayout = target.type === 'frame' && target.layout !== 'none';
        if (opts?.x !== undefined) input.x = opts.x;
        else if (!parent && !inLayout) input.x = src.x + (target.type === 'page' ? src.width + 40 : 16);
        if (opts?.y !== undefined) input.y = opts.y;
        else if (!parent && !inLayout) input.y = src.y + (target.type === 'page' ? 0 : 16);
        const index = opts?.index ?? (parentId === src.parentId && isContainer(target) ? target.children.indexOf(id) + 1 : undefined);
        const { ops, rootId, created } = insertOpsFor(input, parentId, index);
        step('focus', id);
        commit(ops);
        st.created.push(...created.slice(0, 1));
        step('copy', rootId);
        return rootId;
      }
      case 'fromLibrary': {
        const [r, parent, opts] = args as [string, string | null | undefined, { x?: number; y?: number; index?: number }];
        const [library, id] = String(r).split(':');
        const item = library && id ? this.ws.library.read(library, id) : null;
        if (!item) throw new Error(`No library component "${String(r)}" — use a ref from the Library list ("library:id")`);
        const parentId = parent ? ref(parent) : st.pageRoot;
        const at = opts?.x === undefined || opts?.y === undefined ? { ...findEmptySpace(doc, parentId, item.width, item.height), index: opts?.index } : opts;
        const res = libraryInsertOps(doc, `${library}:${id}`, item, parentId, at);
        commit(res.ops);
        st.created.push(...res.created.slice(0, 1));
        step('create', res.rootId);
        return res.rootId;
      }
      case 'syncInstances': {
        const id = ref(args[0]);
        const list = instancesOf(doc, id);
        for (const inst of list) { commit(syncInstanceOps(doc, inst.id)); st.changed.set(inst.id, inst.name); step('edit', inst.id); }
        return list.length;
      }
      case 'variables':
        return [...doc.variables.values()].map((v) => ({ name: v.name, type: v.type, value: v.type === 'color' ? colorToHex(v.value, true) : v.value }));
      case 'setVariable': {
        const [name, value] = args as [string, unknown];
        if (!name) throw new Error('setVariable(name, value): name is required');
        const prev = [...doc.variables.values()].find((v) => v.name === name);
        const id = prev?.id ?? newId();
        const variable = typeof value === 'number' ? { id, name, type: 'number' as const, value }
          : typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? { id, name, type: 'color' as const, value: hexToColor(value) }
          : { id, name, type: 'string' as const, value: String(value) };
        commit([{ op: 'setVariable', variable }]);
        st.changed.set(`variable:${id}`, name);
        return name;
      }
      case 'resolveComment': {
        const c = doc.comments.get(String(args[0]));
        if (!c) throw new Error(`No comment "${String(args[0])}" — ids are listed under "Open comments" in the state`);
        commit([{ op: 'setComment', comment: { ...c, resolved: true } }]);
        st.changed.set(`comment:${c.id}`, 'comment');
        return null;
      }
      case 'print':
        st.output.push((args[0] as string[]).join(' '));
        return null;
      default:
        throw new Error(`Unknown API ${name}`);
    }
  }
}

/**
 * Final positions after layout ran (a node inserted into an auto-layout frame moves when its siblings
 * arrive); deleted nodes keep where they were. Long snippets are thinned so the cursor stays readable.
 */
function finishTrail(doc: ArchaDocument, steps: TrailStep[]): TrailStep[] {
  const out = steps.map((s) => (doc.get(s.nodeId) ? { ...s, bounds: doc.worldBounds(s.nodeId) } : s));
  const MAX = 40;
  if (out.length <= MAX) return out;
  const keep = out.filter((s) => s.action !== 'read');
  const list = keep.length ? keep : out;
  return list.length <= MAX ? list : Array.from({ length: MAX }, (_, i) => list[Math.round((i * (list.length - 1)) / (MAX - 1))]!);
}

function resolveIn(doc: ArchaDocument, r: string): string {
  if (doc.get(r)) return r;
  const named = doc.findByName(r);
  if (named.length === 1) return named[0]!.id;
  if (named.length > 1) throw new DocumentError('VALIDATION', `Name "${r}" matches ${named.length} nodes — use the id`);
  throw new DocumentError('NOT_FOUND', `No node with id or name "${r}"`);
}

function view(doc: ArchaDocument, n: Node, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...n, bounds: doc.worldBounds(n.id) };
  if (isContainer(n) && depth > 0) out.childNodes = doc.children(n.id).map((c) => view(doc, c, depth - 1));
  const parent = n.parentId ? doc.get(n.parentId) : undefined;
  if (parent?.type === 'frame' && parent.clip) {
    const inside = n.x >= 0 && n.y >= 0 && n.x + n.width <= parent.width && n.y + n.height <= parent.height;
    const outside = n.x >= parent.width || n.y >= parent.height || n.x + n.width <= 0 || n.y + n.height <= 0;
    out.clipped = inside ? 'none' : outside ? 'full' : 'partial';
  }
  return out;
}

function summarise(created: Array<{ name: string }>, changed: Map<string, string>): string {
  const parts: string[] = [];
  if (created.length) parts.push(`created ${created.length} (${created.slice(0, 3).map((c) => c.name).join(', ')}${created.length > 3 ? '…' : ''})`);
  if (changed.size) parts.push(`changed ${changed.size}`);
  return parts.join(', ') || 'no changes';
}

/** `get_state` text, pre-injected into agent prompts (blueprint MCP/01). */
export function describeState(ws: Workspace, s: DocumentSession): string {
  const doc = s.doc;
  const page = doc.pages[0]!;
  const top = doc.children(page.rootId);
  const sel = (ws.selection.get(s.id) ?? []).map((id) => doc.get(id)).filter((n): n is Node => !!n);
  const lines = [
    `Document "${doc.meta.name}" (id ${s.id}) · revision ${s.revision}${s.filePath ? ` · ${s.filePath}` : ' · unsaved'}`,
    `Page "${page.name}" root id "${page.rootId}" — insert(null, …) places nodes on this page.`,
    `Selection: ${sel.length ? sel.map((n) => `${n.name} "${n.id}" (${n.type} ${n.width}×${n.height})`).join(', ') : 'none'}`,
    `Top-level nodes (${top.length}):`,
    ...top.slice(0, 30).map((n) => `  - ${n.name} "${n.id}" ${n.type} at ${n.x},${n.y} size ${n.width}×${n.height}${isContainer(n) ? ` · ${n.children.length} children` : ''}`),
    ...(top.length > 30 ? [`  … +${top.length - 30} more`] : []),
    ...describeVariables(doc),
    ...describeComments(doc),
    ...describeComponents(doc),
    ...describeLibrary(ws),
    `Other open documents: ${ws.summaries().filter((d) => d.id !== s.id).map((d) => `${d.name} (${d.id})`).join(', ') || 'none'}`,
  ];
  return lines.join('\n');
}

function describeVariables(doc: ArchaDocument): string[] {
  const vars = [...doc.variables.values()];
  if (!vars.length) return [];
  return [
    `Variables (${vars.length}) — the document's design tokens; use these values instead of inventing new ones:`,
    ...vars.slice(0, 60).map((v) => `  - ${v.name} (${v.type}) = ${v.type === 'color' ? colorToHex(v.value, true) : JSON.stringify(v.value)}`),
  ];
}

/** Open review comments: what the person wants changed, and where. */
function describeComments(doc: ArchaDocument): string[] {
  const open = [...doc.comments.values()].filter((c) => !c.resolved);
  if (!open.length) return [];
  return [
    `Open comments (${open.length}) — resolveComment(id) once you have addressed one:`,
    ...open.slice(0, 30).map((c) => {
      const n = c.nodeId ? doc.get(c.nodeId) : undefined;
      return `  - ${c.id} ${n ? `on ${n.name} "${n.id}"` : `at ${Math.round(c.x)},${Math.round(c.y)}`}: ${c.messages.map((m) => `${m.author}: ${m.text}`).join(' / ').slice(0, 300)}`;
    }),
  ];
}

/** Components block of the state text: agents must reuse these instead of rebuilding them (DESIGN_SYSTEM/02 v1). */
function describeComponents(doc: ArchaDocument): string[] {
  const list = listComponents(doc);
  if (!list.length) return ['Components: none yet. When you build something that repeats (button, card, nav item, list row), makeComponent() it and reuse it with instance().'];
  return [
    `Components (${list.length}) — reuse with instance(id, parent); never rebuild them by hand:`,
    ...list.slice(0, 40).map((c) => `  - ${c.name} "${c.id}" ${c.width}×${c.height} · ${c.instances} instance${c.instances === 1 ? '' : 's'}${c.description ? ` · ${c.description}` : ''}`),
  ];
}

function describeLibrary(ws: Workspace): string[] {
  const items = ws.library.list();
  if (!items.length) return [];
  return [
    `Library components (${items.length}) — shared across documents; place with fromLibrary(ref, parent):`,
    ...items.slice(0, 40).map((i) => `  - ${i.name} "${i.ref}" ${i.width}×${i.height}${i.description ? ` · ${i.description}` : ''}`),
  ];
}
