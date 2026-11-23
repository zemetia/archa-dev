import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { allowedAssetFile, ASSET_MIME } from './asset-paths';

/*
 * `archa-asset://` serves document images to the renderer (blueprint FILE_FORMATS/01 → Asset folder):
 *   archa-asset://file/<encoded absolute path>  an image inside a `<name>-asset/` folder or ArchaDev's runtime folder
 *   archa-asset://remote/<encoded http(s) URL>  a web image, proxied so it carries CORS headers
 * Every reply allows any origin, so canvases that draw these images stay exportable (no tainting).
 */

export const ASSET_PROTOCOL = 'archa-asset';

const CORS = { 'Access-Control-Allow-Origin': '*' };

/** Must run before the app is ready. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
}

const deny = (status: number, text: string) => new Response(text, { status, headers: CORS });

export function handleAssetProtocol(): void {
  protocol.handle(ASSET_PROTOCOL, async (req) => {
    let url: URL;
    try { url = new URL(req.url); } catch { return deny(400, 'Bad asset URL'); }
    const target = decodeURIComponent(url.pathname.slice(1));
    try {
      if (url.host === 'file') {
        if (!allowedAssetFile(target)) return deny(403, 'Not a document asset');
        const r = await net.fetch(pathToFileURL(target).toString());
        if (!r.ok) return deny(404, 'Asset file not found');
        const type = ASSET_MIME[extname(target).slice(1).toLowerCase()]!;
        // Asset files are content-addressed, so a name never changes meaning.
        return new Response(r.body, { status: 200, headers: { ...CORS, 'Content-Type': type, 'Cache-Control': 'max-age=31536000, immutable' } });
      }
      if (url.host === 'remote') {
        if (!/^https?:\/\//i.test(target)) return deny(403, 'Only http(s) images can be proxied');
        const r = await net.fetch(target);
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': r.headers.get('content-type') ?? 'application/octet-stream' } });
      }
    } catch (e) {
      return deny(502, (e as Error).message);
    }
    return deny(404, 'Unknown asset host');
  });
}
