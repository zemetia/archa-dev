import { colorToHex, isContainer, type Node } from '@archa/schema';
import type { ArchaDocument } from './document';

/** Free-text notes a person attached to a layer for agents (design panel → Context). Stored in `meta.context`. */
export const contextOf = (n: Node | undefined): string => {
  const v = n?.meta?.context;
  return typeof v === 'string' ? v.trim() : '';
};

const hex = (c: Parameters<typeof colorToHex>[0]) => colorToHex(c, c.a < 1).toLowerCase();
const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** One compact line per node: what the design panel shows, in words an agent reads quickly. */
export function describeNode(doc: ArchaDocument, n: Node): string {
  const parts: string[] = [`${n.name} "${n.id}" ${n.type}`, `${round(n.width)}×${round(n.height)}`];
  const parent = n.parentId ? doc.get(n.parentId) : undefined;
  const flow = parent?.type === 'frame' && parent.layout !== 'none' && !n.absolute;
  if (!flow && n.type !== 'page') parts.push(`at ${round(n.x)},${round(n.y)}`);
  if (n.absolute) parts.push('absolute');
  const sizing = [n.sizing.horizontal, n.sizing.vertical];
  if (sizing.some((s) => s !== 'fixed')) parts.push(`size ${sizing[0]}/${sizing[1]}`);
  if (n.type === 'frame') {
    if (n.layout !== 'none') {
      const p = n.padding;
      const pad = p.top === p.bottom && p.left === p.right ? (p.top === p.left ? `${p.top}` : `${p.top} ${p.left}`) : `${p.top} ${p.right} ${p.bottom} ${p.left}`;
      parts.push(`${n.layout} gap ${n.gap} pad ${pad} align ${n.align} justify ${n.justify}`);
    }
    if (!n.clip) parts.push('no clip');
  }
  if ('cornerRadius' in n && n.cornerRadius) parts.push(`r${n.cornerRadius}`);
  if (n.type === 'text') parts.push(`"${short(n.text.replace(/\n/g, '⏎'), 60)}" ${n.fontSize}/${n.fontWeight} ${n.fontFamily}${n.textAlign !== 'left' ? ` ${n.textAlign}` : ''}${n.textSizing !== 'auto-width' ? ` ${n.textSizing}` : ''}`);
  if (n.type === 'sticky') parts.push(`"${short(n.text, 60)}"`);
  if (n.type === 'embed') parts.push(n.url || 'no url');
  if (n.type === 'image') parts.push(`fit ${n.fit}`);
  if ('fills' in n) {
    const fills = n.fills.filter((f) => f.visible).map((f) => hex(f.color));
    if (fills.length) parts.push(`fill ${fills.join('+')}`);
    const strokes = n.strokes.filter((s) => s.visible).map((s) => `${s.width}px ${hex(s.color)} ${s.align}`);
    if (strokes.length) parts.push(`stroke ${strokes.join('+')}`);
    const fx = n.effects.filter((e) => e.visible).map((e) => (e.type === 'layer-blur' || e.type === 'background-blur' ? `${e.type} ${e.radius}` : `${e.type} ${e.x},${e.y} ${e.blur} ${hex(e.color)}`));
    if (fx.length) parts.push(fx.join(', '));
  }
  if (n.opacity < 1) parts.push(`opacity ${Math.round(n.opacity * 100)}%`);
  if (!n.visible) parts.push('hidden');
  if (n.locked) parts.push('locked');
  if (n.meta?.component) parts.push('component');
  if (typeof n.meta?.instanceOf === 'string') parts.push(`instance of "${n.meta.instanceOf}"`);
  return parts.join(' · ');
}

/** Indented tree of `describeNode` lines with the person's context notes; deep trees are cut with "+N more". */
export function outline(doc: ArchaDocument, id: string, depth = 3, maxLines = 200): string {
  const lines: string[] = [];
  const visit = (n: Node, level: number) => {
    if (lines.length >= maxLines) return;
    const pad = '  '.repeat(level);
    lines.push(`${pad}- ${describeNode(doc, n)}`);
    const note = contextOf(n);
    if (note) lines.push(`${pad}  context: ${short(note.replace(/\s+/g, ' '), 400)}`);
    if (!isContainer(n)) return;
    const kids = doc.children(n.id);
    if (level >= depth) { if (kids.length) lines.push(`${pad}  … ${kids.length} children (outline deeper to see them)`); return; }
    for (const k of kids) visit(k, level + 1);
  };
  visit(doc.require(id), 0);
  if (lines.length >= maxLines) lines.push(`… cut at ${maxLines} lines — outline a child for more`);
  return lines.join('\n');
}

const round = (v: number) => Math.round(v * 100) / 100;
