import { existsSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, normalize, resolve } from 'node:path';
import { z } from 'zod';
import type { AppSettings, ProjectFile } from '@archa/protocol';
import { settingsPatchSchema } from '@archa/protocol';
import { ensureDir, listDir, paths, readJson, safeSegment, writeJsonAtomic } from '@archa/protocol/node';

/*
 * Projects, open-file restore and app settings (blueprint FILE_FORMATS/05, ENTRY_POINTS/01).
 * A folder opened in ArchaDev is a project: its designs live in `<folder>/.design/*.archa`. A window with no
 * folder is public. Each window context remembers which files it had open in ARCHA_HOME/runtime/open-files.json;
 * unsaved work with no file to go to is kept in ARCHA_HOME/runtime/backups/<docId>.archa (VS Code-like hot exit).
 */

export const DESIGN_DIR = '.design';

/** Absolute, no trailing separator; the `.design` folder itself means its project. */
export function projectRoot(path: string): string {
  let p = resolve(path).replace(/[\\/]+$/, '') || resolve(path);
  if (/^[A-Za-z]:$/.test(p)) p += '\\';
  if (basename(p).toLowerCase() === DESIGN_DIR) p = dirname(p);
  return p;
}

/** Key of a window context: '' for public, the normalised folder for a project. */
export const contextKey = (project: string | null | undefined) => (project ? normalize(projectRoot(project)).toLowerCase() : '');

export const designDir = (root: string) => join(root, DESIGN_DIR);

export const ensureDesignDir = (root: string): string => ensureDir(designDir(root));

/** `.archa` files in the project's `.design/`, newest first. */
export function projectFiles(root: string): Array<Omit<ProjectFile, 'docId'>> {
  const dir = designDir(root);
  return listDir(dir, (f) => /\.archa$/i.test(f))
    .map((f) => {
      const path = join(dir, f);
      try { return { path, name: f.replace(/\.archa$/i, ''), modifiedAt: statSync(path).mtimeMs }; } catch { return null; }
    })
    .filter((f): f is NonNullable<typeof f> => !!f)
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** `<root>/.design/<name>.archa`, numbered when taken (`Untitled 2.archa`). */
export function freeDesignPath(root: string, name: string, taken: (path: string) => boolean = () => false): string {
  const dir = ensureDesignDir(root);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips characters Windows file names cannot hold
  const base = name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/[. ]+$/, '').trim().slice(0, 120) || 'Untitled';
  for (let n = 1; ; n++) {
    const path = join(dir, `${n > 1 ? `${base} ${n}` : base}.archa`);
    if (!existsSync(path) && !taken(path)) return path;
  }
}

/* ------------------------------ open files ------------------------------ */

const entrySchema = z.object({ path: z.string().max(4096).optional(), backup: z.string().max(100).optional(), name: z.string().max(400).optional() });
const contextSchema = z.object({ project: z.string().max(4096).nullable(), docs: z.array(entrySchema).max(200), active: z.number().int().min(0).optional() });
const stateSchema = z.object({ version: z.literal(1), contexts: z.record(z.string(), contextSchema) });

/** path: the file it reopens; backup: unsaved content to reopen (with or without a path). */
export type OpenEntry = z.infer<typeof entrySchema>;
export type OpenContext = z.infer<typeof contextSchema>;
export type OpenFilesState = z.infer<typeof stateSchema>;

export const backupFile = (docId: string) => paths.backup(docId);

export function readOpenFiles(): OpenFilesState {
  return readJson(paths.openFiles(), stateSchema, { version: 1, contexts: {} });
}

/** Writes the state and deletes backups nothing points at any more. */
export function writeOpenFiles(state: OpenFilesState): void {
  writeJsonAtomic(paths.openFiles(), state);
  const used = new Set(Object.values(state.contexts).flatMap((c) => c.docs.flatMap((d) => (d.backup ? [`${safeSegment(d.backup, 'doc')}.archa`] : []))));
  for (const f of listDir(paths.backups())) if (!used.has(f)) rmSync(join(paths.backups(), f), { force: true });
}

/* -------------------------------- settings ------------------------------- */

export const DEFAULT_SETTINGS: AppSettings = { autosave: { enabled: true, seconds: 45 } };

export function readSettings(): AppSettings {
  const saved = readJson(paths.settings(), settingsPatchSchema, {});
  return { ...structuredClone(DEFAULT_SETTINGS), ...saved };
}

export function writeSettings(settings: AppSettings): void {
  writeJsonAtomic(paths.settings(), settings);
}
