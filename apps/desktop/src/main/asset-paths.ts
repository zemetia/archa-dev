import { extname, isAbsolute, join, normalize, sep } from 'node:path';
import { archaHome } from '@archa/protocol/node';

/** File types `archa-asset://file/…` serves: images, and PDFs staged as references. */
export const ASSET_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
  pdf: 'application/pdf', // staged references (compare, reference) only
};

/** Only image files, and only inside a `*-asset` folder or ARCHA_HOME/runtime — never an arbitrary file. */
export function allowedAssetFile(path: string, home = archaHome()): boolean {
  if (!isAbsolute(path)) return false;
  const p = normalize(path);
  if (!ASSET_MIME[extname(p).slice(1).toLowerCase()]) return false;
  const parts = p.split(sep);
  if (parts.includes('..')) return false;
  const runtime = normalize(join(home, 'runtime')) + sep;
  return parts.slice(0, -1).some((d) => /-asset$/i.test(d)) || p.toLowerCase().startsWith(runtime.toLowerCase());
}
