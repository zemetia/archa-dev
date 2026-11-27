import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, normalize, resolve } from 'node:path';
import { archaHome } from '@archa/protocol/node';
import type { AppSettings, ProjectFile } from '@archa/protocol';
import { z } from 'zod';

/*
 * Projects, open-file restore and app settings (blueprint FILE_FORMATS/02, ENTRY_POINTS/01).
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

export function ensureDesignDir(root: string): string {
  const dir = designDir(root);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** `.archa` files in the project's `.design/`, newest first. */
export function projectFiles(root: string): Array<Omit<ProjectFile, 'docId'>> {
  const dir = designDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.archa$/i.test(f))
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

const stateFile = () => join(archaHome(), 'runtime', 'open-files.json');
export const backupDir = () => join(archaHome(), 'runtime', 'backups');
const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'doc';
export const backupFile = (docId: string) => join(backupDir(), `${safe(docId)}.archa`);

export function readOpenFiles(): OpenFilesState {
  try {
    const parsed = stateSchema.safeParse(JSON.parse(readFileSync(stateFile(), 'utf8')));
    if (parsed.success) return parsed.data;
  } catch { /* missing or unreadable: start fresh */ }
  return { version: 1, contexts: {} };
}

/** Writes the state and deletes backups nothing points at any more. */
export function writeOpenFiles(state: OpenFilesState): void {
  const file = stateFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${file}.tmp`, file);
  const used = new Set(Object.values(state.contexts).flatMap((c) => c.docs.map((d) => d.backup).filter(Boolean).map((id) => `${safe(id!)}.archa`)));
  if (!existsSync(backupDir())) return;
  for (const f of readdirSync(backupDir())) if (!used.has(f)) rmSync(join(backupDir(), f), { force: true });
}

/* -------------------------------- settings ------------------------------- */

export const DEFAULT_SETTINGS: AppSettings = { autosave: { enabled: true, seconds: 45 } };
export const settingsPatchSchema = z.object({
  autosave: z.object({ enabled: z.boolean(), seconds: z.number().int().min(5).max(3600) }).optional(),
}).strict();

const settingsFile = () => join(archaHome(), 'settings.json');

export function readSettings(): AppSettings {
  try {
    const parsed = settingsPatchSchema.safeParse(JSON.parse(readFileSync(settingsFile(), 'utf8')));
    if (parsed.success) return { ...DEFAULT_SETTINGS, ...parsed.data };
  } catch { /* missing: defaults */ }
  return structuredClone(DEFAULT_SETTINGS);
}

export function writeSettings(settings: AppSettings): void {
  mkdirSync(dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}
