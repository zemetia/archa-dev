import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { DocumentError } from '@archa/core';
import { RPC, type Skill, type SkillSource, type SkillsOverview } from '@archa/protocol';
import { paths, hostToolPaths, anyObject, readJson, writeJsonAtomic, listDir } from '@archa/protocol/node';
import { parse } from './accounts';

/*
 * Settings → Skills (blueprint AGENT_BRIDGE/05). A skill is a folder with a SKILL.md
 * (YAML frontmatter `name` + `description`, then instructions). ArchaDev keeps its own library in
 * ~/.archadev/skills, ships built-in design skills (repo `skills/`, path from ARCHA_BUILTIN_SKILLS),
 * and hands the enabled ones of both to chat runs; skills the agent CLIs already load on their own
 * (~/.claude/skills, ~/.codex/skills, …) are listed read-only. A document can carry its own skills in
 * `<name>-data/skills/`: they are always on for that document's chats and win over a same-named one.
 */

export const skillsDir = paths.skills;
/** Built-in skills: resources/skills in the installed app, the repo's skills/ in dev (set by main). */
export const builtinSkillsDir = () => process.env.ARCHA_BUILTIN_SKILLS ?? '';
const stateFile = paths.skillsState;

const SOURCES: Array<{ source: SkillSource; label: string; dir: () => string }> = [
  { source: 'archadev', label: 'ArchaDev library', dir: skillsDir },
  { source: 'builtin', label: 'ArchaDev built-in', dir: builtinSkillsDir },
  { source: 'claude', label: 'Claude Code', dir: () => join(hostToolPaths.claude(), 'skills') },
  { source: 'codex', label: 'Codex', dir: () => join(hostToolPaths.codex(), 'skills') },
  { source: 'gemini', label: 'Antigravity / Gemini', dir: hostToolPaths.geminiSkills },
  { source: 'agents', label: 'Shared (~/.agents)', dir: hostToolPaths.agentsSkills },
];

/** Param schemas live in the RPC registry (packages/protocol/src/rpc.ts). */
export const skillParams = {
  create: RPC['skills.create'].params,
  import: RPC['skills.import'].params,
  update: RPC['skills.update'].params,
  byId: RPC['skills.read'].params,
  readForAgent: RPC['agent.readSkill'].params,
};

type State = { version: 1; disabled: string[] };
/** Longest SKILL.md body sent with a message; longer skills are cut and the agent is pointed at the file. */
const MAX_MENTION = 40_000;
/** read_skill: longest text returned and files listed. Text only — the agent has no other way to open the rest. */
const MAX_SKILL_FILE = 120_000;
const MAX_LISTED = 80;
const TEXT_EXT = new Set(['', '.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml', '.csv', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.ps1', '.sh', '.svg', '.xml']);
/** Mentions and read_skill look a name up in this order. */
const LOOKUP: SkillSource[] = ['document', 'archadev', 'builtin', 'claude', 'agents', 'codex', 'gemini'];

export class SkillManager {
  constructor(private changed: () => void) {}

  /** docSkills: the open document's `<name>-data/skills/` folder, when there is one. */
  overview(docSkills?: string): SkillsOverview {
    const disabled = new Set(this.state().disabled);
    const skills: Skill[] = [];
    if (docSkills) {
      for (const folder of listDirs(docSkills)) {
        const meta = readSkill(join(docSkills, folder));
        if (meta) skills.push({ id: `document:${folder}`, name: meta.name || folder, description: meta.description, source: 'document', dir: join(docSkills, folder), enabled: true, error: meta.error });
      }
    }
    for (const s of SOURCES) {
      const dir = s.dir();
      if (!dir) continue;
      for (const folder of listDirs(dir)) {
        const meta = readSkill(join(dir, folder));
        if (!meta) continue;
        skills.push({
          id: `${s.source}:${folder}`, name: meta.name || folder, description: meta.description, source: s.source,
          dir: join(dir, folder), enabled: s.source === 'archadev' ? !disabled.has(folder) : s.source === 'builtin' && !disabled.has(`builtin:${folder}`), error: meta.error,
        });
      }
    }
    const sources = SOURCES.map((s) => ({ source: s.source, label: s.label, dir: s.dir(), exists: !!s.dir() && existsSync(s.dir()) }));
    if (docSkills) sources.unshift({ source: 'document', label: 'This document', dir: docSkills, exists: existsSync(docSkills) });
    return { skills, libraryDir: skillsDir(), sources };
  }

  create(params: unknown): Skill {
    const p = parse(skillParams.create, params);
    const dir = join(skillsDir(), p.name);
    if (existsSync(dir)) throw new DocumentError('CONFLICT', `A skill named "${p.name}" already exists`);
    mkdirSync(dir, { recursive: true });
    const body = p.body.trim() || `# ${p.name}\n\nDescribe when and how the agent should use this skill.`;
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${p.name}\ndescription: ${yamlString(p.description)}\n---\n\n${body}\n`);
    this.changed();
    return this.get(`archadev:${p.name}`);
  }

  import(params: unknown): Skill {
    const { dir } = parse(skillParams.import, params);
    const from = resolve(dir);
    if (!existsSync(join(from, 'SKILL.md'))) throw new DocumentError('VALIDATION', 'That folder has no SKILL.md');
    if (from.toLowerCase().startsWith(resolve(skillsDir()).toLowerCase())) throw new DocumentError('VALIDATION', 'That folder is already in the ArchaDev library');
    const meta = readSkill(from);
    const folder = (meta?.name || basename(from)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill';
    const to = join(skillsDir(), folder);
    if (existsSync(to)) throw new DocumentError('CONFLICT', `A skill named "${folder}" already exists in the ArchaDev library`);
    mkdirSync(skillsDir(), { recursive: true });
    cpSync(from, to, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git)$/.test(src) });
    this.changed();
    return this.get(`archadev:${folder}`);
  }

  update(params: unknown): Skill {
    const { id, enabled } = parse(skillParams.update, params);
    // Built-in skills can be turned off (never deleted); they share the disabled list under a prefix.
    const folder = id.startsWith('builtin:') ? `builtin:${this.builtinFolder(id)}` : this.libraryFolder(id);
    const st = this.state();
    st.disabled = st.disabled.filter((f) => f !== folder);
    if (!enabled) st.disabled.push(folder);
    this.save(st);
    this.changed();
    return this.get(id);
  }

  delete(params: unknown) {
    const { id } = parse(skillParams.byId, params);
    const folder = this.libraryFolder(id);
    rmSync(join(skillsDir(), folder), { recursive: true, force: true });
    const st = this.state();
    st.disabled = st.disabled.filter((f) => f !== folder);
    this.save(st);
    this.changed();
  }

  read(params: unknown, docSkills?: string): { content: string } {
    const { id } = parse(skillParams.byId, params);
    const skill = this.get(id, docSkills);
    return { content: readFileSync(join(skill.dir, 'SKILL.md'), 'utf8').slice(0, 200_000) };
  }

  /**
   * A skill the person named with `/name` in a chat message, from any source (the ArchaDev library
   * first). Its instructions ride along with that message, so every agent CLI can follow it.
   */
  mention(name: string, docSkills?: string): { name: string; description: string; dir: string; body: string } | null {
    const hit = this.lookup(name, docSkills);
    if (!hit) return null;
    let text: string;
    try { text = readFileSync(join(hit.dir, 'SKILL.md'), 'utf8'); } catch { return null; }
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    return { name: hit.name, description: hit.description, dir: hit.dir, body: body.length > MAX_MENTION ? `${body.slice(0, MAX_MENTION)}\n… (truncated — read the rest with read_skill)` : body };
  }

  /**
   * MCP `read_skill` (blueprint AGENT_BRIDGE/05): a skill's SKILL.md plus the list of its files, or one
   * text file inside its folder — served by the core, so every agent CLI can use a skill and its
   * references without file tools. Same lookup as a mention. Never reads outside the skill folder.
   */
  readForAgent(params: unknown, docSkills?: string): string {
    const p = parse(skillParams.readForAgent, params);
    const hit = this.lookup(p.name, docSkills);
    if (!hit) {
      const want = p.name.replace(/^\//, '').toLowerCase();
      const close = this.overview(docSkills).skills.filter((s) => !s.error && (s.name.toLowerCase().includes(want) || s.description.toLowerCase().includes(want))).map((s) => s.name);
      throw new DocumentError('NOT_FOUND', `No skill "${p.name}".${close.length ? ` Close: ${[...new Set(close)].slice(0, 6).join(', ')}` : ''}`);
    }
    const files = listFiles(hit.dir);
    if (!p.file) {
      const others = files.filter((f) => f !== 'SKILL.md');
      const list = others.length
        ? [``, `Files in this skill — read one with read_skill { name: "${hit.name}", file: "<path>" }:`, ...others.slice(0, MAX_LISTED).map((f) => `- ${f}`), ...(others.length > MAX_LISTED ? [`… ${others.length - MAX_LISTED} more`] : [])]
        : [];
      return [`Skill ${hit.name} (${hit.source})`, '', clip(readFileSync(join(hit.dir, 'SKILL.md'), 'utf8')), ...list].join('\n');
    }
    const root = resolve(hit.dir);
    const back = relative(root, resolve(root, p.file)).replace(/\\/g, '/');
    if (!back || back.startsWith('..') || isAbsolute(back)) throw new DocumentError('VALIDATION', `"${p.file}" is outside the skill folder`);
    if (!files.includes(back)) throw new DocumentError('NOT_FOUND', `No file "${p.file}" in skill ${hit.name}. Files: ${files.slice(0, 30).join(', ')}`);
    if (!TEXT_EXT.has(extname(back).toLowerCase())) throw new DocumentError('VALIDATION', `"${p.file}" is not a text file — read_skill returns text only`);
    return `${hit.name}/${back}\n\n${clip(readFileSync(join(root, back), 'utf8'))}`;
  }

  /** A readable skill by name or folder name, from any source (`LOOKUP` order). */
  private lookup(name: string, docSkills?: string): Skill | null {
    const want = name.replace(/^\//, '').toLowerCase();
    return this.overview(docSkills).skills
      .filter((s) => !s.error && (s.name.toLowerCase() === want || basename(s.dir).toLowerCase() === want))
      .sort((a, b) => LOOKUP.indexOf(a.source) - LOOKUP.indexOf(b.source))[0] ?? null;
  }

  /**
   * Skill folders for a chat run: the document's own, then enabled library and built-in ones. A skill
   * replaces any same-named one further down that list (document > library > built-in).
   */
  forRun(docSkills?: string): string[] {
    return this.forRunSkills(docSkills).map((s) => s.dir);
  }

  forRunSkills(docSkills?: string): Skill[] {
    const rank: Partial<Record<SkillSource, number>> = { document: 0, archadev: 1, builtin: 2 };
    const on = this.overview(docSkills).skills
      .filter((s) => rank[s.source] !== undefined && s.enabled && !s.error)
      .sort((a, b) => rank[a.source]! - rank[b.source]!);
    const seen = new Set<string>();
    return on.filter((s) => !seen.has(s.name.toLowerCase()) && !!seen.add(s.name.toLowerCase()));
  }

  private get(id: string, docSkills?: string): Skill {
    const s = this.overview(docSkills).skills.find((x) => x.id === id);
    if (!s) throw new DocumentError('NOT_FOUND', `No skill ${id}`);
    return s;
  }

  private builtinFolder(id: string): string {
    const folder = id.slice('builtin:'.length);
    if (!folder || !builtinSkillsDir() || !existsSync(join(builtinSkillsDir(), folder, 'SKILL.md'))) throw new DocumentError('NOT_FOUND', `No skill ${id}`);
    return folder;
  }

  private libraryFolder(id: string): string {
    const [source, folder] = id.split(':');
    if (source !== 'archadev' || !folder) throw new DocumentError('VALIDATION', 'Only ArchaDev library skills can be changed here');
    if (!existsSync(join(skillsDir(), folder, 'SKILL.md'))) throw new DocumentError('NOT_FOUND', `No skill ${id}`);
    return folder;
  }

  private state(): State {
    const j = readJson(stateFile(), anyObject, null);
    return { version: 1, disabled: Array.isArray(j?.disabled) ? j.disabled.filter((d): d is string => typeof d === 'string') : [] };
  }

  private save(st: State) {
    writeJsonAtomic(stateFile(), st);
  }
}

function listDirs(dir: string): string[] {
  return listDir(dir, (f) => !f.startsWith('.') && isDir(join(dir, f))).sort();
}

/** Files of a skill folder, relative with `/`, without dot folders and node_modules (at most 500). */
function listFiles(dir: string, sub = '', out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(join(dir, sub)).sort(); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules' || out.length >= 500) continue;
    const rel = sub ? `${sub}/${e}` : e;
    if (isDir(join(dir, rel))) listFiles(dir, rel, out);
    else out.push(rel);
  }
  return out;
}

const clip = (text: string) => (text.length > MAX_SKILL_FILE ? `${text.slice(0, MAX_SKILL_FILE)}\n… (cut at ${MAX_SKILL_FILE} characters)` : text);

function isDir(p: string) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/** Reads `name` and `description` from SKILL.md frontmatter. null = not a skill folder. */
export function readSkill(dir: string): { name: string; description: string; error?: string } | null {
  let text: string;
  try { text = readFileSync(join(dir, 'SKILL.md'), 'utf8'); } catch { return null; }
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { name: '', description: '', error: 'SKILL.md has no frontmatter' };
  const fm = parseFrontmatter(m[1]!);
  return { name: fm.name ?? '', description: fm.description ?? '', error: fm.description ? undefined : 'SKILL.md has no description' };
}

/** Just enough YAML for top-level scalar keys: plain, quoted, and `>` / `|` blocks. */
export function parseFrontmatter(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    const key = kv[1]!;
    let value = kv[2]!.trim();
    if (/^[>|][+-]?$/.test(value)) {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || lines[i + 1]!.trim() === '')) block.push(lines[++i]!.trim());
      value = value.startsWith('>') ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else if (/^".*"$/.test(value)) {
      try { value = JSON.parse(value) as string; } catch { value = value.slice(1, -1); }
    } else if (/^'.*'$/.test(value)) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    out[key] = value;
  }
  return out;
}

const yamlString = (s: string) => JSON.stringify(s.replace(/\s+/g, ' ').trim());
