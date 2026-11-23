/*
 * Fonts the canvas draws with (blueprint DOCUMENT_MODEL/03 → Text measure). Twelve OFL families ship with the
 * app (Latin + Latin Extended, @fontsource static faces, listed in fonts-bundled.ts) and the core measures text
 * with their real advance widths (packages/core/src/text-metrics-data.ts), so layout and drawing agree on
 * every machine. Both files come from scripts/gen-text-metrics.mjs.
 */
import { BUNDLED_FACES } from './fonts-bundled';

/** Loads the Latin and Latin Extended subsets of a face. */
const SAMPLE = 'Aa0 ĀāŁł ±²—“”';

/** A canvas only uses a webfont that is already loaded, so load every bundled face up front (local files). */
export function preloadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all(BUNDLED_FACES.map(([f, w]) => document.fonts.load(`${w} 16px "${f}"`, SAMPLE).catch(() => []))).then(() => undefined);
}

/** Calls `fn` whenever new font faces finish loading (to repaint cached bitmaps). */
export function onFontsLoaded(fn: () => void): () => void {
  if (typeof document === 'undefined' || !document.fonts) return () => {};
  document.fonts.addEventListener('loadingdone', fn);
  return () => document.fonts.removeEventListener('loadingdone', fn);
}
