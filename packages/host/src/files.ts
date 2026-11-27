import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, normalize, resolve as resolvePath } from 'node:path';
import { DocumentError, DocumentSession } from '@archa/core';
import { decodeArcha, encodeArcha } from '@archa/formats';
import { newId } from '@archa/schema';
import type { AppSettings, CoreEvents, EventName } from '@archa/protocol';
import { assetDirFor, dataDirFor, externalizeData, isRuntimeDataDir, migrateDataDir, moveDataDir } from '@archa/protocol/node';
import type { HostContext } from './context';
import { backupFile, contextKey, ensureDesignDir, freeDesignPath, projectFiles, projectRoot, readOpenFiles, readSettings, writeOpenFiles, writeSettings, type OpenEntry } from './projects';

const pathKey = (p: string) => normalize(resolvePath(p)).toLowerCase();

/**
 * Document files (blueprint FILE_FORMATS/01, /05; ENTRY_POINTS/01): open and save `.archa`, and — when the host
 * serves app windows (`windows`) — per-window restore of open files, backups of unsaved work and auto-save.
 * Headless hosts and most tests leave `windows` off: nothing is restored, persisted or saved on a timer.
 */
export class DocumentFiles {
  /** Saved open-file lists; contexts restored this run are rewritten from the live sessions. */
  private openFiles = readOpenFiles();
  private restored = new Set<string>();
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  /** Revision last written to a backup, so an unchanged document is not written again. */
  private backedUp = new Map<string, number>();
  /** One save at a time per document (autosave, agents and the person may ask together). */
  private saving = new Map<string, Promise<unknown>>();
  private autosaveTimer: ReturnType<typeof setInterval> | undefined;
  settings: AppSettings = readSettings();

  constructor(private ctx: HostContext, private windows: boolean) {
    if (!windows) return;
    ctx.afterBroadcast = (event, data) => this.onEvent(event, data);
    this.scheduleAutosave();
  }

  private onEvent<E extends EventName>(event: E, data: CoreEvents[E]) {
    if (event === 'workspace.changed') this.schedulePersist();
    // Auto-save when an agent finishes its work (done() or the end of a chat turn).
    const ended = event === 'agent.done' || (event === 'chat.run' && (data as CoreEvents['chat.run']).status !== 'running');
    if (ended && this.settings.autosave.enabled) void this.autosave((data as { docId: string }).docId);
  }

  /** A new untitled document nobody has touched: replaced when a restore brings real files. */
  private pristine(s: DocumentSession) {
    return !s.filePath && !s.dirty && s.revision === 0;
  }

  /* ------------------------------ open and save ------------------------------ */

  async openFile(path: string, project: string | null): Promise<string> {
    const data = decodeArcha(new Uint8Array(await readFile(path)));
    if (this.ctx.sessions.has(data.meta.id)) data.meta.id = newId();
    // A pre-1.7.3 `<name>-asset/` folder moves into `<name>-data/`.
    migrateDataDir(path, data.meta.id);
    // Older files carry images as base64: write them out to `<name>-data/assets/`; the next save drops the base64.
    const moved = externalizeData(assetDirFor(path, data.meta.id), data);
    const s = new DocumentSession(data, path);
    s.dirty = moved > 0;
    return this.ctx.register(s, project);
  }

  /** doc.open: an open file returns its id; opened from another window, it moves to that window. */
  async open(path: string, project: string | null | undefined): Promise<string> {
    const { ctx } = this;
    const existing = [...ctx.sessions.values()].find((s) => s.filePath && pathKey(s.filePath) === pathKey(path));
    const context = project === undefined ? ctx.projectOf(existing?.id ?? ctx.lastDocId) : project ? projectRoot(project) : null;
    if (!existing) return this.openFile(path, context);
    const left = ctx.projectOf(existing.id);
    if (contextKey(left) !== contextKey(context)) {
      ctx.projects.set(existing.id, context);
      // The window it left keeps one document open.
      if (!ctx.inContext(left).length) ctx.newDoc('Untitled', left);
      ctx.broadcast('workspace.changed', ctx.summaries());
    }
    return existing.id;
  }

  /** Where a save without a path goes: the file it came from, else a new file in its project's `.design/`. */
  private saveTarget(s: DocumentSession): string | null {
    if (s.filePath) return s.filePath;
    const project = this.ctx.projectOf(s.id);
    if (!project) return null;
    const open = new Set([...this.ctx.sessions.values()].map((x) => x.filePath && pathKey(x.filePath)));
    return freeDesignPath(project, s.doc.meta.name, (p) => open.has(pathKey(p)));
  }

  /** Saves to `path`, or to `saveTarget`. One write at a time per document. */
  async save(s: DocumentSession, path?: string): Promise<string> {
    const prev = this.saving.get(s.id) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(() => this.write(s, path));
    this.saving.set(s.id, run);
    try { return await run; } finally { if (this.saving.get(s.id) === run) this.saving.delete(s.id); }
  }

  private async write(s: DocumentSession, path?: string): Promise<string> {
    if (path && !isAbsolute(path)) throw new DocumentError('VALIDATION', `Save path must be absolute (got "${path}")`);
    const target = path ? (/\.archa$/i.test(path) ? path : `${path}.archa`) : this.saveTarget(s);
    if (!target) throw new DocumentError('VALIDATION', 'No file path yet — choose where to save');
    // The data folder travels with the file: a first save or Save As copies it to `<new name>-data/`.
    migrateDataDir(target, s.id);
    const fromDir = this.ctx.dataDir(s);
    const toDir = dataDirFor(target, s.id);
    if (fromDir !== toDir) moveDataDir(fromDir, toDir, isRuntimeDataDir(fromDir));
    const revision = s.revision;
    const tmp = `${target}.tmp`;
    await writeFile(tmp, encodeArcha(s.doc.toData()));
    await rename(tmp, target);
    s.filePath = target;
    // Edits that landed while the file was written keep it dirty for the next save.
    s.dirty = s.revision !== revision;
    if (path && s.doc.meta.name === 'Untitled') s.doc.meta.name = basename(target).replace(/\.archa$/i, '');
    this.backedUp.delete(s.id);
    this.ctx.broadcast('workspace.changed', this.ctx.summaries());
    return target;
  }

  closed(docId: string) {
    this.backedUp.delete(docId);
  }

  /* ----------------------- restore, backups, autosave ----------------------- */

  /** Unsaved content kept in ARCHA_HOME/runtime/backups until the document is saved or closed. */
  private async backup(s: DocumentSession) {
    if (this.backedUp.get(s.id) === s.revision) return;
    const file = backupFile(s.id);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, encodeArcha(s.doc.toData()));
    await rename(`${file}.tmp`, file);
    this.backedUp.set(s.id, s.revision);
  }

  /** Documents with unsaved changes go to their file (or a new one in their project), else to a backup. */
  async autosave(docId?: string) {
    const { ctx } = this;
    const list = docId ? [ctx.sessions.get(docId)].filter((s): s is DocumentSession => !!s) : [...ctx.sessions.values()];
    for (const s of list) {
      if (!s.dirty) continue;
      try {
        if (s.filePath || ctx.projectOf(s.id)) await this.save(s);
        else await this.backup(s);
      } catch (e) {
        console.error(`[core] autosave of "${s.doc.meta.name}" failed: ${(e as Error).message}`);
      }
    }
    this.schedulePersist();
  }

  private scheduleAutosave() {
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = undefined;
    const { enabled, seconds } = this.settings.autosave;
    if (enabled) this.autosaveTimer = setInterval(() => void this.autosave(), seconds * 1000);
    this.autosaveTimer?.unref?.();
  }

  /** On quit nothing unsaved is lost: with auto-save on it goes to files, otherwise (and public untitled work) to backups. */
  async flush() {
    if (!this.windows) return;
    clearInterval(this.autosaveTimer);
    const { ctx } = this;
    for (const s of ctx.sessions.values()) {
      if (!s.dirty) continue;
      try {
        if (this.settings.autosave.enabled && (s.filePath || ctx.projectOf(s.id))) await this.save(s);
        else await this.backup(s);
      } catch (e) {
        console.error(`[core] could not keep "${s.doc.meta.name}": ${(e as Error).message}`);
        try { await this.backup(s); } catch { /* nothing more to try */ }
      }
    }
    this.persist();
  }

  private schedulePersist() {
    if (!this.windows) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 250);
    this.persistTimer.unref?.();
  }

  /** Rewrites the open-file list of every context that has documents or was restored this run. */
  persist() {
    if (!this.windows) return;
    clearTimeout(this.persistTimer);
    const { ctx } = this;
    const keys = new Set([...this.restored, ...[...ctx.sessions.keys()].map((id) => contextKey(ctx.projectOf(id)))]);
    for (const key of keys) {
      const all = [...ctx.sessions.values()].filter((s) => contextKey(ctx.projectOf(s.id)) === key);
      const docs = all.filter((s) => (s.filePath || (s.dirty && this.backedUp.has(s.id))) && !this.pristine(s));
      const entries: OpenEntry[] = docs.map((s) => ({
        ...(s.filePath ? { path: s.filePath } : {}),
        ...(s.dirty && this.backedUp.has(s.id) ? { backup: s.id } : {}),
        name: s.doc.meta.name,
      }));
      const active = docs.findIndex((s) => s.id === ctx.lastDocId);
      const project = all.length ? ctx.projectOf(all[0]!.id) : this.openFiles.contexts[key]?.project ?? null;
      this.openFiles.contexts[key] = { project, docs: entries, ...(active >= 0 ? { active } : {}) };
    }
    try { writeOpenFiles(this.openFiles); } catch (e) { console.error(`[core] could not write open files: ${(e as Error).message}`); }
  }

  /** A window opens: reopen what its context had open (backups included). A project gets its `.design/` folder. */
  async restore(project: string | null): Promise<{ active: string | null }> {
    const { ctx } = this;
    const root = project ? projectRoot(project) : null;
    if (root) ensureDesignDir(root);
    const key = contextKey(root);
    const live = ctx.inContext(root);
    if (this.windows && !this.restored.has(key) && live.every((s) => this.pristine(s))) {
      const saved = this.openFiles.contexts[key];
      const opened: string[] = [];
      for (const e of saved?.docs ?? []) {
        try {
          const id = await this.reopen(e, root);
          if (id) opened.push(id);
        } catch (err) {
          console.error(`[core] could not reopen ${e.path ?? e.name}: ${(err as Error).message}`);
        }
      }
      // A project opened for the first time shows its newest design.
      const newest = root && !saved ? projectFiles(root)[0] : undefined;
      if (newest) opened.push(await this.openFile(newest.path, root));
      if (opened.length) for (const s of live) { ctx.sessions.delete(s.id); ctx.projects.delete(s.id); }
      const active = opened[saved?.active ?? opened.length - 1] ?? opened.at(-1);
      if (active) ctx.lastDocId = active;
    }
    this.restored.add(key);
    if (!ctx.inContext(root).length) ctx.newDoc('Untitled', root);
    const docs = ctx.inContext(root);
    const active = docs.find((s) => s.id === ctx.lastDocId) ?? docs.at(-1)!;
    ctx.lastDocId = active.id;
    ctx.broadcast('workspace.changed', ctx.summaries());
    return { active: active.id };
  }

  private async reopen(e: OpenEntry, project: string | null): Promise<string | null> {
    const { ctx } = this;
    const already = e.path ? [...ctx.sessions.values()].find((s) => s.filePath && pathKey(s.filePath) === pathKey(e.path!)) : undefined;
    if (already) { ctx.projects.set(already.id, project); return already.id; }
    if (e.backup && existsSync(backupFile(e.backup))) {
      const data = decodeArcha(new Uint8Array(await readFile(backupFile(e.backup))));
      if (ctx.sessions.has(data.meta.id)) data.meta.id = newId();
      const s = new DocumentSession(data, e.path ?? null);
      s.dirty = true;
      const id = ctx.register(s, project);
      if (id === e.backup) this.backedUp.set(id, s.revision);
      return id;
    }
    if (e.path && existsSync(e.path)) return this.openFile(e.path, project);
    return null;
  }

  applySettings(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch };
    writeSettings(this.settings);
    if (this.windows) this.scheduleAutosave();
    return this.settings;
  }

  /** Stops the timers (tests, shutdown). */
  dispose() {
    clearInterval(this.autosaveTimer);
    clearTimeout(this.persistTimer);
  }
}
