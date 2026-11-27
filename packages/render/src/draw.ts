import { colorToCss, isContainer, type ConnectorNode, type EmbedNode, type ImageNode, type Node, type PathNode, type StickyNode, type VisualNode } from '@archa/schema';
import { connectorGeometry, connectorStroke, polygonPoints, viewBoxMatrix, type ArchaDocument } from '@archa/core';
import { imageFor, setDrawingDoc } from './images';
import { canvasPaint, fillPaint } from './paint';
import { drawText } from './text';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Transient per-node animation (canvas change animations): offset in parent space, fade, scale about the centre. */
export type NodeAnim = { dx?: number; dy?: number; alpha?: number; scale?: number };
export type AnimMap = ReadonlyMap<string, NodeAnim>;

/**
 * Draws a node and its subtree in the node's parent coordinate space.
 * Pure: reads the document, never resolves variables or mutates (blueprint RENDERING/01).
 */
export function drawNode(ctx: Ctx, doc: ArchaDocument, node: Node, anim?: AnimMap): void {
  setDrawingDoc(doc);
  if (!node.visible || node.type === 'page') return;
  ctx.save();
  ctx.translate(node.x, node.y);
  // Rotation turns the box (and its subtree) about its centre; connectors route in page space instead.
  if (node.rotation && node.type !== 'connector') {
    ctx.translate(node.width / 2, node.height / 2);
    ctx.rotate((node.rotation * Math.PI) / 180);
    ctx.translate(-node.width / 2, -node.height / 2);
  }
  if (node.opacity < 1) ctx.globalAlpha *= node.opacity;
  const a = anim?.get(node.id);
  if (a) {
    if (a.dx || a.dy) ctx.translate(a.dx ?? 0, a.dy ?? 0);
    if (a.alpha !== undefined) ctx.globalAlpha *= a.alpha;
    if (a.scale !== undefined && a.scale !== 1) {
      ctx.translate(node.width / 2, node.height / 2);
      ctx.scale(a.scale, a.scale);
      ctx.translate(-node.width / 2, -node.height / 2);
    }
  }
  const blur = 'effects' in node ? node.effects.find((e) => e.visible && e.type === 'layer-blur') : undefined;
  if (blur?.type === 'layer-blur' && blur.radius > 0) ctx.filter = `blur(${blur.radius * deviceScale(ctx)}px)`;

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
        drawChildren(ctx, doc, node, anim);
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
      drawChildren(ctx, doc, node, anim);
      break;
    case 'text':
      drawText(ctx, node, deviceScale(ctx));
      break;
    case 'polygon': {
      const pts = polygonPoints(node.sides, node.width, node.height);
      shape(ctx, node, () => {
        ctx.beginPath();
        pts.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.closePath();
      });
      break;
    }
    case 'path': {
      const p = pathOf(node);
      if (p) shape(ctx, node, () => p);
      break;
    }
    case 'image':
      drawImageNode(ctx, node);
      break;
    case 'sticky':
      drawSticky(ctx, node);
      break;
    case 'embed':
      drawEmbed(ctx, node);
      break;
    case 'connector':
      drawConnector(ctx, node);
      break;
  }
  ctx.restore();
}

function drawConnector(ctx: Ctx, node: ConnectorNode) {
  const { line, caps } = connectorGeometry(node);
  if (!line) return;
  const { css, width } = connectorStroke(node);
  ctx.strokeStyle = css;
  ctx.fillStyle = css;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(line));
  for (const c of caps) ctx.fill(new Path2D(c));
}

function drawChildren(ctx: Ctx, doc: ArchaDocument, node: Node, anim?: AnimMap) {
  if (!isContainer(node)) return;
  for (const id of node.children) {
    const c = doc.get(id);
    if (c) drawNode(ctx, doc, c, anim);
  }
}

/** `path` either builds the current path or returns a Path2D. Phase lets images sit between fill and stroke. */
function shape(ctx: Ctx, node: VisualNode, path: () => Path2D | void, phase: 'all' | 'fill' | 'stroke' = 'all') {
  const rule = node.type === 'path' ? node.fillRule : 'nonzero';
  const fill = (p: Path2D | void) => (p ? ctx.fill(p, rule) : ctx.fill(rule));
  const stroke = (p: Path2D | void) => (p ? ctx.stroke(p) : ctx.stroke());
  const clip = (p: Path2D | void) => (p ? ctx.clip(p, rule) : ctx.clip(rule));
  if (phase !== 'stroke') paintFills(ctx, node, path, fill);
  if (phase === 'fill') return;
  for (const s of node.strokes) {
    if (!s.visible || s.width <= 0) continue;
    ctx.save();
    const p = path();
    ctx.strokeStyle = colorToCss(s.color);
    if (node.type === 'path') { ctx.lineCap = node.lineCap; ctx.lineJoin = node.lineJoin; }
    // Vector paths are often open and have no inside: their strokes are always centred.
    if (node.type === 'path' || s.align === 'center') {
      ctx.lineWidth = s.width;
      stroke(p);
    } else if (s.align === 'inside') {
      clip(p);
      const p2 = path();
      ctx.lineWidth = s.width * 2;
      stroke(p2);
    } else {
      // Outside: clip to everything but the shape (even-odd against a huge rect) so the fill underneath survives.
      const big = 1e6;
      if (p) {
        const outer = new Path2D();
        outer.rect(-big, -big, big * 2, big * 2);
        outer.addPath(p);
        ctx.clip(outer, 'evenodd');
      } else {
        ctx.rect(-big, -big, big * 2, big * 2);
        ctx.clip('evenodd');
      }
      const p2 = path();
      ctx.lineWidth = s.width * 2;
      stroke(p2);
    }
    ctx.restore();
  }
}

function paintFills(ctx: Ctx, node: VisualNode, path: () => Path2D | void, fill: (p: Path2D | void) => void) {
  const k = deviceScale(ctx);
  const first = node.fills.find((f) => f.visible);
  for (const fx of node.effects) {
    if (!fx.visible || fx.type !== 'drop-shadow') continue;
    ctx.save();
    // Shadow offset and blur are in device pixels: scale them so they match at every zoom.
    ctx.shadowColor = colorToCss(fx.color);
    ctx.shadowBlur = fx.blur * k;
    ctx.shadowOffsetX = fx.x * k;
    ctx.shadowOffsetY = fx.y * k;
    const p = path();
    // The shadow takes the shape of the fill (a gradient that fades out casts a fading shadow).
    ctx.fillStyle = (first && first.type !== 'radial-gradient' && canvasPaint(ctx, first, node.width, node.height)) || 'rgba(0,0,0,1)';
    fill(p);
    ctx.restore();
  }
  for (const fx of node.effects) {
    if (!fx.visible || fx.type !== 'background-blur' || fx.radius <= 0) continue;
    // Frosted glass: blur what is already drawn under the shape, then the (translucent) fills go on top.
    ctx.save();
    clipTo(ctx, node, path());
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${fx.radius * k}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
  }
  for (const f of node.fills) {
    if (!f.visible) continue;
    fillPaint(ctx, f, node.width, node.height, path() ?? undefined, fill);
  }
  for (const fx of node.effects) {
    if (!fx.visible || fx.type !== 'inner-shadow') continue;
    // Inner shadow: clip to the shape and cast the shadow of everything outside it. The caster is drawn far
    // to the side (outside the clip) and its shadow is offset back, so only the shadow lands inside.
    ctx.save();
    clipTo(ctx, node, path());
    const reach = fx.blur * 2 + Math.abs(fx.x) + Math.abs(fx.y) + 8;
    const away = node.width + reach * 2 + 100;
    ctx.shadowColor = colorToCss(fx.color);
    ctx.shadowBlur = fx.blur * k;
    ctx.shadowOffsetX = (fx.x + away) * k;
    ctx.shadowOffsetY = fx.y * k;
    ctx.translate(-away, 0);
    const p = path();
    const ring = new Path2D();
    if (p) ring.addPath(p);
    else ctx.rect(-reach, -reach, node.width + reach * 2, node.height + reach * 2);
    ring.rect(-reach, -reach, node.width + reach * 2, node.height + reach * 2);
    ctx.fillStyle = '#000';
    if (p) ctx.fill(ring, 'evenodd'); else ctx.fill('evenodd');
    ctx.restore();
  }
}

function clipTo(ctx: Ctx, node: VisualNode, p: Path2D | void) {
  const rule = node.type === 'path' ? node.fillRule : 'nonzero';
  if (p) ctx.clip(p, rule); else ctx.clip(rule);
}

/** Canvas units → device pixels (zoom × DPR × export scale); scaling is uniform, so the length of one turned axis fits both. */
function deviceScale(ctx: Ctx): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

const pathCache = new Map<string, Path2D>();

/** Path2D of a vector node in its own box (viewBox stretched to width × height). */
export function pathOf(n: PathNode): Path2D | null {
  if (typeof Path2D === 'undefined' || !n.d) return null;
  const key = `${n.d}|${n.viewBox.x},${n.viewBox.y},${n.viewBox.width},${n.viewBox.height}|${n.width}x${n.height}`;
  let p = pathCache.get(key);
  if (!p) {
    p = new Path2D();
    try {
      p.addPath(new Path2D(n.d), new DOMMatrix(viewBoxMatrix(n.viewBox, n.width, n.height)));
    } catch {
      return null;
    }
    if (pathCache.size > 2000) pathCache.clear();
    pathCache.set(key, p);
  }
  return p;
}

function drawImageNode(ctx: Ctx, n: ImageNode) {
  const r = Math.min(n.cornerRadius, n.width / 2, n.height / 2);
  const box = () => roundRect(ctx, 0, 0, n.width, n.height, r);
  shape(ctx, n, box, 'fill');
  ctx.save();
  box();
  ctx.clip();
  const img = imageFor(n.src);
  if (img && img.naturalWidth && img.naturalHeight) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (n.fit === 'fill') ctx.drawImage(img, 0, 0, n.width, n.height);
    else {
      const s = n.fit === 'fit' ? Math.min(n.width / iw, n.height / ih) : Math.max(n.width / iw, n.height / ih);
      const w = iw * s, h = ih * s;
      ctx.drawImage(img, (n.width - w) / 2, (n.height - h) / 2, w, h);
    }
  } else {
    ctx.fillStyle = '#e4e4e7';
    ctx.fillRect(0, 0, n.width, n.height);
  }
  ctx.restore();
  shape(ctx, n, box, 'stroke');
}

export const STICKY_PADDING = 16;
export const STICKY_LINE = 1.35;
export const stickyFont = (n: StickyNode) => `500 ${n.fontSize}px Inter, "Segoe UI", system-ui, sans-serif`;

function drawSticky(ctx: Ctx, n: StickyNode) {
  shape(ctx, n, () => roundRect(ctx, 0, 0, n.width, n.height, 4));
  ctx.save();
  roundRect(ctx, 0, 0, n.width, n.height, 4);
  ctx.clip();
  ctx.font = stickyFont(n);
  ctx.fillStyle = '#1f1f23';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const lh = n.fontSize * STICKY_LINE;
  wrapText(ctx, n.text, n.width - STICKY_PADDING * 2).forEach((line, i) => { ctx.fillText(line, STICKY_PADDING, STICKY_PADDING + lh * i + lh / 2); });
  ctx.restore();
}

/** Placeholder card; the app shows the live page over it (embed layer). Exports and screenshots keep this card. */
function drawEmbed(ctx: Ctx, n: EmbedNode) {
  const r = Math.min(n.cornerRadius, n.width / 2, n.height / 2);
  ctx.save();
  roundRect(ctx, 0, 0, n.width, n.height, r);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  // The node is the page itself: no address strip, the URL stays out of the picture.
  ctx.font = '500 13px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(n.url ? 'Web page' : 'Paste a link to load a page', n.width / 2, n.height / 2, Math.max(1, n.width - 28));
  ctx.restore();
}

/** Greedy word wrap; hard line breaks are kept. */
export function wrapText(ctx: Ctx, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/(\s+)/)) {
      const next = line + w;
      if (line && ctx.measureText(next).width > width) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r <= 0) ctx.rect(x, y, w, h);
  else ctx.roundRect(x, y, w, h, r);
}

