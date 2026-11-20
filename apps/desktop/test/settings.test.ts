import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillManager, parseFrontmatter, skillsDir } from '../src/core-host/skills';
import { McpServerManager } from '../src/core-host/mcp-servers';

let root: string;
let changes: number;
const saved: Record<string, string | undefined> = {};
const ENV = ['ARCHA_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'USERPROFILE', 'HOME', 'ARCHA_BUILTIN_SKILLS'];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'archa-settings-'));
  for (const k of ENV) saved[k] = process.env[k];
  process.env.ARCHA_HOME = join(root, 'archa');
  process.env.CLAUDE_CONFIG_DIR = join(root, 'claude');
  process.env.CODEX_HOME = join(root, 'codex');
  process.env.USERPROFILE = root;
  process.env.HOME = root;
  changes = 0;
  delete process.env.ARCHA_BUILTIN_SKILLS;
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  rmSync(root, { recursive: true, force: true });
});

const writeSkill = (dir: string, fm: string, body = 'Do the thing.') => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\n${fm}\n---\n\n${body}\n`);
};

describe('skill frontmatter', () => {
  it('reads plain, quoted and folded values', () => {
    expect(parseFrontmatter('name: a\ndescription: "Use when \\"x\\""')).toEqual({ name: 'a', description: 'Use when "x"' });
    expect(parseFrontmatter("name: 'it''s'\ndescription: >\n  first line\n  second line\nother: z")).toEqual({ name: "it's", description: 'first line second line', other: 'z' });
  });
});

describe('SkillManager', () => {
  it('creates, toggles and deletes library skills, and lists agent skills read-only', () => {
    writeSkill(join(root, '.claude', 'skills', 'review'), 'name: review\ndescription: Reviews code');
    const m = new SkillManager(() => changes++);
    const s = m.create({ name: 'brand', description: 'Brand rules', body: '# Brand' });
    expect(s).toMatchObject({ id: 'archadev:brand', source: 'archadev', enabled: true, description: 'Brand rules' });
    expect(readFileSync(join(skillsDir(), 'brand', 'SKILL.md'), 'utf8')).toContain('description: "Brand rules"');

    const all = m.overview().skills;
    expect(all.map((x) => x.id).sort()).toEqual(['archadev:brand', 'claude:review']);
    expect(all.find((x) => x.source === 'claude')!.enabled).toBe(false);

    expect(m.update({ id: 'archadev:brand', enabled: false }).enabled).toBe(false);
    expect(m.forRun()).toEqual([]);
    m.update({ id: 'archadev:brand', enabled: true });
    expect(m.forRun()).toEqual([join(skillsDir(), 'brand')]);

    expect(() => m.update({ id: 'claude:review', enabled: false })).toThrow(/Only ArchaDev/);
    expect(() => m.delete({ id: 'claude:review' })).toThrow(/Only ArchaDev/);
    m.delete({ id: 'archadev:brand' });
    expect(existsSync(join(skillsDir(), 'brand'))).toBe(false);
    expect(changes).toBe(4);
  });

  it('ships the repo design skills built in: listed, on by default, can be turned off, never deleted', () => {
    // The real skills/ folder the installer bundles: every SKILL.md must parse.
    process.env.ARCHA_BUILTIN_SKILLS = join(__dirname, '..', '..', '..', 'skills');
    const m = new SkillManager(() => changes++);
    const builtin = m.overview().skills.filter((s) => s.source === 'builtin');
    expect(builtin.map((s) => s.name).sort()).toEqual(['design-flows', 'design-pdf', 'design-slides', 'design-website']);
    expect(builtin.every((s) => s.enabled && !s.error && s.description.length > 20)).toBe(true);
    expect(m.forRun()).toHaveLength(4);

    expect(m.update({ id: 'builtin:design-pdf', enabled: false }).enabled).toBe(false);
    expect(m.forRunSkills().map((s) => s.name)).not.toContain('design-pdf');
    expect(m.mention('design-pdf')?.body).toContain('#');
    expect(() => m.delete({ id: 'builtin:design-pdf' })).toThrow(/Only ArchaDev/);

    // A library skill of the same name replaces the built-in one in runs.
    m.create({ name: 'design-website', description: 'Our own website rules', body: '# Ours' });
    const run = m.forRunSkills().filter((s) => s.name === 'design-website');
    expect(run.map((s) => s.source)).toEqual(['archadev']);
    expect(m.mention('design-website')?.description).toBe('Our own website rules');
  });

  it('imports a folder once and rejects bad input', () => {
    const src = join(root, 'elsewhere', 'My Skill');
    writeSkill(src, 'name: my-skill\ndescription: Something');
    const m = new SkillManager(() => changes++);
    expect(m.import({ dir: src }).id).toBe('archadev:my-skill');
    expect(() => m.import({ dir: src })).toThrow(/already exists/);
    expect(() => m.import({ dir: join(root, 'nope') })).toThrow(/no SKILL.md/);
    expect(() => m.create({ name: 'Bad Name', description: 'x', body: '' })).toThrow(/lowercase/);
  });
});

describe('McpServerManager', () => {
  it('stores secrets in the core only and keeps them on edit', () => {
    const m = new McpServerManager(() => changes++);
    const s = m.save({ name: 'gh', transport: 'http', url: 'https://example.com/mcp', headers: [{ key: 'Authorization', value: 'Bearer t0k' }] });
    expect(s.headerKeys).toEqual(['Authorization']);
    expect(JSON.stringify(m.list())).not.toContain('t0k');

    m.save({ id: s.id, name: 'gh', transport: 'http', url: 'https://example.com/v2', headers: [{ key: 'Authorization', value: null }] });
    expect(m.forRun()).toEqual({ gh: { type: 'http', url: 'https://example.com/v2', headers: { Authorization: 'Bearer t0k' } } });

    m.save({ id: s.id, name: 'gh', transport: 'http', url: 'https://example.com/v2', enabled: false });
    expect(m.forRun()).toEqual({});
  });

  it('validates names, transports and URLs', () => {
    const m = new McpServerManager(() => changes++);
    expect(() => m.save({ name: 'archadev', transport: 'stdio', command: 'x' })).toThrow(/ArchaDev's own/);
    expect(() => m.save({ name: 'bad name', transport: 'stdio', command: 'x' })).toThrow();
    expect(() => m.save({ name: 'a', transport: 'stdio' })).toThrow(/command/);
    expect(() => m.save({ name: 'a', transport: 'http', url: 'ftp://x' })).toThrow(/http/);
    m.save({ name: 'a', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: [{ key: 'K', value: 'v' }] });
    expect(() => m.save({ name: 'A', transport: 'stdio', command: 'x' })).toThrow(/already exists/);
    expect(m.forRun()).toEqual({ a: { command: 'npx', args: ['-y', 'pkg'], env: { K: 'v' } } });
  });

  it('imports user-level servers from Claude Code and Antigravity', () => {
    writeFileSync(join(root, '.claude.json'), JSON.stringify({ mcpServers: { pencil: { command: 'pencil', args: ['mcp'] }, web: { type: 'sse', url: 'https://w/sse' } } }));
    mkdirSync(join(root, '.gemini', 'antigravity'), { recursive: true });
    writeFileSync(join(root, '.gemini', 'antigravity', 'mcp_config.json'), JSON.stringify({ mcpServers: { remote: { serverUrl: 'https://r/mcp' } } }));
    const m = new McpServerManager(() => changes++);
    const c = m.importCandidates();
    expect(c.map((x) => `${x.source}:${x.name}:${x.transport}`).sort()).toEqual(['antigravity:remote:http', 'claude:pencil:stdio', 'claude:web:sse']);
    expect(m.import({ source: 'claude', names: ['pencil', 'missing'] }).map((s) => s.name)).toEqual(['pencil']);
    expect(m.importCandidates().find((x) => x.name === 'pencil')!.exists).toBe(true);
  });

  it('reports a server that cannot start', async () => {
    const m = new McpServerManager(() => changes++);
    const s = m.save({ name: 'broken', transport: 'stdio', command: join(root, 'does-not-exist.exe') });
    const r = await m.test({ id: s.id });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(m.list()[0]!.test?.ok).toBe(false);
  });
});
