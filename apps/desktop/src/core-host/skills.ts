import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { DocumentError } from '@archa/core';
import type { Skill, SkillSource, SkillsOverview } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import { claudeHostDir, codexHostDir, parse } from './accounts';

/*
 * Settings → Skills (blueprint AGENT_BRIDGE/05). A skill is a folder with a SKILL.md
 * (YAML frontmatter `name` + `description`, then instructions). ArchaDev keeps its own library in
 * ~/.archadev/skills and hands the enabled ones to chat runs; skills the agent CLIs already load
 * on their own (~/.claude/skills, ~/.codex/skills, …) are listed read-only.
 */

export const skillsDir = () => join(archaHome(), 'skills');
const stateFile = () => join(archaHome(), 'skills.json');

const SOURCES: Array<{ source: SkillSource; label: string; dir: () => string }> = [
  { source: 'archadev', label: 'ArchaDev library', dir: skillsDir },
  { source: 'claude', label: 'Claude Code', dir: () => join(claudeHostDir(), 'skills') },
  { source: 'codex', label: 'Codex', dir: () => join(codexHostDir(), 'skills') },
  { source: 'gemini', label: 'Antigravity / Gemini', dir: () => join(homedir(), '.gemini', 'skills') },
  { source: 'agents', label: 'Shared (~/.agents)', dir: () => join(homedir(), '.agents', 'skills') },
];

const slug = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes');
export const skillParams = {
  create: z.object({ name: slug, description: z.string().trim().min(1).max(1024), body: z.string().max(200_000) }),
  import: z.object({ dir: z.string().trim().min(1).max(1024) }),
  update: z.object({ id: z.string().min(1).max(200), enabled: z.boolean() }),
  byId: z.object({ id: z.string().min(1).max(200) }),
};

type State = { version: 1; disabled: string[] };

export class SkillManager {
  constructor(private changed: () => void) {}

  overview(): SkillsOverview {
    const disabled = new Set(this.state().disabled);
    const skills: Skill[] = [];
    for (const s of SOURCES) {
      const dir = s.dir();
      for (const folder of listDirs(dir)) {
        const meta = readSkill(join(dir, folder));
        if (!meta) continue;
        skills.push({
          id: `${s.source}:${folder}`, name: meta.name || folder, description: meta.description, source: s.source,
          dir: join(dir, folder), enabled: s.source === 'archadev' && !disabled.has(folder), error: meta.error,
        });
      }
    }
    return { skills, libraryDir: skillsDir(), sources: SOURCES.map((s) => ({ source: s.source, label: s.label, dir: s.dir(), exists: existsSync(s.dir()) })) };
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
    const folder = this.libraryFolder(id);
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

  read(params: unknown): { content: string } {
    const { id } = parse(skillParams.byId, params);
    const skill = this.get(id);
    return { content: readFileSync(join(skill.dir, 'SKILL.md'), 'utf8').slice(0, 200_000) };
  }

  /** Enabled library skill folders, for a chat run. */
  forRun(): string[] {
    return this.overview().skills.filter((s) => s.source === 'archadev' && s.enabled && !s.error).map((s) => s.dir);
  }

  private get(id: string): Skill {
    const s = this.overview().skills.find((x) => x.id === id);
    if (!s) throw new DocumentError('NOT_FOUND', `No skill ${id}`);
    return s;
  }

  private libraryFolder(id: string): string {
    const [source, folder] = id.split(':');
    if (source !== 'archadev' || !folder) throw new DocumentError('VALIDATION', 'Only ArchaDev library skills can be changed here');
    if (!existsSync(join(skillsDir(), folder, 'SKILL.md'))) throw new DocumentError('NOT_FOUND', `No skill ${id}`);
    return folder;
  }

  private state(): State {
    try {
      const j = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<State>;
      return { version: 1, disabled: Array.isArray(j.disabled) ? j.disabled.filter((d): d is string => typeof d === 'string') : [] };
    } catch {
      return { version: 1, disabled: [] };
    }
  }

  private save(st: State) {
    mkdirSync(archaHome(), { recursive: true });
    writeFileSync(stateFile(), JSON.stringify(st, null, 2));
  }
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => !f.startsWith('.') && isDir(join(dir, f))).sort();
  } catch {
    return [];
  }
}

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
