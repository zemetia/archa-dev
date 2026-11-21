import { contrastRatio, hasVisual, isContainer, type Color, type Issue, type Node } from '@archa/schema';
import type { ArchaDocument } from './document';

/**
 * Cheap structural checks returned in every agent reply (blueprint MCP/03).
 * Each rule names the node and the remedy.
 */
export function lint(doc: ArchaDocument, scope: Iterable<string>): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const id of scope) {
    for (const n of doc.walk(id)) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      check(doc, n, issues);
    }
  }
  return issues;
}

function push(issues: Issue[], n: Node, rule: string, message: string, remedy: string) {
  issues.push({ rule, nodeId: n.id, nodeName: n.name, message, remedy });
}

function check(doc: ArchaDocument, n: Node, issues: Issue[]) {
  if (n.type === 'page' || !n.visible) return;
  const parent = n.parentId ? doc.get(n.parentId) : undefined;

  if (n.type === 'text' && !n.fills.some((f) => f.visible)) push(issues, n, 'text/no-fill', 'text has no fill and is invisible', 'add a fill, e.g. fills: ["#111111"]');
  if (n.type === 'text' && !n.text.trim()) push(issues, n, 'text/empty', 'text is empty', 'set text or remove the node');
  if ((n.width <= 0.5 || n.height <= 0.5) && n.type !== 'group') push(issues, n, 'layout/collapsed', `size is ${n.width}×${n.height}`, 'give it a fixed size or content to hug');

  if (parent?.type === 'frame' && parent.layout === 'none' && (n.sizing.horizontal === 'fill' || n.sizing.vertical === 'fill')) {
    push(issues, n, 'layout/fill-no-parent', 'fill sizing has no effect: parent has no auto-layout', 'set parent layout to row/column or use fixed sizing');
  }

  if (parent?.type === 'frame' && parent.clip && !n.absolute) {
    const overflowX = n.x < -0.5 || n.x + n.width > parent.width + 0.5;
    const overflowY = n.y < -0.5 || n.y + n.height > parent.height + 0.5;
    if (overflowX || overflowY) push(issues, n, 'layout/clipped', `clipped by "${parent.name}" (${overflowX ? 'horizontally' : 'vertically'})`, 'resize the parent, use hug sizing, or move the node inside; if the crop is intended (a bleed off the edge), set absolute: true');
  }

  if (n.type === 'text' && n.fills[0] && parent) {
    const back = backdrop(doc, n, parent);
    if (back) {
      const ratio = contrastRatio(n.fills[0].color, back.color);
      const large = n.fontSize >= 24 || (n.fontSize >= 18.5 && n.fontWeight >= 700);
      if (ratio < (large ? 3 : 4.5)) push(issues, n, 'a11y/contrast', `contrast ${ratio.toFixed(2)}:1 on "${back.name}" is below WCAG AA`, 'darken/lighten the text or the background');
    }
  }

  if (parent?.type === 'page' && n.type === 'frame' && isContainer(parent)) {
    for (const otherId of parent.children) {
      if (otherId === n.id) continue;
      const o = doc.get(otherId);
      if (!o || !o.visible || o.type !== 'frame' || otherId < n.id) continue;
      if (n.x < o.x + o.width && n.x + n.width > o.x && n.y < o.y + o.height && n.y + n.height > o.y) {
        push(issues, n, 'layout/overlap-frames', `top-level frame overlaps "${o.name}"`, 'move it to empty space (findEmptySpace)');
      }
    }
  }
}

/**
 * What a text node is read against: the topmost solid shape drawn before it (an earlier sibling, or a
 * layer inside one) under its centre, else its parent's fill. A sticker or card behind the text counts.
 */
function backdrop(doc: ArchaDocument, n: Node, parent: Node): { color: Color; name: string } | null {
  const b = doc.worldBounds(n.id);
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const solid = (m: Node) => (hasVisual(m) && m.type !== 'text' && m.visible && m.opacity >= 0.5 ? m.fills.find((f) => f.visible && f.color.a >= 0.5) : undefined);
  const under = (m: Node) => { const r = doc.worldBounds(m.id); return cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height; };
  const siblings = isContainer(parent) ? parent.children : [];
  for (let i = siblings.indexOf(n.id) - 1; i >= 0; i--) {
    const s = doc.get(siblings[i]!);
    if (!s || !s.visible || !under(s)) continue;
    // Inside a sibling, the last (topmost) solid layer under the centre wins.
    let hit: { color: Color; name: string } | null = null;
    for (const m of doc.walk(s.id)) { const f = solid(m); if (f && under(m)) hit = { color: f.color, name: m.name }; }
    if (hit) return hit;
  }
  const f = solid(parent);
  return f ? { color: f.color, name: parent.name } : null;
}
