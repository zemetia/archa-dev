import type { ArchaDocument } from '@archa/core';

/*
 * Decoded image cache for image nodes. drawNode is synchronous, so a missing image draws a
 * placeholder and starts loading; the listener (the canvas) repaints when it arrives.
 *
 * A node's `src` is not always loadable as is: `asset:` references live in the document's asset
 * folder, which only the host knows. The host installs a resolver that turns a source (plus the
 * document it belongs to) into a URL the page can load; without one, sources load unchanged.
 */

export type ImageResolver = (src: string, doc: ArchaDocument | undefined) => string;

type Entry = { img: HTMLImageElement | null; failed: boolean; ready: Promise<void> };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let resolver: ImageResolver = (src) => src;

export function setImageResolver(fn: ImageResolver): void {
  resolver = fn;
}

/** The document being drawn; drawNode sets it, so paints that only know a `src` still resolve `asset:` in the right folder. */
let drawingDoc: ArchaDocument | undefined;
export const setDrawingDoc = (doc: ArchaDocument | undefined) => { drawingDoc = doc; };

/** The URL a source loads from (what the resolver makes of it). */
export const resolveImageSrc = (src: string, doc?: ArchaDocument): string => (src ? resolver(src, doc) : src);

export function onImageLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function load(url: string): Entry {
  let e = entries.get(url);
  if (e) return e;
  const img = new Image();
  // Host-served images answer with CORS headers; asking for them keeps the canvas exportable.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^(blob|data):/i.test(url)) img.crossOrigin = 'anonymous';
  e = { img: null, failed: false, ready: Promise.resolve() };
  const entry = e;
  entry.ready = (async () => {
    try {
      img.src = url;
      await img.decode();
      entry.img = img;
    } catch {
      entry.failed = true;
    }
    for (const l of listeners) l();
  })();
  entries.set(url, entry);
  return entry;
}

/** The decoded image, or null while loading / when it failed. */
export function imageFor(src: string, doc: ArchaDocument | undefined = drawingDoc): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !src) return null;
  return load(resolveImageSrc(src, doc)).img;
}

/** Waits until every source is decoded (or failed) — for one-shot renders such as export and agent screenshots. */
export async function preloadImages(srcs: Iterable<string>, doc?: ArchaDocument): Promise<void> {
  if (typeof Image === 'undefined') return;
  await Promise.all([...new Set(srcs)].filter(Boolean).map((s) => load(resolveImageSrc(s, doc)).ready));
}
