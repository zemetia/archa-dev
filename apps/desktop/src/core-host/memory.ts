import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentError } from '@archa/core';
import { RPC, type MemoryEntry, type MemoryScope } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import { parse } from './accounts';
import { parseFrontmatter } from './skills';

/*
 * Agent memory (blueprint AGENT_BRIDGE/07). Facts an agent should carry from one chat to the next:
 * the person's taste, a project's brand rules, a lesson from a run that went wrong. Two scopes:
 *   global    ARCHA_HOME/memory/        — every document, every agent
 *   document  <name>-data/memory/       — travels with the `.archa`
 * One Markdown file per fact (frontmatter `name`, `description`, `updatedAt`; the fact as the body), so
 * the person can read and edit them by hand. The newest ones ride along with the first message of a
 * chat; agents add and remove them with the `remember` / `forget` MCP tools.
 */

export const globalMemoryDir = () => join(archaHome(), 'memory');
export const documentMemoryDir = (dataDir: string) => join(dataDir, 'memory');

/** How much memory goes into a first message: enough for the rules that matter, never a context hog. */
const PROMPT_ENTRIES = 40;
const PROMPT_CHARS = 6000;

/** Param schemas live in the RPC registry (packages/protocol/src/rpc.ts). */
export const memoryParams = {
  list: RPC['memory.list'].params,
  remember: RPC['memory.remember'].params,
  forget: RPC['memory.forget'].params,
};

const slugOf = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note';
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export class MemoryStore {
  /** dataDirOf: the document's data folder (null when the document is unknown → global only). */
  constructor(private dataDirOf: (docId?: string) => string | null, private changed: () => void) {}

  private dirOf(scope: MemoryScope, docId?: string): string {
    if (scope === 'global') return globalMemoryDir();
    const data = this.dataDirOf(docId);
    if (!data) throw new DocumentError('NOT_FOUND', 'No document for document memory');
    return documentMemoryDir(data);
  }

  /** Every fact of both scopes, newest first. */
  list(docId?: string): MemoryEntry[] {
    const out = readDir(globalMemoryDir(), 'global');
    const data = this.dataDirOf(docId);
    if (data) out.push(...readDir(documentMemoryDir(data), 'document'));
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Saves a fact; `replaces` (an id) rewrites that one instead of adding a near-duplicate. */
  remember(params: unknown): MemoryEntry {
    const p = parse(memoryParams.remember, params);
    const old = p.replaces ? this.find(p.replaces, p.docId) : null;
    if (old) this.remove(old, p.docId);
    const dir = this.dirOf(p.scope, p.docId);
    mkdirSync(dir, { recursive: true });
    const title = oneLine(p.name || p.text.split(/[.!?\n]/)[0] || p.text).slice(0, 80);
    let slug = slugOf(title);
    for (let i = 2; existsSync(join(dir, `${slug}.md`)); i++) slug = `${slugOf(title)}-${i}`;
    const now = Date.now();
    const file = join(dir, `${slug}.md`);
    writeFileSync(`${file}.tmp`, `---\nname: ${JSON.stringify(title)}\nupdatedAt: ${now}\n---\n\n${p.text.trim()}\n`);
    renameSync(`${file}.tmp`, file);
    this.changed();
    return { id: `${p.scope}:${slug}`, scope: p.scope, name: title, text: p.text.trim(), updatedAt: now, file };
  }

  forget(params: unknown): MemoryEntry {
    const p = parse(memoryParams.forget, params);
    const hit = this.find(p.id, p.docId);
    if (!hit) throw new DocumentError('NOT_FOUND', `No memory ${p.id}`);
    this.remove(hit, p.docId);
    this.changed();
    return hit;
  }

  /** The block that rides along with a chat's first message; empty when there is nothing to remember. */
  forPrompt(docId?: string): string {
    const all = this.list(docId);
    if (!all.length) return '';
    const lines: string[] = [];
    let used = 0;
    for (const m of all.slice(0, PROMPT_ENTRIES)) {
      const line = `- [${m.id}] ${oneLine(m.text).slice(0, 400)}`;
      if (used + line.length > PROMPT_CHARS) break;
      lines.push(line);
      used += line.length;
    }
    const more = all.length - lines.length;
    return [
      'Memory — what earlier chats asked you to keep (global = every document, document = this one). Follow it unless the request says otherwise:',
      ...lines,
      ...(more > 0 ? [`(${more} older ${more === 1 ? 'fact is' : 'facts are'} not shown)`] : []),
    ].join('\n');
  }

  private find(id: string, docId?: string): MemoryEntry | null {
    return this.list(docId).find((m) => m.id === id) ?? null;
  }

  private remove(m: MemoryEntry, docId?: string) {
    rmSync(join(this.dirOf(m.scope, docId), `${m.id.slice(m.scope.length + 1)}.md`), { force: true });
  }
}

function readDir(dir: string, scope: MemoryScope): MemoryEntry[] {
  let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return []; }
  const out: MemoryEntry[] = [];
  for (const f of files) {
    const file = join(dir, f);
    let text: string;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    const fm = m ? parseFrontmatter(m[1]!) : {};
    const body = (m ? text.slice(m[0].length) : text).trim();
    if (!body) continue;
    // A hand-written file may have no updatedAt: its modification time stands in.
    let updatedAt = Number(fm.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) { try { updatedAt = statSync(file).mtimeMs; } catch { updatedAt = 0; } }
    out.push({ id: `${scope}:${f.slice(0, -3)}`, scope, name: fm.name || f.slice(0, -3), text: body, updatedAt, file });
  }
  return out;
}
