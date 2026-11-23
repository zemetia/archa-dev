/*
 * Web fonts for the canvas (blueprint RENDERING/01 → Fonts). A canvas never asks for an @font-face
 * font by itself, so drawText requests each face it uses; when one arrives the listeners (the canvas)
 * repaint. One-shot renders (export, agent screenshots) wait for their faces first.
 */

const requested = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const fontSet = (): FontFaceSet | null => (typeof document !== 'undefined' && document.fonts ? document.fonts : typeof self !== 'undefined' && (self as { fonts?: FontFaceSet }).fonts ? (self as { fonts?: FontFaceSet }).fonts! : null);

export function onFontLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Starts loading a CSS font shorthand ("italic 600 32px Inter Tight") once; resolves when it is ready or failed. */
export function requestFont(font: string): Promise<void> {
  const set = fontSet();
  if (!set) return Promise.resolve();
  let p = requested.get(font);
  if (p) return p;
  const before = set.check(font);
  p = set.load(font).then((faces) => {
    if (!before && faces.length) for (const l of listeners) l();
  }, () => undefined);
  requested.set(font, p);
  return p;
}

export function preloadFonts(fonts: Iterable<string>): Promise<void> {
  return Promise.all([...new Set(fonts)].map(requestFont)).then(() => undefined);
}
