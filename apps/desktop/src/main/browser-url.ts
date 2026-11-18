import { pathToFileURL } from 'node:url';

const ALLOWED_SCHEMES = ['http', 'https', 'file', 'about', 'data'];

/** "localhost:3000" → http, "example.com" → https, a path → file://. Refuses javascript: and other schemes. */
export function normalizeUrl(input: string): string {
  const u = input.trim();
  if (!u) throw new Error('url is empty');
  if (/^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('\\\\') || /^\/(?!\/)/.test(u)) return pathToFileURL(u).href;
  if (/^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[::1\])(:\d+)?([/?#]|$)/i.test(u)) return `http://${u}`;
  const m = /^([a-z][a-z0-9+.-]*):(.*)$/is.exec(u);
  // "example.com:8080/x" is host:port, not a scheme.
  if (!m || /^\d+([/?#]|$)/.test(m[2]!)) return `https://${u}`;
  const scheme = m[1]!.toLowerCase();
  if (ALLOWED_SCHEMES.includes(scheme)) return u;
  throw new Error(`"${scheme}:" URLs are not allowed — use http(s), file or about:blank`);
}

/** Address bar input: anything that does not look like an address becomes a web search. */
export function addressToUrl(input: string): string {
  const u = input.trim();
  const looksLikeAddress = !/\s/.test(u) && (/[.:/\\]/.test(u) || /^localhost$/i.test(u));
  return looksLikeAddress ? normalizeUrl(u) : `https://www.google.com/search?q=${encodeURIComponent(u)}`;
}
