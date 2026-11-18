import { contrastRatio, hasVisual, isContainer, type Issue, type Node } from '@archa/schema';
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
    if (overflowX || overflowY) push(issues, n, 'layout/clipped', `clipped by "${parent.name}" (${overflowX ? 'horizontally' : 'vertically'})`, 'resize the parent, use hug sizing, or move the node inside');
  }

  if (n.type === 'text' && n.fills[0] && parent && hasVisual(parent) && parent.fills[0]) {
    const ratio = contrastRatio(n.fills[0].color, parent.fills[0].color);
    const large = n.fontSize >= 24 || (n.fontSize >= 18.5 && n.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5)) push(issues, n, 'a11y/contrast', `contrast ${ratio.toFixed(2)}:1 on "${parent.name}" is below WCAG AA`, 'darken/lighten the text or the background');
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
