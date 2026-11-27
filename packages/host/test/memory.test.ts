import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newHost } from './helpers';
import { globalMemoryDir, MemoryStore } from '@archa/agents';
import { SkillManager } from '@archa/agents';

/* Agent memory and document skills (blueprint AGENT_BRIDGE/07, AGENT_BRIDGE/05). */

let home: string;
let work: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-memory-'));
  work = mkdtempSync(join(tmpdir(), 'archa-work-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  delete process.env.ARCHA_BUILTIN_SKILLS;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const conn = { author: { kind: 'user', id: 'u' } } as never;
const call = <T>(ws: ReturnType<typeof newHost>, method: string, params: unknown): Promise<T> =>
  Promise.resolve((ws.handlers as unknown as Record<string, (p: unknown, c: unknown) => T>)[method]!(params, conn));

describe('memory', () => {
  it('keeps global facts in ARCHA_HOME/memory and document facts in <name>-data/memory', () => {
    const data = join(work, 'brand-data');
    const changes: number[] = [];
    const mem = new MemoryStore(() => data, () => changes.push(1));
    const g = mem.remember({ scope: 'global', text: 'No small labels above headings.' });
    const d = mem.remember({ scope: 'document', text: 'Brand green is #1f5e3b.', name: 'Brand colour' });
    expect(g.id).toBe('global:no-small-labels-above-headings');
    expect(d.id).toBe('document:brand-colour');
    expect(existsSync(join(globalMemoryDir(), 'no-small-labels-above-headings.md'))).toBe(true);
    expect(readFileSync(join(data, 'memory', 'brand-colour.md'), 'utf8')).toContain('Brand green is #1f5e3b.');
    expect(mem.list().map((m) => m.id).sort()).toEqual([d.id, g.id].sort());
    expect(changes).toHaveLength(2);
  });

  it('rewrites a fact with replaces, forgets one, and reads hand-written files', () => {
    const data = join(work, 'x-data');
    const mem = new MemoryStore(() => data, () => undefined);
    const a = mem.remember({ scope: 'global', text: 'Radius 8.', name: 'radius' });
    mem.remember({ scope: 'global', text: 'Radius 12 everywhere.', name: 'radius', replaces: a.id });
    expect(mem.list().map((m) => m.text)).toEqual(['Radius 12 everywhere.']);
    mkdirSync(join(data, 'memory'), { recursive: true });
    writeFileSync(join(data, 'memory', 'tone.md'), 'Copy stays in Bahasa Indonesia.\n');
    expect(mem.list().find((m) => m.id === 'document:tone')?.text).toBe('Copy stays in Bahasa Indonesia.');
    mem.forget({ id: 'document:tone' });
    expect(mem.list().some((m) => m.id === 'document:tone')).toBe(false);
    expect(() => mem.forget({ id: 'global:nope' })).toThrow(/No memory/);
    expect(() => mem.remember({ scope: 'global', text: '  ' })).toThrow();
  });

  it('gives the first message a capped list, and nothing when empty', () => {
    const mem = new MemoryStore(() => null, () => undefined);
    expect(mem.forPrompt()).toBe('');
    for (let i = 0; i < 50; i++) mem.remember({ scope: 'global', text: `Fact number ${i}.`, name: `f${i}` });
    const block = mem.forPrompt();
    expect(block).toMatch(/^Memory — /);
    expect(block.split('\n').filter((l) => l.startsWith('- [')).length).toBe(40);
    expect(block).toContain('10 older facts are not shown');
    expect(() => mem.remember({ scope: 'document', text: 'x' })).toThrow(/No document/);
  });

  it('is reachable over RPC for the open document', async () => {
    const ws = newHost();
    const docId = ws.ctx.summaries()[0]!.id;
    await call(ws, 'doc.save', { docId, path: join(work, 'site.archa') });
    const m = await call<{ id: string; file: string }>(ws, 'memory.remember', { docId, scope: 'document', text: 'Hero photo is always full-bleed.' });
    expect(m.file.startsWith(join(work, 'site-data', 'memory'))).toBe(true);
    expect((await call<Array<{ id: string }>>(ws, 'memory.list', { docId })).map((x) => x.id)).toEqual([m.id]);
    expect(ws.memory.forPrompt(docId)).toContain('Hero photo is always full-bleed.');
    await call(ws, 'memory.forget', { docId, id: m.id });
    expect(await call<unknown[]>(ws, 'memory.list', { docId })).toEqual([]);
  });
});

describe('document skills', () => {
  const skill = (dir: string, name: string, description: string) => {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\nBody of ${name}.\n`);
  };

  it('are on for the document and win over a same-named library or built-in skill', () => {
    const builtin = join(work, 'builtin');
    process.env.ARCHA_BUILTIN_SKILLS = builtin;
    skill(builtin, 'design-website', 'built-in version');
    skill(join(home, 'skills'), 'brand-voice', 'library version');
    const docSkills = join(work, 'site-data', 'skills');
    skill(docSkills, 'brand-voice', 'document version');
    const mgr = new SkillManager(() => undefined);
    const run = mgr.forRunSkills(docSkills);
    expect(run.map((s) => `${s.source}:${s.name}`)).toEqual(['document:brand-voice', 'builtin:design-website']);
    expect(mgr.forRunSkills().map((s) => s.source)).toEqual(['archadev', 'builtin']);
    expect(mgr.mention('brand-voice', docSkills)?.description).toBe('document version');
    expect(mgr.overview(docSkills).sources[0]).toMatchObject({ source: 'document', dir: docSkills, exists: true });
  });

  it('read_skill serves SKILL.md with its file list, one text file, and nothing outside the folder', () => {
    const docSkills = join(work, 'site-data', 'skills');
    skill(docSkills, 'brand-voice', 'document version');
    mkdirSync(join(docSkills, 'brand-voice', 'references'), { recursive: true });
    writeFileSync(join(docSkills, 'brand-voice', 'references', 'tone.md'), 'Warm, short sentences.');
    writeFileSync(join(docSkills, 'brand-voice', 'logo.png'), Buffer.from([0x89, 0x50]));
    writeFileSync(join(work, 'site-data', 'secret.txt'), 'nope');
    const mgr = new SkillManager(() => undefined);
    const main = mgr.readForAgent({ name: 'brand-voice' }, docSkills);
    expect(main).toContain('Body of brand-voice.');
    expect(main).toContain('- references/tone.md');
    expect(mgr.readForAgent({ name: '/brand-voice', file: 'references\\tone.md' }, docSkills)).toContain('Warm, short sentences.');
    expect(() => mgr.readForAgent({ name: 'brand-voice', file: '../../secret.txt' }, docSkills)).toThrow(/outside the skill folder/);
    expect(() => mgr.readForAgent({ name: 'brand-voice', file: 'logo.png' }, docSkills)).toThrow(/not a text file/);
    expect(() => mgr.readForAgent({ name: 'brand-voice', file: 'missing.md' }, docSkills)).toThrow(/No file/);
    expect(() => mgr.readForAgent({ name: 'brand' }, docSkills)).toThrow(/Close: brand-voice/);
  });

  it('read_skill is reachable over RPC for the open document', async () => {
    const ws = newHost();
    const docId = ws.ctx.summaries()[0]!.id;
    await call(ws, 'doc.save', { docId, path: join(work, 'shop.archa') });
    skill(join(work, 'shop-data', 'skills'), 'shop-rules', 'rules for the shop');
    const r = await call<{ text: string }>(ws, 'agent.readSkill', { docId, name: 'shop-rules' });
    expect(r.text).toContain('Body of shop-rules.');
  });
});
