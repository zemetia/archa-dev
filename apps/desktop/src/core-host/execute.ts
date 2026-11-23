import { getQuickJS, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSWASMModule } from 'quickjs-emscripten';
import {
  alignOps, applyOps, bindTokens, boundTo, contextOf, distributeOps, DocumentError, findEmptySpace, findVariable, insertOpsFor, outline, wrapOps, instanceOps, libraryInsertOps, instancesOf, lint, listComponents, makeComponentOps, normaliseInput, setPropsOps, subtreeInput, syncInstanceOps,
  type ArchaDocument, type DocumentSession,
} from '@archa/core';
import { CUSTOM_SET, customIconNode, getIcon, ICON_SETS, iconNode, iconSetMeta, loadAllIconSets, loadedIconSet, parseIconRef, searchIcons, searchNames } from '@archa/icons';
import { importSvg, isSvgMarkup, type SvgImportMode } from '@archa/formats';
import { paintColor, colorToHex, hexToColor, isContainer, newId, type Node, type NodeInput, type Op } from '@archa/schema';
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
var makeComponent = (ref, description, opts) => __call('makeComponent', [ref, description || '', opts || {}]);
var instance = (component, parent, opts) => __call('instance', [component, parent, opts || {}]);
var syncInstances = (component) => __call('syncInstances', [component]);
var setProps = (ref, values) => __call('setProps', [ref, values || {}]);
var resetInstance = (ref) => __call('resetInstance', [ref]);
var bind = (ref, map) => __call('bind', [ref, map || {}]);
var unbind = (ref, paths) => __call('unbind', [ref, paths === undefined ? null : [].concat(paths)]);
var copy = (ref, parent, opts) => __call('copy', [ref, parent, opts || {}]);
var fromLibrary = (ref, parent, opts) => __call('fromLibrary', [ref, parent, opts || {}]);
var variables = () => __call('variables', []);
var setVariable = (name, value) => __call('setVariable', [name, value]);
var resolveComment = (id) => __call('resolveComment', [id]);
var align = (refs, edge, opts) => __call('align', [[].concat(refs), edge, opts || {}]);
var distribute = (refs, axis, opts) => __call('distribute', [[].concat(refs), axis, typeof opts === 'number' ? { gap: opts } : opts || {}]);
var wrap = (refs, frame) => __call('wrap', [[].concat(refs), frame || {}]);
var outline = (ref, opts) => __call('outline', [ref, opts || {}]);
var icon = (name, parent, opts) => __call('icon', [name, parent, opts || {}]);
var icons = (query, opts) => __call('icons', [query, opts || {}]);
var svg = (markup, parent, opts) => __call('svg', [markup, parent, opts || {}]);
var print = (...v) => __call('print', [v.map((x) => typeof x === 'string' ? x : JSON.stringify(x))]);
var find = (visitor, opts) => {
  if (!opts || !opts.under) throw new Error('find() needs { under: <frame id or name> } — use get_state for the page overview');
  const out = []; const limit = opts.limit || 500;
  const walk = (id) => { if (out.length >= limit) return; const n = get(id); const r = visitor(n); if (r === true) out.push(n); if (r !== 'skip' && n.children) for (const c of n.children) walk(c); };
  walk(get(opts.under).id); return out;
};
`;

type Pending = { code: string; createdAt: number };
export type ImagePlacement = {
  /** Put the picture into this layer's fills instead of placing a new image layer. */
  fillOf?: string;
  parent?: string; x?: number; y?: number; width?: number; height?: number; index?: number;
  name?: string; fit?: 'crop' | 'fit' | 'fill'; cornerRadius?: number; naturalWidth?: number; naturalHeight?: number;
};

export class AgentExecutor {
  private ctx: QuickJSContext | null = null;
  private failed = new Map<string, Pending>();
  /** Large data URLs handed to a snippet by key, so megabytes never pass through the JS source. */
  private blobs = new Map<string, string>();
  private state ={ working: null as ArchaDocument | null, ops: [] as Op[], created: [] as Array<{ name: string; id: string }>, changed: new Map<string, string>(), output: [] as string[], shots: [] as Array<{ id: string; scale: number }>, pageRoot: '', selection: [] as string[], steps: [] as TrailStep[] };

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

  /** place_image (blueprint BROWSER, "Images"): puts a fetched picture on the canvas with the usual execute reply. */
  async placeImage(session: DocumentSession, embed: string, opts: ImagePlacement): Promise<ExecuteResult> {
    const key = `archa-blob:${newId(10)}`;
    this.blobs.set(key, embed);
    try {
      return await this.run(session, { code: `__call('image', [${JSON.stringify(key)}, ${JSON.stringify(opts)}])` });
    } finally {
      this.blobs.delete(key);
    }
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

    // Icon sets load once, on the first snippet that asks for one (they are large).
    if (/\bicons?\s*\(/.test(code)) await loadAllIconSets();
    const ctx = await this.context();
    const page = session.doc.pages[0]!;
    this.state = { working: session.doc.clone(), ops: [], created: [], changed: new Map(), output: [], shots: [], pageRoot: page.rootId, selection: this.ws.selection.get(session.id) ?? [], steps: [] };
    ctx.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + 5000));
    // Agents re-declare the same names every call; as `var` they persist and never collide.
    const result = ctx.evalCode(code.replace(/(^|[;{}\n]\s*|\(\s*)(?:const|let)\s+(?=[A-Za-z_$[{])/g, '$1var '), 'snippet.js');

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

    const fixed = autoFix(this.state.working!, this.state.created);
    if (fixed.ops.length) { this.state.ops.push(...fixed.ops); this.state.output.push(...fixed.notes); }

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
    // Every building call shows its result, so the agent checks it without another round-trip.
    if (!this.state.shots.length) {
      const auto = autoShotTarget(session.doc, this.state.created.map((c) => c.id), [...this.state.changed.keys()]);
      if (auto) this.state.shots.push({ id: auto, scale: 1 });
    }
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
        // SVG markup written into a text node would show as code: place it as the drawing instead.
        if (input.type === 'text' && typeof input.text === 'string' && isSvgMarkup(input.text)) {
          const { text, name: n, x, y } = input as unknown as { text: string; name?: string; x?: number; y?: number };
          st.output.push('insert: that text was SVG markup, so it was placed as a drawing — use svg(markup, parent, opts) for SVG');
          return this.hostCall('svg', [text, parentId, { name: n, x, y, index }]);
        }
        const { ops, rootId, created } = insertOpsFor(withTokens(doc, input), parentId, index ?? undefined);
        commit(ops);
        st.created.push(...created);
        step('create', rootId);
        return rootId;
      }
      case 'update': {
        const [r, patch] = args as [string, Record<string, unknown>];
        const id = ref(r);
        // Partial sizing / padding patches keep the node's other values.
        const cur = doc.require(id) as Node & { padding?: Record<string, number> };
        const merged: Record<string, unknown> = { ...patch };
        if (patch.sizing && typeof patch.sizing === 'object') merged.sizing = { ...cur.sizing, ...(patch.sizing as object) };
        if (patch.padding && typeof patch.padding === 'object' && !Array.isArray(patch.padding) && cur.padding) merged.padding = { ...cur.padding, ...(patch.padding as object) };
        // `context` is the person's note on the layer (design panel → Context); it lives in meta, next to component data.
        if ('context' in patch) { merged.meta = { ...cur.meta, ...(merged.meta as object | undefined), context: String(patch.context ?? '') }; delete merged.context; }
        else if (merged.meta && typeof merged.meta === 'object') merged.meta = { ...cur.meta, ...(merged.meta as object) };
        // "$color/accent" values bind the property to that token; bindings of replaced properties go.
        const tokened = bindTokens(doc, merged, tokenHex);
        if (tokened.bindings) {
          const kept = Object.fromEntries(Object.entries(cur.bindings ?? {}).filter(([path]) => !(path.split('.')[0]! in patch)));
          tokened.bindings = { ...kept, ...(tokened.bindings as Record<string, string>) };
        }
        const norm = normaliseInput({ ...tokened, type: cur.type });
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
        const opts = (args[2] ?? {}) as { props?: Record<string, { type: 'text' | 'boolean'; node: string }>; set?: string; variant?: Record<string, string> };
        const props = opts.props ? Object.fromEntries(Object.entries(opts.props).map(([k, v]) => [k, { type: v.type, node: ref(v.node) }])) : undefined;
        commit(makeComponentOps(doc, id, String(args[1] ?? ''), { props, set: opts.set, variant: opts.variant }));
        st.changed.set(id, doc.require(id).name);
        step('edit', id);
        return id;
      }
      case 'instance': {
        const [c, parent, opts] = args as [string, string | null | undefined, { x?: number; y?: number; index?: number; name?: string; props?: Record<string, string | boolean> }];
        const main = ref(c);
        // Props may name a variant ("size: lg"): place the right main, then set the rest.
        if (opts?.props && Object.keys(opts.props).length) {
          const id = this.hostCall('instance', [c, parent, { ...opts, props: undefined }]) as string;
          this.hostCall('setProps', [id, opts.props]);
          return id;
        }
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
      case 'setProps': {
        const id = ref(args[0]);
        commit(setPropsOps(doc, id, (args[1] ?? {}) as Record<string, string | boolean>));
        st.changed.set(id, doc.require(id).name);
        step('edit', id);
        return null;
      }
      case 'resetInstance': {
        const id = ref(args[0]);
        commit(syncInstanceOps(doc, id, { reset: true }));
        st.changed.set(id, doc.require(id).name);
        step('edit', id);
        return null;
      }
      case 'bind': {
        const id = ref(args[0]);
        const cur = doc.require(id);
        const bindings: Record<string, string> = { ...cur.bindings };
        for (const [path, name] of Object.entries((args[1] ?? {}) as Record<string, string>)) {
          const v = findVariable(doc, String(name));
          if (!v) throw new Error(`bind: no variable "${String(name)}" — variables: ${[...doc.variables.values()].map((x) => x.name).slice(0, 30).join(', ') || 'none (setVariable first)'}`);
          bindings[BIND_ALIASES[path] ?? path] = v.id;
        }
        commit([{ op: 'update', id, patch: { bindings } }]);
        st.changed.set(id, cur.name);
        step('edit', id);
        return null;
      }
      case 'unbind': {
        const id = ref(args[0]);
        const cur = doc.require(id);
        const paths = args[1] as string[] | null;
        const bindings = Object.fromEntries(Object.entries(cur.bindings ?? {}).filter(([path]) => paths && !paths.map((x) => BIND_ALIASES[x] ?? x).includes(path)));
        commit([{ op: 'update', id, patch: { bindings: Object.keys(bindings).length ? bindings : undefined } }]);
        st.changed.set(id, cur.name);
        return null;
      }
      case 'variables':
        return [...doc.variables.values()].map((v) => ({ name: v.name, type: v.type, value: v.type === 'color' ? colorToHex(v.value, true) : v.value, bound: boundTo(doc, v.id).length }));
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
      case 'icon': {
        const [nameArg, parent, opts = {}] = args as [string, string | null | undefined, { size?: number; color?: string; strokeWidth?: number; index?: number; x?: number; y?: number; name?: string }];
        const { set, name: key } = parseIconRef(String(nameArg ?? ''));
        const parentId = parent ? ref(parent) : st.pageRoot;
        const size = Number(opts.size) > 0 ? Number(opts.size) : 20;
        let input: NodeInput;
        if (set === CUSTOM_SET) {
          const mine = this.ws.icons.get(key);
          if (!mine) throw new Error(`No uploaded icon "${key}" — uploaded icons: ${this.ws.icons.list().map((i) => i.name).slice(0, 30).join(', ') || 'none'}`);
          input = customIconNode(mine, { size, color: opts.color, name: opts.name });
        } else {
          const icon = getIcon(loadedIconSet(set), key);
          if (!icon) {
            if (!iconSetMeta(set)) throw new Error(`Unknown icon set "${set}" — sets: ${ICON_SETS.map((x) => x.id).join(', ')}, my`);
            const near = searchIcons(key, { sets: [set], limit: 8 });
            throw new Error(`No icon "${String(nameArg)}"${near.length ? ` — did you mean ${near.join(', ')}?` : ''}. icons("query") searches every set; brand logos are "logos:<brand>"`);
          }
          // Logos keep their brand colour unless one is asked for; icons default to readable ink.
          input = iconNode(icon, { size, color: opts.color ?? (icon.brand ? undefined : inkFor(doc, parentId)), strokeWidth: opts.strokeWidth, name: opts.name });
        }
        if (opts.x !== undefined) (input as { x?: number }).x = opts.x;
        if (opts.y !== undefined) (input as { y?: number }).y = opts.y;
        const { ops, rootId, created } = insertOpsFor(input, parentId, opts.index ?? undefined);
        commit(ops);
        st.created.push(...created);
        step('create', rootId);
        return rootId;
      }
      case 'svg': {
        const [markup, parent, opts = {}] = args as [string, string | null | undefined, { width?: number; height?: number; x?: number; y?: number; index?: number; name?: string; mode?: SvgImportMode }];
        if (typeof markup !== 'string' || !markup.trim()) throw new Error('svg(markup, parent, opts): markup is the SVG source as a string, e.g. svg(`<svg viewBox="0 0 24 24">…</svg>`, card)');
        const parentId = parent ? ref(parent) : st.pageRoot;
        const r = importSvg(markup, { name: opts.name, mode: opts.mode, width: Number(opts.width) || undefined, height: Number(opts.height) || undefined });
        const input = r.node as NodeInput & { x?: number; y?: number };
        if (opts.x !== undefined) input.x = Number(opts.x);
        if (opts.y !== undefined) input.y = Number(opts.y);
        if (opts.x === undefined && opts.y === undefined && parentId === st.pageRoot) Object.assign(input, findEmptySpace(doc, parentId, Number(input.width) || 100, Number(input.height) || 100));
        const { ops, rootId, created } = insertOpsFor(input, parentId, opts.index ?? undefined);
        commit(ops);
        st.created.push(...created.slice(0, 1));
        st.output.push(r.mode === 'vector'
          ? `svg: "${created[0]!.name}" placed as ${r.shapes} editable vector layer${r.shapes === 1 ? '' : 's'}`
          : `svg: "${created[0]!.name}" placed as an image${r.reason ? ` (vectors cannot keep ${r.reason})` : ''} — it looks exact but its shapes are not editable layers`);
        step('create', rootId);
        return rootId;
      }
      case 'image': {
        const [key, o] = args as [string, ImagePlacement];
        const src = this.blobs.get(key);
        if (!src) throw new Error('That image is no longer available — call place_image again.');
        if (o.fillOf) {
          // A picture fill under the layer's gradients (scrims stay on top); solid fills give way to it.
          const id = ref(o.fillOf);
          const target = doc.require(id);
          if (!('fills' in target)) throw new Error(`place_image fillOf: "${target.name}" is a ${target.type} and has no fills`);
          const fit = o.fit ?? 'crop';
          const fills = [{ type: 'image' as const, src, fit, scale: 1, opacity: 1, visible: true }, ...target.fills.filter((f) => f.type !== 'solid' && f.type !== 'image')];
          commit([{ op: 'update', id, patch: { fills } }]);
          st.changed.set(id, target.name);
          st.output.push(`image: placed as the picture fill of "${target.name}" (fit ${fit}); its gradients stay on top`);
          step('edit', id);
          return id;
        }
        const parentId = o.parent ? ref(o.parent) : st.pageRoot;
        const nw = o.naturalWidth || 300, nh = o.naturalHeight || 200;
        let w = Number(o.width) || 0, h = Number(o.height) || 0;
        if (w && !h) h = Math.round(w * nh / nw);
        else if (h && !w) w = Math.round(h * nw / nh);
        else if (!w && !h) {
          // Like a pasted image: big pictures land at a comfortable size; the pixels stay full resolution.
          const fit = Math.min(1, 800 / Math.max(nw, nh));
          w = Math.round(nw * fit); h = Math.round(nh * fit);
        }
        const input = { type: 'image', name: o.name || 'Image', src, fit: o.fit ?? 'crop', width: w, height: h, ...(o.cornerRadius ? { cornerRadius: o.cornerRadius } : {}) } as NodeInput & { x?: number; y?: number };
        if (o.x !== undefined) input.x = Number(o.x);
        if (o.y !== undefined) input.y = Number(o.y);
        if (o.x === undefined && o.y === undefined && parentId === st.pageRoot) Object.assign(input, findEmptySpace(doc, parentId, w, h));
        const { ops, rootId, created } = insertOpsFor(input, parentId, o.index ?? undefined);
        commit(ops);
        st.created.push(...created.slice(0, 1));
        st.output.push(`image: "${created[0]!.name}" placed at ${w}×${h}${o.naturalWidth ? ` (file ${o.naturalWidth}×${o.naturalHeight} px)` : ''}, fit ${input.fit as string}`);
        step('create', rootId);
        return rootId;
      }
      case 'align':
      case 'distribute': {
        const [refs, how, opts] = args as [string[], string, { to?: 'auto' | 'parent' | 'selection'; gap?: number }];
        const ids = refs.map(ref);
        const r = name === 'align' ? alignOps(doc, ids, String(how ?? ''), opts?.to ?? 'auto') : distributeOps(doc, ids, String(how ?? ''), opts?.gap);
        commit(r.ops);
        for (const op of r.ops) if (op.op === 'update') { st.changed.set(op.id, doc.require(op.id).name); step('edit', op.id); }
        st.output.push(...r.notes.map((n) => `${name}: ${n}`));
        return null;
      }
      case 'wrap': {
        const [refs, frame] = args as [string[], Record<string, unknown>];
        const { ops, rootId } = wrapOps(doc, refs.map(ref), frame ?? {});
        commit(ops);
        st.created.push({ id: rootId, name: doc.require(rootId).name });
        step('create', rootId);
        return rootId;
      }
      case 'outline': {
        const [r, opts] = args as [string | null | undefined, { depth?: number }];
        const id = r ? ref(r) : st.pageRoot;
        step('read', id);
        return outline(doc, id, opts?.depth ?? (id === st.pageRoot ? 1 : 3));
      }
      case 'icons': {
        const [q, o] = args as [string, { set?: string | string[]; limit?: number } | undefined];
        const sets = o?.set ? [o.set].flat() : undefined;
        const limit = Math.min(Number(o?.limit) || 30, 100);
        const hits = searchIcons(String(q ?? ''), { sets: sets?.filter((x) => x !== CUSTOM_SET), limit });
        if (!sets || sets.includes(CUSTOM_SET)) hits.unshift(...searchNames(this.ws.icons.list().map((i) => i.name), String(q ?? ''), 6).map((n) => `${CUSTOM_SET}:${n}`));
        return hits.slice(0, limit);
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

const tokenHex = (v: { value: Parameters<typeof colorToHex>[0] }) => colorToHex(v.value, true);

/** Agent-friendly binding names → property paths. */
const BIND_ALIASES: Record<string, string> = { fill: 'fills.0.color', color: 'fills.0.color', stroke: 'strokes.0.color', radius: 'cornerRadius', spacing: 'gap' };

/** `"$token"` values in a node input (and its inline children) → literal values + bindings. */
function withTokens(doc: ArchaDocument, input: NodeInput): NodeInput {
  const out = bindTokens(doc, input as Record<string, unknown>, tokenHex) as NodeInput;
  if (Array.isArray(input.children)) out.children = input.children.map((c) => withTokens(doc, c));
  return out;
}

/** Readable ink for content placed in `parentId`: light on dark fills (or the dark page), dark on light. */
function inkFor(doc: ArchaDocument, parentId: string): string {
  for (let n = doc.get(parentId); n; n = n.parentId ? doc.get(n.parentId) : undefined) {
    // The topmost paint that is not see-through decides; a photo is read as dark (scrims usually darken it).
    const fill = 'fills' in n ? n.fills.filter((f) => f.visible && (f.type === 'image' || (paintColor(f)?.a ?? 0) > 0.3)).at(-1) : undefined;
    if (fill) return (paintColor(fill)?.l ?? 0) < 0.6 ? '#f4f4f5' : '#18181b';
  }
  return '#d4d4d8';
}

/** Mechanical fixes applied before the transaction instead of bouncing them back as lint issues. */
function autoFix(doc: ArchaDocument, created: Array<{ id: string; name: string }>): { ops: Op[]; notes: string[] } {
  const ops: Op[] = [];
  const names: string[] = [];
  for (const c of created) {
    const n = doc.get(c.id);
    if (n?.type !== 'text' || n.fills.some((f) => f.visible) || !n.parentId) continue;
    const op: Op = { op: 'update', id: n.id, patch: { fills: [{ type: 'solid', color: hexToColor(inkFor(doc, n.parentId)), visible: true }] } };
    applyOps(doc, [op]);
    ops.push(op);
    names.push(n.name);
  }
  return { ops, notes: names.length ? [`Auto-fixed: ${names.length} text node${names.length === 1 ? '' : 's'} had no fill and got a readable ink (${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}). Set fills yourself next time.`] : [] };
}

/** What to show after a call that asked for no screenshot: the first new subtree (or the frame around a small one), else the screen that changed. */
function autoShotTarget(doc: ArchaDocument, created: string[], changed: string[]): string | null {
  const made = new Set(created);
  const root = created.find((id) => { const n = doc.get(id); return n && !(n.parentId && made.has(n.parentId)); });
  const start = root ?? changed.find((id) => doc.get(id));
  if (!start) return null;
  let target = doc.get(start)!;
  // A small piece (a button, an icon) is judged in context: climb to its frame, up to the top-level screen.
  while ((root === undefined || Math.max(target.width, target.height) < 240) && target.parentId) {
    const p = doc.get(target.parentId);
    if (!p || p.type === 'page') break;
    target = p;
    if (root !== undefined && Math.max(target.width, target.height) >= 240) break;
  }
  return target.type === 'page' ? null : target.id;
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
    ...describeSelection(doc, sel),
    `Top-level nodes (${top.length}):`,
    ...top.slice(0, 30).map((n) => `  - ${n.name} "${n.id}" ${n.type} at ${n.x},${n.y} size ${n.width}×${n.height}${isContainer(n) ? ` · ${n.children.length} children` : ''}`),
    ...(top.length > 30 ? [`  … +${top.length - 30} more`] : []),
    ...describeVariables(doc),
    ...describeContext(doc),
    ...describeComments(doc),
    ...describeComponents(doc),
    ...describeLibrary(ws),
    `Other open documents: ${ws.summaries().filter((d) => d.id !== s.id).map((d) => `${d.name} (${d.id})`).join(', ') || 'none'}`,
  ];
  return lines.join('\n');
}

/** The selected layers as the design panel shows them, so the agent edits what the person points at without a read call. */
function describeSelection(doc: ArchaDocument, sel: Node[]): string[] {
  if (!sel.length || sel.length > 6) return [];
  return ['Selected layers (outline):', ...sel.map((n) => outline(doc, n.id, 2, 60).replace(/^/gm, '  '))];
}

/** Notes people wrote on layers (Context): constraints the agent must follow when it touches them. */
function describeContext(doc: ArchaDocument): string[] {
  const noted = [...doc.nodes.values()].filter((n) => contextOf(n));
  if (!noted.length) return [];
  return [
    `Layer context notes (${noted.length}) — the person's instructions for these layers; follow them:`,
    ...noted.slice(0, 30).map((n) => `  - ${n.name} "${n.id}": ${contextOf(n).replace(/\s+/g, ' ').slice(0, 300)}`),
  ];
}

function describeVariables(doc: ArchaDocument): string[] {
  const vars = [...doc.variables.values()];
  if (!vars.length) return [];
  return [
    `Variables (${vars.length}) — the document's design tokens; use them as "$name" values (fills: ["$color/accent"], cornerRadius: "$radius/md") so the design follows the token:`,
    ...vars.slice(0, 60).map((v) => `  - ${v.name} (${v.type}) = ${v.type === 'color' ? colorToHex(v.value, true) : JSON.stringify(v.value)}${boundTo(doc, v.id).length ? ` · bound by ${boundTo(doc, v.id).length}` : ''}`),
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
    ...list.slice(0, 40).map((c) => {
      const props = Object.entries(c.props).map(([k, t]) => `${k}:${t}`);
      const variant = c.set ? ` · variant of "${c.set}" ${Object.entries(c.variant).map(([k, v]) => `${k}=${v}`).join(' ')}` : '';
      return `  - ${c.name} "${c.id}" ${c.width}×${c.height} · ${c.instances} instance${c.instances === 1 ? '' : 's'}${variant}${props.length ? ` · props ${props.join(', ')}` : ''}${c.description ? ` · ${c.description}` : ''}`;
    }),
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
