/*
 * Decoded image cache for image nodes. drawNode is synchronous, so a missing image draws a
 * placeholder and starts loading; the listener (the canvas) repaints when it arrives.
 */

type Entry = { img: HTMLImageElement | null; failed: boolean; ready: Promise<void> };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

export function onImageLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function load(src: string): Entry {
  let e = entries.get(src);
  if (e) return e;
  const img = new Image();
  e = { img: null, failed: false, ready: Promise.resolve() };
  const entry = e;
  entry.ready = (async () => {
    try {
      img.src = src;
      await img.decode();
      entry.img = img;
    } catch {
      entry.failed = true;
    }
    for (const l of listeners) l();
  })();
  entries.set(src, entry);
  return entry;
}

/** The decoded image, or null while loading / when it failed. */
export function imageFor(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !src) return null;
  return load(src).img;
}

/** Waits until every source is decoded (or failed) — for one-shot renders such as export and agent screenshots. */
export async function preloadImages(srcs: Iterable<string>): Promise<void> {
  if (typeof Image === 'undefined') return;
  await Promise.all([...new Set(srcs)].filter(Boolean).map((s) => load(s).ready));
}
