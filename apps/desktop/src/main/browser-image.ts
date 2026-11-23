import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeImage, WebContentsView, type NativeImage, type Session } from 'electron';
import { archaHome } from '@archa/protocol/node';
import type { BrowserImage } from '@archa/protocol';

/*
 * Images for the agent browser (blueprint BROWSER, "Images"): fetch a picture with the browser's
 * own session (cookies, referer), save it to disk, and make a canvas-ready copy and a preview.
 */

export const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;
/** Longest side of the copy that goes into the document (same as a pasted image). */
const EMBED_SIDE = 2048;
/** Longest side of the preview the agent sees. */
const PREVIEW_SIDE = 768;

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  'image/avif': 'avif', 'image/bmp': 'bmp', 'image/x-icon': 'ico',
};
const MIME_BY_EXT: Record<string, string> = Object.fromEntries([...Object.entries(EXT).map(([m, e]) => [e, m]), ['jpeg', 'image/jpeg']]);

export type Fetched = { buf: Buffer; mime: string; name: string; source: string };

/** Real type from the first bytes; servers often send the wrong Content-Type. */
export function sniffMime(buf: Buffer): string | null {
  const head = buf.subarray(0, 16);
  if (head[0] === 0x89 && head.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (head.toString('latin1', 4, 12) === 'ftypavif' || head.toString('latin1', 4, 12) === 'ftypavis') return 'image/avif';
  if (head.toString('latin1', 0, 2) === 'BM') return 'image/bmp';
  const text = buf.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'image/svg+xml';
  return null;
}

/** A file name for the picture: the URL's last path segment, cleaned, with the right extension. */
export function fileNameFor(source: string, mime: string): string {
  let base = 'image';
  try {
    if (!source.startsWith('data:')) base = decodeURIComponent(basename(new URL(source).pathname)) || base;
  } catch { /* keep the default */ }
  base = base.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  return `${base}.${EXT[mime] ?? 'img'}`;
}

/** Loads a picture from an http(s) URL, a data: URL, a file:// URL or an absolute path. */
export async function fetchImage(src: string, ses: Session, referer?: string): Promise<Fetched> {
  const s = src.trim();
  if (s.startsWith('data:')) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(s);
    if (!m) throw new Error('That data: URL is malformed.');
    const buf = m[2] ? Buffer.from(m[3]!, 'base64') : Buffer.from(decodeURIComponent(m[3]!), 'utf8');
    return checked(buf, m[1] || '', 'inline data: URL');
  }
  if (isAbsolute(s) || s.startsWith('file:')) {
    const path = s.startsWith('file:') ? fileURLToPath(s) : s;
    if (!existsSync(path)) throw new Error(`No file at ${path}.`);
    if ((await stat(path)).size > MAX_DOWNLOAD_BYTES) throw new Error(`${path} is over ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`);
    const buf = await readFile(path);
    return { ...checked(buf, MIME_BY_EXT[extname(path).slice(1).toLowerCase()] ?? '', path), name: basename(path) };
  }
  if (!/^https?:\/\//i.test(s)) throw new Error(`"${s.slice(0, 80)}" is not an image address — give an http(s) URL, a data: URL or an absolute file path.`);
  const headers: Record<string, string> = { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await ses.fetch(s, { headers, signal: ctrl.signal, ...(referer && /^https?:/.test(referer) ? { referrer: referer } : {}) });
    if (!res.ok) throw new Error(`The server answered ${res.status} ${res.statusText} for ${s.slice(0, 200)}.${res.status === 403 ? ' It may block downloads from outside its pages: open the page first, or use download {ref, capture:true}.' : ''}`);
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_DOWNLOAD_BYTES) throw new Error(`The file is ${(length / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`);
    const buf = Buffer.from(await res.arrayBuffer());
    const f = checked(buf, (res.headers.get('content-type') ?? '').split(';')[0]!.trim(), res.url || s);
    return { ...f, name: fileNameFor(res.url || s, f.mime) };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`Download timed out after 30 s: ${s.slice(0, 200)}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function checked(buf: Buffer, declared: string, source: string): Fetched {
  if (buf.length > MAX_DOWNLOAD_BYTES) throw new Error(`The file is over ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`);
  const mime = sniffMime(buf) ?? (declared.startsWith('image/') ? declared : '');
  if (!mime) {
    const what = declared.includes('html') ? 'a web page' : declared || 'not a picture';
    throw new Error(`${source.slice(0, 200)} is ${what}, not an image. Open it in the browser and run images to find the picture's own URL.`);
  }
  return { buf, mime, name: fileNameFor(source, mime), source };
}

/** Where to write: `dest` as a file (has an extension) or folder, else ARCHA_HOME/downloads; never overwrites. */
export async function saveImage(f: Fetched, dest?: string): Promise<string> {
  if (dest && !isAbsolute(dest)) throw new Error('download path must be absolute.');
  const asFile = !!dest && /\.[a-z0-9]{2,5}$/i.test(dest);
  const dir = asFile ? dirname(dest!) : dest ?? join(archaHome(), 'downloads');
  await mkdir(dir, { recursive: true });
  const wanted = asFile ? basename(dest!) : f.name;
  const stem = wanted.replace(/\.[^.]+$/, '');
  const ext = extname(wanted) || `.${EXT[f.mime] ?? 'img'}`;
  let path = join(dir, `${stem}${ext}`);
  for (let i = 2; existsSync(path) && !asFile; i++) path = join(dir, `${stem}-${i}${ext}`);
  await writeFile(path, f.buf);
  return path;
}

/* --------------------------------- decode -------------------------------- */

let decoder: WebContentsView | null = null;

/** WebP, GIF, AVIF and BMP: Chromium decodes them in a blank, hidden page (nativeImage only knows PNG and JPEG). */
async function decodeInPage(dataUrl: string): Promise<NativeImage> {
  if (!decoder || decoder.webContents.isDestroyed()) {
    decoder = new WebContentsView({ webPreferences: { sandbox: true, partition: 'archa-image-decoder', backgroundThrottling: false, javascript: true } });
    await decoder.webContents.loadURL('about:blank');
  }
  // createImageBitmap, not <img>.decode(): a page that is never shown never finishes decoding an <img>.
  const run = decoder.webContents.executeJavaScript(`(async () => {
    const i = await createImageBitmap(await (await fetch(${JSON.stringify(dataUrl)})).blob());
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/png');
  })()`) as Promise<string>;
  const png = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('decode timed out')), 15_000);
    run.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e as Error); });
  });
  return nativeImage.createFromDataURL(png);
}

function svgSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const num = (a: string) => Number(new RegExp(`\\b${a}\\s*=\\s*["']?([\\d.]+)(px)?["'\\s>]`, 'i').exec(tag)?.[1]) || 0;
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  return { width: num('width') || Number(vb?.[1]) || 300, height: num('height') || Number(vb?.[2]) || 300 };
}

/** File + canvas copy + preview for a fetched picture. */
export async function prepareImage(f: Fetched, path: string): Promise<{ image: BrowserImage; preview?: string }> {
  const base = { path, mime: f.mime, bytes: f.buf.length, source: f.source };
  if (f.mime === 'image/svg+xml') {
    const { width, height } = svgSize(f.buf.toString('utf8'));
    return { image: { ...base, width, height, embed: `data:image/svg+xml;base64,${f.buf.toString('base64')}` } };
  }
  let img = nativeImage.createFromBuffer(f.buf);
  if (img.isEmpty()) {
    try { img = await decodeInPage(`data:${f.mime};base64,${f.buf.toString('base64')}`); } catch { /* reported below */ }
  }
  if (img.isEmpty()) return { image: { ...base, width: 0, height: 0 } };
  const { width, height } = img.getSize();
  const long = Math.max(width, height);
  let embed: string;
  if (long <= EMBED_SIDE && (f.mime === 'image/png' || f.mime === 'image/jpeg')) embed = `data:${f.mime};base64,${f.buf.toString('base64')}`;
  else {
    const fit = long > EMBED_SIDE ? img.resize(width >= height ? { width: EMBED_SIDE, quality: 'best' } : { height: EMBED_SIDE, quality: 'best' }) : img;
    // JPEG stays JPEG; anything that may carry transparency becomes PNG.
    embed = f.mime === 'image/jpeg' ? `data:image/jpeg;base64,${fit.toJPEG(90).toString('base64')}` : fit.toDataURL();
  }
  const small = long > PREVIEW_SIDE ? img.resize(width >= height ? { width: PREVIEW_SIDE, quality: 'good' } : { height: PREVIEW_SIDE, quality: 'good' }) : img;
  return { image: { ...base, width, height, embed }, preview: small.toPNG().toString('base64') };
}
