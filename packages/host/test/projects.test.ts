import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertOpsFor } from '@archa/core';
import type { AppSettings, DocSummary, ProjectFile } from '@archa/protocol';
import type { Host } from '../src';
import { backupFile, contextKey, freeDesignPath, projectRoot } from '../src/projects';
import { newHost } from './helpers';

/* Projects (`.design/`), per-window restore, backups and auto-save (blueprint FILE_FORMATS/02, ENTRY_POINTS/01). */

const user = { kind: 'user' as const, id: 'u' };
let home: string;
let work: string;
let hosts: Host[] = [];
/** A host that serves app windows (restore, backups, auto-save). */
const appHost = () => { const h = newHost({ windows: true }); hosts.push(h); return h; };
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-projects-'));
  work = mkdtempSync(join(tmpdir(), 'archa-site-'));
  process.env.ARCHA_HOME = home;
});
afterEach(async () => {
  for (const h of hosts) await h.shutdown();
  hosts = [];
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const conn = { author: user } as never;
const call = async <T>(ws: Host, method: string, params?: unknown): Promise<T> =>
  (ws.handlers as unknown as Record<string, (p: unknown, c: unknown) => T>)[method]!(params, conn);

function edit(ws: Host, docId: string) {
  const s = ws.ctx.session(docId);
  const { ops } = insertOpsFor({ type: 'rect', name: 'Box', width: 10, height: 10 } as never, s.doc.pages[0]!.rootId);
  s.apply({ author: user, label: 'add', baseRevision: s.revision, ops });
}
const docsOf = (ws: Host, project: string | null) => ws.ctx.summaries().filter((d) => contextKey(d.project) === contextKey(project));

describe('project folders', () => {
  it('a folder opened as a project gets .design/, and an untitled design saves there without a path', async () => {
    const ws = appHost();
    const { active } = await call<{ active: string }>(ws, 'workspace.restore', { project: work });
    expect(existsSync(join(work, '.design'))).toBe(true);
    expect(docsOf(ws, work).map((d) => d.id)).toEqual([active]);
    edit(ws, active);
    const { path } = await call<{ path: string }>(ws, 'doc.save', { docId: active });
    expect(path).toBe(join(work, '.design', 'Untitled.archa'));
    // A second untitled design gets a free name.
    const { docId } = await call<{ docId: string }>(ws, 'doc.new', { project: work });
    edit(ws, docId);
    expect((await call<{ path: string }>(ws, 'doc.save', { docId })).path).toBe(join(work, '.design', 'Untitled 2.archa'));
    const files = await call<ProjectFile[]>(ws, 'project.files', { project: work });
    expect(files.map((f) => f.name).sort()).toEqual(['Untitled', 'Untitled 2']);
    expect(files.every((f) => f.docId)).toBe(true);
  });

  it('a public untitled design still asks for a path', async () => {
    const ws = appHost();
    const { active } = await call<{ active: string }>(ws, 'workspace.restore', { project: null });
    await expect(call(ws, 'doc.save', { docId: active })).rejects.toThrow(/No file path/);
  });

  it('opening a project the first time shows its newest design', async () => {
    const first = appHost();
    const { active } = await call<{ active: string }>(first, 'workspace.restore', { project: work });
    edit(first, active);
    await call(first, 'doc.save', { docId: active });
    rmSync(join(home, 'runtime', 'open-files.json'), { force: true });
    const ws = appHost();
    await call(ws, 'workspace.restore', { project: join(work, '.design') });
    expect(docsOf(ws, work).map((d) => d.filePath)).toEqual([join(work, '.design', 'Untitled.archa')]);
  });

  it('closing the last document of a window leaves a new one in the same context', async () => {
    const ws = appHost();
    const { active } = await call<{ active: string }>(ws, 'workspace.restore', { project: work });
    await call(ws, 'workspace.restore', { project: null });
    await call(ws, 'doc.close', { docId: active });
    expect(docsOf(ws, work)).toHaveLength(1);
    expect(docsOf(ws, work)[0]!.id).not.toBe(active);
    expect(docsOf(ws, null)).toHaveLength(1);
  });

  it('projectRoot and freeDesignPath', () => {
    expect(projectRoot(join(work, '.design'))).toBe(work);
    expect(projectRoot(`${work}\\`)).toBe(work);
    mkdirSync(join(work, '.design'));
    writeFileSync(join(work, '.design', 'Home.archa'), '');
    expect(freeDesignPath(work, 'Home')).toBe(join(work, '.design', 'Home 2.archa'));
    expect(freeDesignPath(work, 'a/b:c')).toBe(join(work, '.design', 'a-b-c.archa'));
  });
});

describe('restore', () => {
  it('reopens public files and unsaved untitled work after a restart', async () => {
    const ws = appHost();
    const { active } = await call<{ active: string }>(ws, 'workspace.restore', { project: null });
    edit(ws, active);
    const saved = (await call<{ path: string }>(ws, 'doc.save', { docId: active, path: join(work, 'landing.archa') })).path;
    const { docId: draft } = await call<{ docId: string }>(ws, 'doc.new', { project: null });
    edit(ws, draft);
    await ws.files.flush();
    expect(existsSync(backupFile(draft))).toBe(true);

    const next = appHost();
    await call(next, 'workspace.restore', { project: null });
    const docs = docsOf(next, null);
    expect(docs.map((d) => d.filePath)).toEqual([saved, null]);
    expect(docs[1]).toMatchObject({ id: draft, dirty: true });
    expect(next.ctx.session(draft).doc.toData()).toEqual(ws.ctx.session(draft).doc.toData());
  });

  it('keeps each context to its own files, and a closed untitled draft loses its backup', async () => {
    const ws = appHost();
    const pub = (await call<{ active: string }>(ws, 'workspace.restore', { project: null })).active;
    const proj = (await call<{ active: string }>(ws, 'workspace.restore', { project: work })).active;
    edit(ws, pub);
    edit(ws, proj);
    await ws.files.flush();
    expect(existsSync(join(work, '.design', 'Untitled.archa'))).toBe(true);
    expect(existsSync(backupFile(pub))).toBe(true);
    await call(ws, 'doc.close', { docId: pub });
    ws.files.persist();
    expect(existsSync(backupFile(pub))).toBe(false);

    const next = appHost();
    await call(next, 'workspace.restore', { project: work });
    expect(docsOf(next, work).map((d) => d.filePath)).toEqual([join(work, '.design', 'Untitled.archa')]);
    expect(docsOf(next, null)).toHaveLength(0);
  });

  it('without auto-save, unsaved edits to a file come back from a backup', async () => {
    const ws = appHost();
    await call(ws, 'settings.set', { autosave: { enabled: false, seconds: 45 } });
    const { active } = await call<{ active: string }>(ws, 'workspace.restore', { project: null });
    const path = (await call<{ path: string }>(ws, 'doc.save', { docId: active, path: join(work, 'a.archa') })).path;
    const before = readFileSync(path);
    edit(ws, active);
    await ws.files.flush();
    expect(readFileSync(path).equals(before)).toBe(true);
    const next = appHost();
    await call(next, 'workspace.restore', { project: null });
    const [doc] = docsOf(next, null);
    expect(doc).toMatchObject({ filePath: path, dirty: true });
    expect(next.ctx.session(doc!.id).doc.toData()).toEqual(ws.ctx.session(active).doc.toData());
  });
});

describe('auto-save', () => {
  it('saves dirty documents when an agent finishes and on demand; backs up public untitled ones', async () => {
    const ws = appHost();
    const { active } = await call<{ active: string }>(ws, 'workspace.restore', { project: work });
    edit(ws, active);
    ws.ctx.broadcast('chat.run', { runId: 'r', docId: active, threadId: 't', agent: 'claude', persona: 'Ada', status: 'finished' });
    await new Promise((r) => setTimeout(r, 50));
    expect(ws.ctx.summaries().find((d) => d.id === active)).toMatchObject({ dirty: false, filePath: join(work, '.design', 'Untitled.archa') });

    const pub = (await call<{ active: string }>(ws, 'workspace.restore', { project: null })).active;
    edit(ws, pub);
    await ws.files.autosave();
    expect(existsSync(backupFile(pub))).toBe(true);
    expect(ws.ctx.summaries().find((d) => d.id === pub)!.dirty).toBe(true);
  });

  it('settings default to 45 s, persist, and reject bad values', async () => {
    const ws = appHost();
    expect(await call<AppSettings>(ws, 'settings.get')).toEqual({ autosave: { enabled: true, seconds: 45 } });
    await call(ws, 'settings.set', { autosave: { enabled: true, seconds: 120 } });
    expect(appHost().files.settings.autosave.seconds).toBe(120);
    await expect(call(ws, 'settings.set', { autosave: { enabled: true, seconds: 1 } })).rejects.toThrow(/Invalid params for settings.set/);
    expect(readdirSync(home)).toContain('settings.json');
  });

  it('summaries carry the project', async () => {
    const ws = appHost();
    await call(ws, 'workspace.restore', { project: work });
    const [d] = await call<DocSummary[]>(ws, 'workspace.list');
    expect(d!.project).toBe(work);
  });
});

describe('headless host', () => {
  it('starts with one untitled document and leaves open-file lists alone', async () => {
    const h = newHost();
    hosts.push(h);
    expect(h.ctx.summaries()).toHaveLength(1);
    edit(h, h.ctx.summaries()[0]!.id);
    await h.files.flush();
    h.files.persist();
    expect(existsSync(join(home, 'runtime', 'open-files.json'))).toBe(false);
    expect(existsSync(join(home, 'runtime', 'backups'))).toBe(false);
  });
});
