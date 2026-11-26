import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archaHome } from '@archa/protocol/node';
import { ASSET_SCHEME, type DocumentData, type Node, type Op } from '@archa/schema';

/*
 * Document data folder (blueprint FILE_FORMATS/01 → Data folder). Everything that belongs to a document but
 * not inside its `.archa` lives in `<name>-data/` next to the file: `assets/` (images, svg, videos…),
 * `chats/`, `skills/`, `memory/` and `reference/`. Image nodes point into `assets/` with
 * `asset:images/<hash>.<ext>` — never base64. Any data: URL or local image path that reaches the core
 * (paste, import, agent, library) is copied there first. Unsaved documents keep their folder under
 * ARCHA_HOME/runtime/data/<docId> until the first save. Before 1.7.3 the folder was `<name>-asset/` with
 * images at its root; it is moved into the new layout when the document is opened.
 */

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'image/avif': 'avif',
};
const EXT_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' };

const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'doc';

const stem = (filePath: string) => basename(filePath).replace(/\.archa$/i, '');

/** `D:/x/landing.archa` → `D:/x/landing-data`; an unsaved document → its runtime folder. */
export function dataDirFor(filePath: string | null, docId: string): string {
  if (filePath) return join(dirname(filePath), `${stem(filePath)}-data`);
  return join(archaHome(), 'runtime', 'data', safe(docId));
}

/** Where `asset:` references resolve: the data folder's `assets/`. */
export const assetDirFor = (filePath: string | null, docId: string) => join(dataDirFor(filePath, docId), 'assets');

export const isRuntimeDataDir = (dir: string) => !relative(join(archaHome(), 'runtime', 'data'), dir).startsWith('..');

/** Folders of the data root that are not assets; anything else in a pre-1.7.3 `-asset/` folder was an asset. */
const DATA_DIRS = new Set(['assets', 'chats', 'skills', 'memory', 'reference']);

/**
 * Pre-1.7.3 `<name>-asset/` (images at its root, chats/, reference/) → `<name>-data/` with images under
 * `assets/`. `asset:` references keep working because they resolve inside `assets/`. Also moves an
 * unsaved document's old runtime folder. Never overwrites: a file already in the new place wins.
 */
export function migrateDataDir(filePath: string | null, docId: string): void {
  const to = dataDirFor(filePath, docId);
  const from = filePath ? join(dirname(filePath), `${stem(filePath)}-asset`) : join(archaHome(), 'runtime', 'assets', safe(docId));
  if (!existsSync(from)) return;
  mkdirSync(join(to, 'assets'), { recursive: true });
  for (const entry of readdirSync(from)) {
    const dest = DATA_DIRS.has(entry) ? join(to, entry) : join(to, 'assets', entry);
    cpSync(join(from, entry), dest, { recursive: true, force: false, errorOnExist: false });
  }
  rmSync(from, { recursive: true, force: true });
}

/** Sub-folder of `assets/` for a file type: images, svg, videos, fonts, files. */
export function assetKind(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'svg') return 'svg';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(e)) return 'images';
  if (['mp4', 'webm', 'mov', 'm4v'].includes(e)) return 'videos';
  if (['ttf', 'otf', 'woff', 'woff2'].includes(e)) return 'fonts';
  return 'files';
}

/** Decodes a data: URL (base64 or percent-encoded). Null when it is not an image. */
export function decodeDataUrl(src: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(src);
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  if (!MIME_EXT[mime]) return null;
  const bytes = m[3] ? Buffer.from(m[4]!, 'base64') : Buffer.from(decodeURIComponent(m[4]!), 'utf8');
  return { mime, bytes };
}

/** Writes bytes once (content-addressed) under `sub/` (default: by file type) and returns the `asset:` reference. */
export function storeBytes(assetDir: string, bytes: Buffer, ext: string, sub = assetKind(ext)): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 24);
  const rel = `${sub}/${hash}.${ext}`;
  const file = join(assetDir, ...rel.split('/'));
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, bytes);
    renameSync(`${file}.tmp`, file);
  }
  return `${ASSET_SCHEME}${rel}`;
}

/** A local image file given as an absolute path or file:// URL, if that is what `src` is. */
function localImageFile(src: string): string | null {
  let path = src;
  if (/^file:\/\//i.test(src)) {
    try { path = fileURLToPath(src); } catch { return null; }
  } else if (!isAbsolute(src) || src.includes('\n')) return null;
  const ext = extname(path).slice(1).toLowerCase();
  return EXT_MIME[ext] && existsSync(path) ? path : null;
}

/** Sources that become files in the folder: data: URLs and local image files (absolute path or file:// URL). */
export const isExternalizable = (src: string) => src.startsWith('data:') || localImageFile(src) !== null;

/** data: URL or local file → file in the asset folder → `asset:` reference. Other sources pass through unchanged. */
export function externalizeSrc(assetDir: string, src: string): string {
  if (src.startsWith('data:')) {
    const d = decodeDataUrl(src);
    return d ? storeBytes(assetDir, d.bytes, MIME_EXT[d.mime]!) : src;
  }
  const file = localImageFile(src);
  if (!file) return src;
  const ext = extname(file).slice(1).toLowerCase();
  return storeBytes(assetDir, readFileSync(file), ext === 'jpeg' ? 'jpg' : ext);
}

/** Absolute file of an `asset:` reference, or null when it is not one or escapes the folder. */
export function assetFile(assetDir: string, src: string): string | null {
  if (!src.startsWith(ASSET_SCHEME)) return null;
  const rel = src.slice(ASSET_SCHEME.length);
  if (!rel || isAbsolute(rel)) return null;
  const file = resolve(assetDir, rel);
  const back = relative(resolve(assetDir), file);
  return back && !back.startsWith('..') && !isAbsolute(back) ? file : null;
}

/** `asset:` reference → data: URL (for exports and libraries that must stand alone). Missing files pass through. */
export function inlineSrc(assetDir: string, src: string): string {
  const file = assetFile(assetDir, src);
  if (!file || !existsSync(file)) return src;
  const mime = EXT_MIME[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

type Paints = Array<{ type: string; src?: string }>;

/** Image paints in a fills list with their `src` mapped (other paints untouched); null when nothing changed. */
function mapPaints(fills: unknown, f: (src: string) => string): Paints | null {
  if (!Array.isArray(fills)) return null;
  let changed = false;
  const out = (fills as Paints).map((p) => {
    if (p?.type !== 'image' || typeof p.src !== 'string') return p;
    const src = f(p.src);
    if (src === p.src) return p;
    changed = true;
    return { ...p, src };
  });
  return changed ? out : null;
}

/** A node (or node-shaped patch) with every image source mapped: an image node's `src` and image paints in `fills`. */
function mapSources<T extends Record<string, unknown>>(n: T, isImage: boolean, f: (src: string) => string): T {
  let out = n;
  if (isImage && typeof n.src === 'string') {
    const src = f(n.src);
    if (src !== n.src) out = { ...out, src };
  }
  const fills = mapPaints(n.fills, f);
  if (fills) out = { ...out, fills };
  return out;
}

const mapNodeSrc = (n: Node, f: (src: string) => string): Node => mapSources(n as unknown as Record<string, unknown>, n.type === 'image', f) as unknown as Node;

/**
 * Rewrites image sources inside ops before they are applied — image node `src` and image paints in `fills` —
 * so no base64 ever lands in the document.
 */
export function externalizeOps(assetDir: string, ops: Op[]): Op[] {
  const out = (src: string) => (isExternalizable(src) ? externalizeSrc(assetDir, src) : src);
  let changed = false;
  const next = ops.map((op) => {
    if (op.op === 'insert') {
      const node = mapNodeSrc(op.node, out);
      if (node !== op.node) { changed = true; return { ...op, node }; }
    }
    if (op.op === 'update') {
      const patch = mapSources(op.patch, typeof op.patch.src === 'string', out);
      if (patch !== op.patch) { changed = true; return { ...op, patch }; }
    }
    return op;
  });
  return changed ? next : ops;
}

/** Every data: image in a loaded document (image nodes and image paints) → asset files. Returns how many nodes changed. */
export function externalizeData(assetDir: string, data: DocumentData): number {
  let n = 0;
  const out = (src: string) => (src.startsWith('data:') ? externalizeSrc(assetDir, src) : src);
  for (const [id, node] of Object.entries(data.nodes)) {
    const next = mapNodeSrc(node, out);
    if (next !== node) { data.nodes[id] = next; n++; }
  }
  return n;
}

/** A copy of the document with `asset:` images inlined, for exporters and the shared component library. */
export function inlineData(assetDir: string, data: DocumentData): DocumentData {
  const nodes: DocumentData['nodes'] = {};
  for (const [id, node] of Object.entries(data.nodes)) nodes[id] = mapNodeSrc(node, (s) => inlineSrc(assetDir, s));
  return { ...data, nodes };
}

/** Carries a document's data folder to its new place on Save As / first save. Existing files are kept. */
export function moveDataDir(from: string, to: string, removeSource: boolean): void {
  if (from === to || !existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
  if (removeSource) rmSync(from, { recursive: true, force: true });
}

/** Pixel size from an image file's header (PNG, JPEG, GIF, WebP, SVG) — no decoding. Null when unknown. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  if (/<svg[\s>]/i.test(head)) {
    const tag = /<svg[^>]*>/i.exec(head)?.[0] ?? '';
    const w = /\swidth="([\d.]+)(px)?"/.exec(tag)?.[1], h = /\sheight="([\d.]+)(px)?"/.exec(tag)?.[1];
    if (w && h) return { width: Number(w), height: Number(h) };
    const vb = /viewBox="[\d.\s-]+?\s([\d.]+)\s+([\d.]+)"/.exec(tag);
    if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
  }
  return null;
}
