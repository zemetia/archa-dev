import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { z } from 'zod';

/*
 * Storage (blueprint STRUCTURE/03): the one place that knows where ArchaDev keeps things on disk, plus
 * the small file primitives every store shares. Node only — no Electron. Stores keep their domain logic
 * and ask this module for paths; a new file or folder gets a named helper here first.
 */

/* ---------------------------------- names --------------------------------- */

/** An id made safe as one path segment (letters, digits, `_`, `-`), at most `max` chars. */
export const safeSegment = (id: string, fallback: string, max = 80) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, max) || fallback;

/* --------------------------- ARCHA_HOME (global) --------------------------- */

/** `~/.archadev`, overridable with ARCHA_HOME (tests must override it). */
export const archaHome = () => process.env.ARCHA_HOME ?? join(homedir(), '.archadev');

/** A custom ARCHA_HOME (dev runs, tests) gets its own pipe, so it never collides with the installed app's core. */
const homeTag = () => (process.env.ARCHA_HOME ? `-${createHash('sha1').update(process.env.ARCHA_HOME).digest('hex').slice(0, 8)}` : '');

const home = (...p: string[]) => join(archaHome(), ...p);

/** Every path under ARCHA_HOME. */
export const paths = {
  home: () => archaHome(),
  /** Running app: socket path + auth token (blueprint ARCHITECTURE/02). */
  runtimeInfo: () => home('runtime', 'core.json'),
  socket: () =>
    process.platform === 'win32' ? `\\\\.\\pipe\\archadev-core-${process.env.USERNAME ?? 'user'}${homeTag()}` : home('runtime', 'core.sock'),
  runtime: () => home('runtime'),
  /** Per chat thread: MCP config, mirrored skills. */
  thread: (threadId: string) => home('runtime', 'threads', safeSegment(threadId, 'doc')),
  /** Data folders of unsaved documents. */
  runtimeData: () => home('runtime', 'data'),
  /** Pre-1.7.3 asset folder of an unsaved document (migrated on open). */
  legacyRuntimeAssets: (docId: string) => home('runtime', 'assets', safeSegment(docId, 'doc')),
  screenshots: () => home('runtime', 'screenshots'),
  /** Staged copies the window may load (archa-asset:// serves runtime/). */
  referenceStage: () => home('runtime', 'reference'),
  /** Agent login profiles — never copied into a project. */
  profiles: () => home('profiles'),
  profile: (agent: string, accountId: string) => home('profiles', agent, accountId),
  accounts: () => home('profiles', 'accounts.json'),
  libraries: () => home('libraries'),
  library: (name: string) => home('libraries', name),
  customIcons: () => home('icons', 'custom.json'),
  globalMemory: () => home('memory'),
  skills: () => home('skills'),
  skillsState: () => home('skills.json'),
  mcpServers: () => home('mcp.json'),
  /** Agent CLI session ids, per machine. */
  chatSessions: () => home('chats', 'sessions.json'),
  /** Pre-0.4.1 chat history, one JSONL per document (migrated into the data folder). */
  legacyChatsDir: () => home('chats'),
  downloads: () => home('downloads'),
  models: () => home('cache', 'models'),
};

/* ------------------------- a document's data folder ------------------------ */

const stem = (filePath: string) => basename(filePath).replace(/\.archa$/i, '');

/** `D:/x/landing.archa` → `D:/x/landing-data`; an unsaved document → ARCHA_HOME/runtime/data/<docId>. */
export function dataDirFor(filePath: string | null, docId: string): string {
  if (filePath) return join(dirname(filePath), `${stem(filePath)}-data`);
  return join(paths.runtimeData(), safeSegment(docId, 'doc'));
}

/** The pre-1.7.3 folder (`<name>-asset/`, or runtime/assets/<docId>) that `migrateDataDir` moves. */
export function legacyAssetDirFor(filePath: string | null, docId: string): string {
  return filePath ? join(dirname(filePath), `${stem(filePath)}-asset`) : paths.legacyRuntimeAssets(docId);
}

/** True for a folder under ARCHA_HOME/runtime/data (an unsaved document's). */
export const isRuntimeDataDir = (dir: string) => !relative(paths.runtimeData(), dir).startsWith('..');

/** Sub-folders of a data folder that are not assets. */
export const DATA_SUBDIRS = ['assets', 'chats', 'skills', 'memory', 'reference'] as const;

/** Paths inside one document's `<name>-data/` folder. */
export const docPaths = (dataDir: string) => ({
  root: () => dataDir,
  /** Where `asset:` references resolve. */
  assets: () => join(dataDir, 'assets'),
  chats: () => join(dataDir, 'chats'),
  chatThread: (threadId: string) => join(dataDir, 'chats', `${safeSegment(threadId, 'thread')}.json`),
  /** Relative to the data folder, as used in `asset:chats/attachments/…` references. */
  attachmentsRef: (threadId: string) => `chats/attachments/${safeSegment(threadId, 'thread')}`,
  attachments: (threadId: string) => join(dataDir, 'chats', 'attachments', safeSegment(threadId, 'thread')),
  skills: () => join(dataDir, 'skills'),
  memory: () => join(dataDir, 'memory'),
  reference: () => join(dataDir, 'reference'),
});

export const assetDirFor = (filePath: string | null, docId: string) => docPaths(dataDirFor(filePath, docId)).assets();

/* -------------------- other tools' folders (read, rarely written) ------------------- */

/** Folders and files that belong to other tools. The host login is always the CLI's own default. */
export const hostToolPaths = {
  claude: () => join(homedir(), '.claude'),
  /** Account record and user MCP servers of the host Claude login. */
  claudeJson: () => join(homedir(), '.claude.json'),
  codex: () => join(homedir(), '.codex'),
  geminiSkills: () => join(homedir(), '.gemini', 'skills'),
  agentsSkills: () => join(homedir(), '.agents', 'skills'),
  agyMcpConfig: () => join(homedir(), '.gemini', 'antigravity', 'mcp_config.json'),
  agyToolSchemas: () => join(homedir(), '.gemini', 'antigravity-cli', 'mcp'),
  cursorMcp: () => join(homedir(), '.cursor', 'mcp.json'),
};

/* ----------------------------- file primitives ---------------------------- */

export function ensureDir(dir: string, mode?: number): string {
  mkdirSync(dir, mode === undefined ? { recursive: true } : { recursive: true, mode });
  return dir;
}

/** Entry names of a folder (optionally filtered); [] when it does not exist or cannot be read. */
export function listDir(dir: string, filter?: (name: string) => boolean): string[] {
  let names: string[];
  try { names = readdirSync(dir); } catch { return []; }
  return filter ? names.filter(filter) : names;
}

/** Any JSON object (other tools' files, loosely read): `readJson(path, anyObject, null)`. */
export const anyObject = z.record(z.string(), z.unknown());

/**
 * Reads a JSON file through a zod schema. A missing file gives `fallback`; unreadable JSON or a schema
 * mismatch also gives `fallback`, and with `quarantine` the bad file is first renamed `<file>.broken-<ts>`
 * so nothing is lost or overwritten.
 */
export function readJson<T>(path: string, schema: z.ZodType<T>, fallback: T, opts: { quarantine?: boolean } = {}): T {
  let text: string;
  try { text = readFileSync(path, 'utf8'); } catch { return fallback; }
  try {
    const r = schema.safeParse(JSON.parse(text));
    if (r.success) return r.data;
  } catch { /* not JSON */ }
  if (opts.quarantine) {
    try { renameSync(path, `${path}.broken-${Date.now()}`); } catch { /* left in place */ }
  }
  return fallback;
}

/** Writes through `<path>.tmp` + rename, so a crash never leaves a torn file. Creates the folder. */
export function writeFileAtomic(path: string, data: string | Buffer, opts: { mode?: number; dirMode?: number } = {}): void {
  ensureDir(dirname(path), opts.dirMode);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data, opts.mode === undefined ? undefined : { mode: opts.mode });
  renameSync(tmp, path);
}

/** JSON, atomically. `indent` 0 writes compact JSON; `newline` adds a trailing `\n`. */
export function writeJsonAtomic(path: string, value: unknown, opts: { indent?: number; newline?: boolean; mode?: number; dirMode?: number } = {}): void {
  const text = JSON.stringify(value, null, opts.indent ?? 2) + (opts.newline ? '\n' : '');
  writeFileAtomic(path, text, opts);
}

/** Appends one JSON value as a line. Creates the folder. */
export function appendJsonl(path: string, value: unknown): void {
  ensureDir(dirname(path));
  appendFileSync(path, `${JSON.stringify(value)}\n`);
}

/** Every parseable line of a JSONL file (torn lines are skipped); [] when it does not exist. */
export function readJsonl(path: string): unknown[] {
  if (!existsSync(path)) return [];
  const out: unknown[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip a torn line */ }
  }
  return out;
}
