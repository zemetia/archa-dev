import { ASSET_SCHEME } from '@archa/schema';
import { setImageResolver } from '@archa/render';
import { useStore } from './store';

/*
 * Where an image source loads from in this window (blueprint FILE_FORMATS/01 → Data folder).
 * `asset:` references resolve inside their document's `<name>-data/assets/` (chat attachments: inside
 * `<name>-data/`); web images go through the host proxy so they carry CORS headers. Both are served by
 * main's `archa-asset://` protocol.
 */
export function assetUrl(src: string, docId?: string | null, root: 'assets' | 'data' = 'assets'): string {
  if (src.startsWith(ASSET_SCHEME)) {
    const { docs, activeDocId } = useStore.getState();
    const doc = docs.find((d) => d.id === (docId ?? activeDocId));
    const dir = root === 'data' ? doc?.dataDir : doc?.assetDir;
    return dir ? `archa-asset://file/${encodeURIComponent(`${dir}/${src.slice(ASSET_SCHEME.length)}`)}` : src;
  }
  if (/^https?:\/\//i.test(src)) return `archa-asset://remote/${encodeURIComponent(src)}`;
  return src;
}

export function installImageResolver(): void {
  setImageResolver((src, doc) => assetUrl(src, doc?.meta.id));
}
