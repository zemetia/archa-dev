import { z } from 'zod';
import type { DocumentData, NodeInput, Op } from '@archa/schema';
import { browserCommandSchema, placeImageSchema, type BrowserReply } from './browser';
import type { McpImportCandidate, McpServer, McpTestResult, MemoryEntry, Skill, SkillsOverview } from './settings';
import type {
  AccountsOverview, ActivityEntry, AgentAccount, AgentClient, AppInfo, ChatMessage, ChatQueued, ChatRunEvent, CompareResult, CompareStats,
  AppSettings, CustomIconInfo, DocSummary, ExecuteResult, LibraryItem, LoginState, ModelOption, OrchestraReport, OrchestraWorker, ProjectFile, Shot,
} from './index';

/* ----------------------------------------------------------------------------
 * The RPC registry: every core-host method, its zod params and its result type. Single source of
 * truth — `CoreMethods` is derived from it, the core host validates every request against it before
 * the handler runs, and its handler map is typed against it (blueprint ARCHITECTURE/02).
 * Agent (MCP) tools live in ./tools.ts and point at these methods.
 * ------------------------------------------------------------------------- */

/** A result type only (results are built by the core, not validated). */
const out = <T>() => undefined as unknown as T;
const m = <P extends z.ZodType, R>(params: P, result: R, description: string) => ({ params, result, description });
/** No params: anything is accepted and ignored. */
const none = z.custom<void>(() => true);
/** A document the handler resolves with `session()`: id, `.archa` path or unique name; '' or none = the active one. */
const docRef = z.string();
const optDoc = z.string().optional();
const threadId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const agentId = z.enum(['claude', 'agy', 'codex']);
/** Ops are checked against opSchema in the handler, which keeps the raw objects (the schema fills defaults). */
const opLike = z.custom<Op>((o) => typeof o === 'object' && o !== null, 'op must be an object');

/* ------------------------------- shared schemas ------------------------------ */

export const DEFAULT_LIBRARY = 'my-library';
const libName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Library and component ids use letters, digits, - and _');
const libraryItemParams = z.object({ library: libName, id: libName });

export const customIconSchema = z.object({
  name: z.string().trim().min(1).max(80),
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
  node: z.custom<NodeInput>((n) => typeof n === 'object' && n !== null && typeof (n as { type?: unknown }).type === 'string', 'node.type is required'),
  preview: z.string().startsWith('data:image/').max(1_500_000).optional(),
});

/** ArchaDev's own MCP server name; an external server may not take it. */
export const MCP_RESERVED = 'archadev';
const secrets = z.array(z.object({ key: z.string().trim().min(1).max(200).regex(/^[^\s=]+$/, 'Keys cannot contain spaces or "="'), value: z.string().max(8192).nullable() })).max(64);
export const mcpSaveParams = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(48).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, "-" and "_"').refine((n) => n.toLowerCase() !== MCP_RESERVED, `"${MCP_RESERVED}" is ArchaDev's own server`),
  transport: z.enum(['stdio', 'http', 'sse']),
  command: z.string().trim().max(1024).optional(),
  args: z.array(z.string().max(4096)).max(64).optional(),
  url: z.string().trim().max(2048).optional(),
  env: secrets.optional(),
  headers: secrets.optional(),
  enabled: z.boolean().optional(),
});

const accountId = z.object({ id: z.string().min(1).max(64) });
const skillSlug = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes');
const skillById = z.object({ id: z.string().min(1).max(200), docId: z.string().optional() });
const chatQueueParams = z.object({ threadId, id: z.string().min(1).max(64) });
/** A window context: an absolute project folder, or null (public). Omitted on doc.new / doc.open = the context of the document used last. */
const project = z.string().min(1).max(4096).refine((p) => /^([A-Za-z]:[\\/]|[\\/])/.test(p), 'project must be an absolute folder path');
export const settingsPatchSchema = z.object({
  autosave: z.object({ enabled: z.boolean(), seconds: z.number().int().min(5).max(3600) }).optional(),
}).strict();

/* ---------------------------------- methods ---------------------------------- */

export const RPC = {
  'workspace.list': m(none, out<DocSummary[]>(), 'Every open document'),
  'doc.new': m(z.object({ name: z.string().optional(), project: project.nullable().optional() }), out<{ docId: string }>(), 'Create an empty document'),
  'doc.open': m(z.object({ path: z.string().min(1), project: project.nullable().optional() }), out<{ docId: string }>(), 'Open a .archa file (or return the id it is open under)'),
  /** A window's start: reopens the files its context had open last time (null = public, else a project folder). */
  'workspace.restore': m(z.object({ project: project.nullable() }), out<{ active: string | null }>(), 'Reopen the files a window context had open'),
  'project.files': m(z.object({ project }), out<ProjectFile[]>(), 'The .archa files in a project\'s .design/ folder, newest first'),
  'doc.save': m(z.object({ docId: docRef, path: z.string().optional() }), out<{ path: string }>(), 'Save to its file, or to `path` (Save As)'),
  'doc.close': m(z.object({ docId: z.string().min(1) }), out<void>(), 'Close a document'),
  'doc.rename': m(z.object({ docId: docRef, name: z.string() }), out<void>(), 'Rename a document'),
  'doc.snapshot': m(z.object({ docId: docRef }), out<{ data: DocumentData; revision: number }>(), 'Whole document data at its revision'),
  'doc.apply': m(z.object({ docId: docRef, baseRevision: z.number(), ops: z.array(opLike), label: z.string() }), out<{ revision: number; txnId: string }>(), 'Apply ops as one transaction'),
  'doc.undo': m(z.object({ docId: docRef }), out<{ revision: number } | null>(), 'Undo the caller\'s last transaction'),
  'doc.redo': m(z.object({ docId: docRef }), out<{ revision: number } | null>(), 'Redo the caller\'s last undone transaction'),
  'selection.set': m(z.object({ docId: z.string(), ids: z.array(z.string()) }), out<void>(), 'Set the window selection'),
  'render.respond': m(z.object({
    requestId: z.string(), png: z.string().optional(), slices: z.array(z.string()).optional(), colors: z.array(z.string().nullable()).optional(),
    stats: z.custom<CompareStats>((v) => typeof v === 'object' && v !== null).optional(), error: z.string().optional(),
  }), out<void>(), 'A window answers a render.request / render.reference / render.compare event'),
  'agents.list': m(none, out<AgentClient[]>(), 'Connected agent clients'),
  'activity.list': m(z.object({ docId: optDoc, limit: z.number().optional() }), out<ActivityEntry[]>(), 'Activity feed entries'),
  // Agent-facing (MCP relay)
  'agent.state': m(z.object({ docId: optDoc }), out<string>(), 'Text overview of a document'),
  'agent.execute': m(z.object({ docId: optDoc, code: z.string().optional(), editId: z.string().optional(), edits: z.array(z.object({ find: z.string(), replace: z.string() })).optional() }), out<ExecuteResult>(), 'Run an execute snippet, or patch a failed one'),
  'agent.screenshot': m(z.object({ docId: optDoc, node: z.string(), scale: z.number().optional(), slices: z.boolean().optional() }), out<Shot>(), 'PNG of a node'),
  'agent.exportSvg': m(z.object({ docId: optDoc, node: z.string() }), out<{ svg: string }>(), 'SVG markup of a node'),
  'agent.reference': m(z.object({ docId: optDoc, path: z.string().min(1).max(4096), page: z.number().int().min(1).optional(), images: z.boolean().optional() }), out<{ text: string; json?: string; png?: string }>(), 'Read a PDF page or image mockup into numbers'),
  'agent.compare': m(z.object({
    docId: optDoc, node: z.string().min(1), reference: z.string().min(1).max(4096), page: z.number().int().min(1).optional(), scale: z.number().min(0.1).max(4).optional(),
  }), out<CompareResult>(), 'Visual diff of a node against a reference'),
  /** Compact text tree of a node (default: the selection, else the page) — what the design panel shows, per layer. */
  'agent.outline': m(z.object({ docId: optDoc, node: z.string().min(1).optional(), depth: z.number().int().min(0).max(12).optional() }), out<string>(), 'Layer outline of a node, the selection or the page'),
  'agent.say': m(z.object({ docId: optDoc, text: z.string(), nodeId: z.string().optional() }), out<void>(), 'Progress note in the activity feed'),
  'agent.readSkill': m(z.object({ docId: optDoc, name: z.string().trim().min(1).max(120), file: z.string().trim().max(400).optional() }), out<{ text: string }>(), 'A skill\'s SKILL.md and file list, or one of its files'),
  /** The agent finished its turn: its canvas cursor stops and fades (blueprint RENDERING/02, Agent presence). */
  'agent.done': m(z.object({ docId: optDoc, summary: z.string().optional() }), out<void>(), 'The agent finished its turn'),
  /** Drive the in-app browser (blueprint BROWSER). */
  'agent.browser': m(browserCommandSchema, out<BrowserReply>(), 'Drive the in-app browser'),
  /** A picture from a URL, file or the browser page onto the canvas (blueprint BROWSER, "Images"). */
  'agent.placeImage': m(placeImageSchema, out<ExecuteResult>(), 'Place a picture on the canvas'),
  /** Orchestrate mode (blueprint AGENT_BRIDGE/06): a lead thread starts worker threads and collects their reports. */
  'orchestra.delegate': m(z.object({
    tasks: z.array(z.object({
      title: z.string().min(1).max(120), prompt: z.string().min(1).max(40_000), kind: z.string().max(40).optional(),
      agent: agentId.optional(), model: z.string().max(100).optional(), frame: z.string().min(1).max(100).optional(),
    })).min(1).max(8),
  }), out<{ workers: OrchestraWorker[] }>(), 'Start worker threads (lead only)'),
  'orchestra.wait': m(z.object({ workers: z.array(z.string().min(1).max(100)).max(8).optional(), timeoutSec: z.number().min(5).max(600).optional() }), out<{ workers: OrchestraReport[]; timedOut: boolean }>(), 'Wait for workers and collect their reports'),
  'orchestra.tell': m(z.object({ worker: z.string().min(1).max(100), message: z.string().min(1).max(40_000) }), out<{ queued: boolean }>(), 'Follow-up message to a worker'),
  // App
  'app.info': m(none, out<AppInfo>(), 'Version, user, CLI and MCP command, available agents'),
  'settings.get': m(none, out<AppSettings>(), 'App preferences (Settings → General)'),
  'settings.set': m(settingsPatchSchema, out<AppSettings>(), 'Change app preferences'),
  /** html / tailwind also write a CSS file and image assets next to `path`; png / jpg arrive rendered by the renderer as base64. */
  'export.save': m(z.object({
    docId: z.string().min(1), nodeId: z.string().min(1), format: z.enum(['png', 'jpg', 'svg', 'html', 'tailwind']),
    path: z.string().min(1).max(4096), image: z.string().max(200_000_000).optional(),
  }), out<{ files: string[] }>(), 'Export a node to a file (path must be absolute)'),
  /** Self-contained HTML page of a node (CSS inlined, images embedded) — main prints it to PDF. */
  'export.page': m(z.object({ docId: z.string().min(1), nodeId: z.string().min(1) }), out<{ html: string; width: number; height: number }>(), 'Standalone HTML page of a node'),
  /** Code of a node for the clipboard: one HTML file (CSS inlined in a <style>, or Tailwind classes), images embedded. */
  'export.code': m(z.object({ docId: z.string().min(1), nodeId: z.string().min(1), style: z.enum(['css', 'tailwind']) }), out<{ code: string }>(), 'HTML code of a node'),
  // Chat: launch a local agent CLI on this document (blueprint AGENT_BRIDGE/03)
  /**
   * No threadId = start a new conversation. `now` stops the thread's running turn and runs this message next;
   * otherwise a busy thread queues it. `focus` = node ids the request is about (the composer's selection chip).
   */
  'chat.send': m(z.object({
    docId: z.string().min(1), agent: z.string().min(1), prompt: z.string().min(1).max(100_000),
    model: z.string().max(100).optional(), account: z.string().max(100).optional(), threadId: threadId.optional(),
    now: z.boolean().optional(), focus: z.array(z.string().min(1).max(100)).max(50).optional(), mode: z.enum(['chat', 'orchestrate']).optional(),
    images: z.array(z.object({
      mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      data: z.string().min(1).max(15_000_000).regex(/^[A-Za-z0-9+/]+=*$/),
      thumb: z.string().max(300_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
    })).max(6).optional(),
  }), out<{ runId: string; threadId: string; persona: string; queued?: boolean }>(), 'Send a chat message to a local agent CLI'),
  /** Start (or keep) the agent process for a thread before the person sends, so the first turn starts at once. No threadId = a fresh thread id is reserved and returned. */
  'chat.warm': m(z.object({ docId: z.string().min(1), agent: z.string().min(1), model: z.string().max(100).optional(), account: z.string().max(100).optional(), threadId: threadId.optional() }), out<{ threadId: string; warm: boolean }>(), 'Pre-start the agent process for a thread'),
  'chat.stop': m(z.object({ runId: z.string() }), out<void>(), 'Stop a running turn'),
  /** Messages waiting in a thread; `chat.sendQueued` runs one now (stops the current turn), `chat.unqueue` drops it. */
  'chat.queued': m(z.object({ threadId }), out<ChatQueued[]>(), 'Messages waiting in a thread'),
  'chat.sendQueued': m(chatQueueParams, out<void>(), 'Run a queued message now'),
  'chat.unqueue': m(chatQueueParams, out<void>(), 'Drop a queued message'),
  /** Runs still working, so a reloaded window shows every parallel session. */
  'chat.runs': m(none, out<ChatRunEvent[]>(), 'Runs still working'),
  'chat.list': m(z.object({ docId: docRef }), out<ChatMessage[]>(), 'Chat history of a document'),
  'chat.deleteThread': m(z.object({ docId: z.string().min(1), threadId: z.string().min(1).max(64) }), out<void>(), 'Delete a conversation'),
  /** Models the installed agent CLI offers (agy asks the network; cached). */
  'agents.models': m(z.object({ agent: z.string().pipe(agentId), account: z.string().max(100).optional() }), out<{ models: ModelOption[]; source: string }>(), 'Models an agent CLI offers'),
  // Global component libraries (blueprint DESIGN_SYSTEM/02)
  'library.list': m(none, out<LibraryItem[]>(), 'Every library component'),
  'library.publish': m(z.object({ docId: z.string().min(1), nodeId: z.string().min(1), library: libName.default(DEFAULT_LIBRARY), png: z.string().max(4_000_000).optional() }), out<LibraryItem>(), 'Publish a node to a library'),
  'library.remove': m(libraryItemParams, out<void>(), 'Remove a library component'),
  /** First use places a local main linked to the library; later uses add instances of it. */
  'library.insert': m(libraryItemParams.extend({ docId: z.string().min(1), parentId: z.string().min(1).optional(), x: z.number().finite().optional(), y: z.number().finite().optional() }), out<{ nodeId: string; placed: 'main' | 'instance' }>(), 'Insert a library component'),
  // Uploaded icons, per machine (blueprint DESIGN_SYSTEM/05)
  'icons.custom.list': m(none, out<CustomIconInfo[]>(), 'Uploaded icons'),
  'icons.custom.add': m(z.object({ icons: z.array(customIconSchema).min(1).max(200) }), out<CustomIconInfo[]>(), 'Add uploaded icons'),
  'icons.custom.remove': m(z.object({ name: z.string().min(1).max(80) }), out<void>(), 'Remove an uploaded icon'),
  // Agent login profiles (blueprint AGENT_BRIDGE/02)
  'accounts.overview': m(none, out<AccountsOverview>(), 'Agent CLIs and login profiles'),
  /** No name: the account is named after the login it signs in with. */
  'accounts.create': m(z.object({ agent: agentId, name: z.string().trim().max(80).optional(), apiKey: z.string().trim().max(512).optional() }), out<AgentAccount>(), 'Create a login profile'),
  'accounts.update': m(accountId.extend({ name: z.string().trim().min(1).max(80).optional(), enabled: z.boolean().optional(), isDefault: z.boolean().optional() }), out<AgentAccount>(), 'Rename, enable or make default'),
  'accounts.delete': m(accountId, out<void>(), 'Delete a login profile'),
  'accounts.captureHost': m(z.object({ agent: z.literal('agy') }), out<AgentAccount>(), 'Save the host agy login as a profile'),
  'accounts.useOnHost': m(accountId, out<void>(), 'Make a profile the host login'),
  'accounts.login.start': m(accountId, out<LoginState>(), 'Start a sign-in'),
  'accounts.login.code': m(accountId.extend({ code: z.string().trim().min(1).max(4096).regex(/^[^\r\n]+$/, 'Paste the code on one line') }), out<AgentAccount>(), 'Submit a pasted sign-in code'),
  'accounts.login.cancel': m(accountId, out<void>(), 'Cancel a sign-in'),
  // Agent memory (blueprint AGENT_BRIDGE/07)
  'memory.list': m(z.object({ docId: optDoc }), out<MemoryEntry[]>(), 'Remembered facts, global and the document\'s'),
  'memory.remember': m(z.object({
    docId: optDoc, scope: z.enum(['global', 'document']), text: z.string().trim().min(1).max(4000),
    name: z.string().trim().max(80).optional(), replaces: z.string().max(200).optional(),
  }), out<MemoryEntry>(), 'Keep a fact for later chats'),
  'memory.forget': m(z.object({ docId: optDoc, id: z.string().min(1).max(200) }), out<MemoryEntry>(), 'Remove a remembered fact'),
  // Skills handed to chat runs (blueprint AGENT_BRIDGE/05)
  'skills.list': m(z.object({ docId: optDoc }).optional(), out<SkillsOverview>(), 'Every skill and where they come from'),
  'skills.create': m(z.object({ name: skillSlug, description: z.string().trim().min(1).max(1024), body: z.string().max(200_000) }), out<Skill>(), 'Create a library skill'),
  'skills.import': m(z.object({ dir: z.string().trim().min(1).max(1024) }), out<Skill>(), 'Copy a skill folder into the library'),
  'skills.update': m(z.object({ id: z.string().min(1).max(200), enabled: z.boolean() }), out<Skill>(), 'Turn a skill on or off'),
  'skills.delete': m(skillById, out<void>(), 'Delete a library skill'),
  'skills.read': m(skillById, out<{ content: string }>(), 'SKILL.md of a skill'),
  // External MCP servers handed to chat runs (blueprint AGENT_BRIDGE/05)
  'mcp.list': m(none, out<McpServer[]>(), 'External MCP servers'),
  'mcp.save': m(mcpSaveParams, out<McpServer>(), 'Add or edit an external MCP server'),
  'mcp.delete': m(z.object({ id: z.string().min(1).max(64) }), out<void>(), 'Remove an external MCP server'),
  'mcp.test': m(z.object({ id: z.string().min(1).max(64) }), out<McpTestResult>(), 'Connect to a server and list its tools'),
  'mcp.importCandidates': m(none, out<McpImportCandidate[]>(), 'Servers found in other agents\' configs'),
  'mcp.import': m(z.object({ source: z.enum(['claude', 'antigravity', 'cursor']), names: z.array(z.string().min(1).max(200)).min(1).max(100) }), out<McpServer[]>(), 'Import servers from another agent\'s config'),
};

export type MethodName = keyof typeof RPC;
/** What a client sends (zod input) and what it gets back. */
export type CoreMethods = { [M in MethodName]: { params: z.input<(typeof RPC)[M]['params']>; result: (typeof RPC)[M]['result'] } };
export type Params<M extends MethodName> = CoreMethods[M]['params'];
export type Result<M extends MethodName> = CoreMethods[M]['result'];
/** What a handler receives: the params after the registry schema parsed them (trimmed, defaults filled). */
export type ParsedParams<M extends MethodName> = z.output<(typeof RPC)[M]['params']>;

export const isMethod = (name: string): name is MethodName => Object.hasOwn(RPC, name);

/** Error code for a request whose params fail the registry schema; the handler is never called. */
export const INVALID_PARAMS = 'INVALID_PARAMS';

/** Checks a request against the registry. A missing params object counts as `{}`. */
export function parseParams<M extends MethodName>(method: M, params: unknown): { ok: true; data: ParsedParams<M> } | { ok: false; message: string } {
  const r = (RPC[method].params as z.ZodType).safeParse(params ?? {});
  if (r.success) return { ok: true, data: r.data as ParsedParams<M> };
  const issues = r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'params'}: ${i.message}`);
  const more = r.error.issues.length > 3 ? ` (+${r.error.issues.length - 3} more)` : '';
  return { ok: false, message: `Invalid params for ${method} — ${issues.join('; ')}${more}` };
}
