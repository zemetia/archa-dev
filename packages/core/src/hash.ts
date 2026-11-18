import { isContainer, type Node } from '@archa/schema';
import type { ArchaDocument } from './document';

const EXCLUDED = new Set(['children', 'name', 'meta', 'locked', 'parentId', 'id']);

/** FNV-1a 32-bit, hex. Not cryptographic: a collision only costs a stale cache entry. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function canonical(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${k}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function selfHash(node: Node): string {
  const visible: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (!EXCLUDED.has(k)) visible[k] = v;
  return fnv1a(canonical(visible));
}

/** Like subtreeHash but ignores the root's own position — a moved frame keeps its cached bitmap. */
export function contentHash(doc: ArchaDocument, id: string): string {
  const n = doc.get(id);
  if (!n) return '0';
  const kids = isContainer(n) ? n.children.map((c) => subtreeHash(doc, c)).join('') : '';
  return fnv1a(selfHash({ ...n, x: 0, y: 0 }) + kids);
}

/** Merkle hash of a node and its subtree (blueprint DOCUMENT_MODEL/04). */
export function subtreeHash(doc: ArchaDocument, id: string): string {
  const n = doc.get(id);
  if (!n) return '0';
  const kids = isContainer(n) ? n.children.map((c) => subtreeHash(doc, c)).join('') : '';
  return fnv1a(selfHash(n) + kids);
}
