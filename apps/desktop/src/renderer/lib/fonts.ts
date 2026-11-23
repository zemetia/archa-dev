import { BUNDLED_FONTS } from '@archa/protocol';

/** Font families offered by the font picker: the fonts the app ships, then every family installed on this machine. */

export { BUNDLED_FONTS };
export const FALLBACK_FONTS = [...BUNDLED_FONTS, 'Segoe UI', 'Georgia', 'Times New Roman', 'Arial', 'Consolas', 'Courier New', 'Trebuchet MS', 'Verdana'];

type LocalFont = { family: string };
let pending: Promise<string[]> | null = null;

/**
 * Lists installed font families once per session (Local Font Access API).
 * Call it from a click so Chromium sees a user gesture; falls back to the fixed list when the API is missing or refused.
 */
export function loadLocalFonts(): Promise<string[]> {
  if (pending) return pending;
  const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFont[]> }).queryLocalFonts;
  pending = (query ? query.call(window) : Promise.resolve([] as LocalFont[]))
    .then((fonts) => {
      // Built-in fonts first (they look the same on every machine), then the installed ones A–Z.
      const installed = new Set([...FALLBACK_FONTS, ...fonts.map((f) => f.family)].filter((f) => !BUNDLED_FONTS.includes(f)));
      return [...BUNDLED_FONTS, ...[...installed].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
    })
    .catch(() => {
      pending = null;
      return [...FALLBACK_FONTS];
    });
  return pending;
}
