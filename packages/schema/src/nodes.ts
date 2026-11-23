import { z } from 'zod';
import { colorSchema, colorToCss, type Color } from './color';

export const nodeIdSchema = z.string().min(1).describe('Node id');
export type NodeId = string;

const sizingModeSchema = z.enum(['fixed', 'hug', 'fill']).describe('fixed: own size · hug: fit children/text · fill: take the remaining space of an auto-layout parent');

export const solidPaintSchema = z.object({
  type: z.literal('solid'),
  color: colorSchema,
  visible: z.boolean().default(true),
});

const gradientStopSchema = z.object({ offset: z.number().min(0).max(1), color: colorSchema });

/** CSS-style linear gradient across the node box: angle 180 = top → bottom, 90 = left → right. */
export const linearGradientSchema = z.object({
  type: z.literal('linear'),
  angle: z.number().default(180).describe('Degrees, CSS convention: 0 = to top, 90 = to right, 180 = to bottom'),
  stops: z.array(gradientStopSchema).min(2),
  visible: z.boolean().default(true),
});

/** Circular gradient: centre as a fraction of the box, radius as a fraction of the box's longer side. */
export const radialGradientSchema = z.object({
  type: z.literal('radial'),
  cx: z.number().default(0.5),
  cy: z.number().default(0.5),
  radius: z.number().min(0).default(0.5),
  stops: z.array(gradientStopSchema).min(2),
  visible: z.boolean().default(true),
});

export const paintSchema = z.discriminatedUnion('type', [solidPaintSchema, linearGradientSchema, radialGradientSchema]);
export type Paint = z.infer<typeof paintSchema>;
export type SolidPaint = z.infer<typeof solidPaintSchema>;
export type GradientPaint = z.infer<typeof linearGradientSchema> | z.infer<typeof radialGradientSchema>;
export type GradientStop = z.infer<typeof gradientStopSchema>;

/** Start and end of a CSS-angle linear gradient across a w×h box (the line through the centre that reaches the corners). */
export function linearGradientLine(angle: number, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return { x0: w / 2 - dx * half, y0: h / 2 - dy * half, x1: w / 2 + dx * half, y1: h / 2 + dy * half };
}

/** CSS for a paint: a colour, or a linear-/radial-gradient() expression. */
export function paintToCss(p: Paint): string {
  if (p.type === 'solid') return colorToCss(p.color);
  const stops = p.stops.map((s) => `${colorToCss(s.color)} ${Math.round(s.offset * 1000) / 10}%`).join(', ');
  if (p.type === 'linear') return `linear-gradient(${p.angle}deg, ${stops})`;
  return `radial-gradient(circle at ${Math.round(p.cx * 1000) / 10}% ${Math.round(p.cy * 1000) / 10}%, ${stops})`;
}

/** One colour that stands for a paint (a gradient's middle stop): for contrast checks, ink choice and text editing. */
export function paintColor(p: Paint): Color {
  if (p.type === 'solid') return p.color;
  return p.stops[Math.floor((p.stops.length - 1) / 2)]!.color;
}

export const strokeSchema = z.object({
  color: colorSchema,
  width: z.number().min(0).default(1),
  align: z.enum(['inside', 'center', 'outside']).default('inside'),
  visible: z.boolean().default(true),
});
export type Stroke = z.infer<typeof strokeSchema>;

export const shadowSchema = z.object({
  type: z.literal('drop-shadow'),
  x: z.number().default(0),
  y: z.number().default(4),
  blur: z.number().min(0).default(12),
  color: colorSchema,
  visible: z.boolean().default(true),
});
export type Shadow = z.infer<typeof shadowSchema>;

const paddingSchema = z.object({ top: z.number().min(0), right: z.number().min(0), bottom: z.number().min(0), left: z.number().min(0) });

const base = {
  id: nodeIdSchema,
  name: z.string().describe('Human-readable layer name. Name every node.'),
  parentId: nodeIdSchema.nullable(),
  x: z.number().default(0).describe('X relative to parent (ignored inside auto-layout unless absolute)'),
  y: z.number().default(0),
  width: z.number().min(0).default(100),
  height: z.number().min(0).default(100),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  sizing: z.object({ horizontal: sizingModeSchema, vertical: sizingModeSchema }).default({ horizontal: 'fixed', vertical: 'fixed' }),
  absolute: z.boolean().default(false).describe('Opt out of the parent auto-layout and keep x/y'),
  meta: z.record(z.string(), z.unknown()).default({}),
  /**
   * Token bindings: property → variable id (or name). The core keeps the property equal to the variable,
   * re-applies it when the variable changes, and drops a binding when the property is edited by hand.
   */
  bind: z.record(z.string(), z.string()).optional(),
};

/** Properties a variable can drive, and the variable type each needs. */
export const BINDABLE: Record<string, 'color' | 'number' | 'string'> = {
  fill: 'color', stroke: 'color', cornerRadius: 'number', gap: 'number', padding: 'number', opacity: 'number',
  width: 'number', height: 'number', fontSize: 'number', fontWeight: 'number', lineHeight: 'number', letterSpacing: 'number',
  fontFamily: 'string', text: 'string',
};

const visual = {
  fills: z.array(paintSchema).default([]),
  strokes: z.array(strokeSchema).default([]),
  effects: z.array(shadowSchema).default([]),
};

const container = { children: z.array(nodeIdSchema).default([]) };

export const pageNodeSchema = z.object({ ...base, ...container, type: z.literal('page') });

export const frameNodeSchema = z.object({
  ...base, ...visual, ...container,
  type: z.literal('frame'),
  cornerRadius: z.number().min(0).default(0),
  clip: z.boolean().default(true),
  layout: z.enum(['none', 'row', 'column']).default('none').describe('Auto-layout direction'),
  gap: z.number().min(0).default(0),
  padding: paddingSchema.default({ top: 0, right: 0, bottom: 0, left: 0 }),
  align: z.enum(['start', 'center', 'end']).default('start').describe('Cross-axis alignment'),
  justify: z.enum(['start', 'center', 'end', 'space-between']).default('start').describe('Main-axis distribution'),
});

export const groupNodeSchema = z.object({ ...base, ...container, type: z.literal('group') });

export const rectNodeSchema = z.object({ ...base, ...visual, type: z.literal('rect'), cornerRadius: z.number().min(0).default(0) });

export const ellipseNodeSchema = z.object({ ...base, ...visual, type: z.literal('ellipse') });

export const textSpanSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  fills: z.array(paintSchema).optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  letterSpacing: z.number().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
});
export type TextSpan = z.infer<typeof textSpanSchema>;

export const textNodeSchema = z.object({
  ...base, ...visual,
  type: z.literal('text'),
  text: z.string().default(''),
  fontFamily: z.string().default('Inter'),
  fontSize: z.number().min(1).default(16),
  fontWeight: z.number().int().min(100).max(900).default(400),
  lineHeight: z.number().min(0.5).default(1.3).describe('Multiplier of font size'),
  letterSpacing: z.number().default(0),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  textSizing: z.enum(['fixed', 'auto-width', 'auto-height']).default('auto-width'),
  /** Rich text: style ranges over `text` (UTF-16 offsets, end exclusive). Unset properties use the node's own. */
  spans: z.array(textSpanSchema).optional(),
});

export const polygonNodeSchema = z.object({ ...base, ...visual, type: z.literal('polygon'), sides: z.number().int().min(3).max(64).default(3).describe('Regular polygon inscribed in the box; 3 = triangle') });

const viewBoxSchema = z.object({ x: z.number(), y: z.number(), width: z.number().min(0), height: z.number().min(0) });

export const pathNodeSchema = z.object({
  ...base, ...visual,
  type: z.literal('path'),
  d: z.string().describe('SVG path data, in viewBox coordinates'),
  viewBox: viewBoxSchema.describe('Box of `d` that is stretched onto the node size'),
  fillRule: z.enum(['nonzero', 'evenodd']).default('nonzero'),
  lineCap: z.enum(['butt', 'round', 'square']).default('round'),
  lineJoin: z.enum(['miter', 'round', 'bevel']).default('round'),
});

export const imageNodeSchema = z.object({
  ...base, ...visual,
  type: z.literal('image'),
  src: z.string().describe('asset:images/<file> in the document asset folder, an http(s) URL, or (legacy, converted on arrival) a data: URL'),
  fit: z.enum(['fill', 'fit', 'crop']).default('crop').describe('fill: stretch · fit: contain · crop: cover'),
  cornerRadius: z.number().min(0).default(0),
});

export const stickyNodeSchema = z.object({
  ...base, ...visual,
  type: z.literal('sticky'),
  text: z.string().default(''),
  fontSize: z.number().min(1).default(16),
});

export const embedNodeSchema = z.object({
  ...base,
  type: z.literal('embed'),
  url: z.string().default('').describe('Web page shown live on the canvas'),
  cornerRadius: z.number().min(0).default(12),
});

export const nodeSchema = z.discriminatedUnion('type', [
  pageNodeSchema, frameNodeSchema, groupNodeSchema, rectNodeSchema, ellipseNodeSchema, textNodeSchema,
  polygonNodeSchema, pathNodeSchema, imageNodeSchema, stickyNodeSchema, embedNodeSchema,
]);

export type PageNode = z.infer<typeof pageNodeSchema>;
export type FrameNode = z.infer<typeof frameNodeSchema>;
export type GroupNode = z.infer<typeof groupNodeSchema>;
export type RectNode = z.infer<typeof rectNodeSchema>;
export type EllipseNode = z.infer<typeof ellipseNodeSchema>;
export type TextNode = z.infer<typeof textNodeSchema>;
export type PolygonNode = z.infer<typeof polygonNodeSchema>;
export type PathNode = z.infer<typeof pathNodeSchema>;
export type ImageNode = z.infer<typeof imageNodeSchema>;
export type StickyNode = z.infer<typeof stickyNodeSchema>;
export type EmbedNode = z.infer<typeof embedNodeSchema>;
export type Node = z.infer<typeof nodeSchema>;
export type NodeType = Node['type'];
export type ContainerNode = PageNode | FrameNode | GroupNode;

export const CONTAINER_TYPES: ReadonlySet<NodeType> = new Set(['page', 'frame', 'group']);
export const isContainer = (n: Node): n is ContainerNode => CONTAINER_TYPES.has(n.type);
export type VisualNode = Extract<Node, { fills: Paint[] }>;
export const hasVisual = (n: Node): n is VisualNode => 'fills' in n;

/** Input accepted when creating a node: everything except id/parentId is optional, children may be inline. */
export type NodeInput = Partial<Omit<Node, 'children'>> & { type: Exclude<NodeType, 'page'>; children?: NodeInput[] } & Record<string, unknown>;
