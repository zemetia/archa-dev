import { colorToCss, isContainer, type Node, type TextNode } from '@archa/schema';
import type { ArchaDocument } from '@archa/core';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws a node and its subtree in the node's parent coordinate space.
 * Pure: reads the document, never resolves variables or mutates (blueprint RENDERING/01).
 */
export function drawNode(ctx: Ctx, doc: ArchaDocument, node: Node): void {
  if (!node.visible || node.type === 'page') return;
  ctx.save();
  ctx.translate(node.x, node.y);
  if (node.opacity < 1) ctx.globalAlpha *= node.opacity;

  switch (node.type) {
    case 'frame':
    case 'rect': {
      const r = Math.min(node.cornerRadius, node.width / 2, node.height / 2);
      shape(ctx, node, () => roundRect(ctx, 0, 0, node.width, node.height, r));
      if (node.type === 'frame') {
        if (node.clip) {
          roundRect(ctx, 0, 0, node.width, node.height, r);
          ctx.clip();
        }
        drawChildren(ctx, doc, node);
      }
      break;
    }
    case 'ellipse':
      shape(ctx, node, () => {
        ctx.beginPath();
        ctx.ellipse(node.width / 2, node.height / 2, node.width / 2, node.height / 2, 0, 0, Math.PI * 2);
      });
      break;
    case 'group':
      drawChildren(ctx, doc, node);
      break;
    case 'text':
      drawText(ctx, node);
      break;
  }
  ctx.restore();
}

function drawChildren(ctx: Ctx, doc: ArchaDocument, node: Node) {
  if (!isContainer(node)) return;
  for (const id of node.children) {
    const c = doc.get(id);
    if (c) drawNode(ctx, doc, c);
  }
}

function shape(ctx: Ctx, node: Extract<Node, { fills: unknown }>, path: () => void) {
  for (const fx of node.effects) {
    if (!fx.visible) continue;
    ctx.save();
    ctx.shadowColor = colorToCss(fx.color);
    ctx.shadowBlur = fx.blur;
    ctx.shadowOffsetX = fx.x;
    ctx.shadowOffsetY = fx.y;
    path();
    ctx.fillStyle = node.fills.find((f) => f.visible) ? colorToCss(node.fills.find((f) => f.visible)!.color) : 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();
  }
  for (const f of node.fills) {
    if (!f.visible) continue;
    path();
    ctx.fillStyle = colorToCss(f.color);
    ctx.fill();
  }
  for (const s of node.strokes) {
    if (!s.visible || s.width <= 0) continue;
    ctx.save();
    path();
    ctx.strokeStyle = colorToCss(s.color);
    if (s.align === 'center') {
      ctx.lineWidth = s.width;
      ctx.stroke();
    } else if (s.align === 'inside') {
      ctx.clip();
      path();
      ctx.lineWidth = s.width * 2;
      ctx.stroke();
    } else {
      ctx.lineWidth = s.width * 2;
      ctx.stroke();
      path();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
    }
    ctx.restore();
  }
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r <= 0) ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, r);
}

export const fontString = (n: TextNode) => `${n.fontWeight} ${n.fontSize}px "${n.fontFamily}", Inter, system-ui, sans-serif`;

/** Wraps text into lines for fixed / auto-height boxes; auto-width keeps hard breaks only. */
export function layoutLines(ctx: Ctx, n: TextNode): string[] {
  ctx.font = fontString(n);
  const hard = n.text.split('\n');
  if (n.textSizing === 'auto-width') return hard;
  const out: string[] = [];
  for (const para of hard) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (line && ctx.measureText(next).width > n.width) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function drawText(ctx: Ctx, n: TextNode) {
  const fill = n.fills.find((f) => f.visible);
  if (!fill) return;
  ctx.font = fontString(n);
  ctx.fillStyle = colorToCss(fill.color);
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${n.letterSpacing}px`;
  const lh = n.fontSize * n.lineHeight;
  const x = n.textAlign === 'center' ? n.width / 2 : n.textAlign === 'right' ? n.width : 0;
  ctx.textAlign = n.textAlign;
  layoutLines(ctx, n).forEach((line, i) => ctx.fillText(line, x, lh * i + lh / 2));
}
