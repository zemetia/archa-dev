import { z } from 'zod';
import { colorSchema, type Color } from './color';

export const nodeIdSchema = z.string().min(1).describe('Node id');
export type NodeId = string;

const sizingModeSchema = z.enum(['fixed', 'hug', 'fill']).describe('fixed: own size · hug: fit children/text · fill: take the remaining space of an auto-layout parent');

export const gradientStopSchema = z.object({
  position: z.number().min(0).max(1).describe('0 = start of the gradient, 1 = end'),
  color: colorSchema,
});
export type GradientStop = z.infer<typeof gradientStopSchema>;

const stops = z.array(gradientStopSchema).min(2).describe('At least two colour stops; alpha in a stop colour fades it out');

export const solidPaintSchema = z.object({ type: z.literal('solid'), color: colorSchema, visible: z.boolean().default(true) });
export const linearGradientSchema = z.object({
  type: z.literal('linear-gradient'),
  stops,
  angle: z.number().default(180).describe('CSS angle in degrees: 0 = to top, 90 = to right, 180 = to bottom'),
  visible: z.boolean().default(true),
});
export const radialGradientSchema = z.object({
  type: z.literal('radial-gradient'),
  stops,
  center: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }).describe('Centre as a fraction of the box (0–1)'),
  radius: z.object({ x: z.number().min(0), y: z.number().min(0) }).default({ x: 0.5, y: 0.5 }).describe('Ellipse radii as a fraction of width / height'),
  visible: z.boolean().default(true),
});
export const imagePaintSchema = z.object({
  type: z.literal('image'),
  src: z.string().describe('asset:images/<file> in the document asset folder, an http(s) URL, or (legacy, written out on arrival) a data: URL'),
  fit: z.enum(['fill', 'fit', 'crop', 'tile']).default('crop').describe('fill: stretch · fit: contain · crop: cover · tile: repeat at natural size × scale'),
  scale: z.number().positive().default(1).describe('tile only: size of one tile'),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
});
/** A fill layer. Fills stack bottom → top (the last paint is on top), like CSS backgrounds in reverse. */
export const paintSchema = z.discriminatedUnion('type', [solidPaintSchema, linearGradientSchema, radialGradientSchema, imagePaintSchema]);
export type Paint = z.infer<typeof paintSchema>;
export type SolidPaint = z.infer<typeof solidPaintSchema>;
export type GradientPaint = z.infer<typeof linearGradientSchema> | z.infer<typeof radialGradientSchema>;
export type ImagePaint = z.infer<typeof imagePaintSchema>;
export type PaintType = Paint['type'];

/**
 * One colour standing in for a paint, for checks that need a single colour (contrast, readable ink,
 * outlines): the solid colour, the stop in the middle of a gradient, null for pictures.
 */
export function paintColor(p: Paint): Color | null {
  if (p.type === 'solid') return p.color;
  if (p.type === 'image') return null;
  const sorted = [...p.stops].sort((a, b) => a.position - b.position);
  return (sorted.find((s) => s.position >= 0.5) ?? sorted.at(-1)!).color;
}

export const strokeSchema = z.object({
  color: colorSchema,
  width: z.number().min(0).default(1),
  align: z.enum(['inside', 'center', 'outside']).default('inside'),
  visible: z.boolean().default(true),
});
export type Stroke = z.infer<typeof strokeSchema>;

const shadowFields = {
  x: z.number().default(0),
  y: z.number().default(4),
  blur: z.number().min(0).default(12),
  color: colorSchema,
  visible: z.boolean().default(true),
};

export const shadowSchema = z.object({ type: z.literal('drop-shadow'), ...shadowFields });
export const innerShadowSchema = z.object({ type: z.literal('inner-shadow'), ...shadowFields });
const blurFields = { radius: z.number().min(0).default(8), visible: z.boolean().default(true) };
export const layerBlurSchema = z.object({ type: z.literal('layer-blur'), ...blurFields }).describe('Blurs the node itself');
export const backgroundBlurSchema = z.object({ type: z.literal('background-blur'), ...blurFields }).describe('Blurs what is behind the node (frosted glass); needs a translucent fill');
export const effectSchema = z.discriminatedUnion('type', [shadowSchema, innerShadowSchema, layerBlurSchema, backgroundBlurSchema]);
export type Shadow = z.infer<typeof shadowSchema> | z.infer<typeof innerShadowSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type EffectType = Effect['type'];

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
  rotation: z.number().min(-360).max(360).default(0).describe('Degrees, clockwise, about the centre of the box. x/y/width/height stay the unrotated box'),
  sizing: z.object({ horizontal: sizingModeSchema, vertical: sizingModeSchema }).default({ horizontal: 'fixed', vertical: 'fixed' }),
  absolute: z.boolean().default(false).describe('Opt out of the parent auto-layout and keep x/y'),
  meta: z.record(z.string(), z.unknown()).default({}),
  bindings: z.record(z.string(), z.string()).optional().describe('Token bindings: property path (e.g. "fills.0.color", "cornerRadius", "padding") → variable id. The property follows the variable'),
};

const visual = {
  fills: z.array(paintSchema).default([]),
  strokes: z.array(strokeSchema).default([]),
  effects: z.array(effectSchema).default([]),
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
  justify: z.enum(['start', 'center', 'end', 'space-between', 'space-around']).default('start').describe('Main-axis distribution (in a grid: where an item sits in its cell)'),
  wrap: z.number().int().min(0).max(100).default(0).describe('Grid: at most this many items per line, then a new line (row layout: columns per row; column layout: items per column). 0 = one line'),
  lineGap: z.number().min(0).nullable().default(null).describe('Grid: space between lines (row gap of a row grid); null = same as gap'),
});

export const groupNodeSchema = z.object({ ...base, ...container, type: z.literal('group') });

export const rectNodeSchema = z.object({ ...base, ...visual, type: z.literal('rect'), cornerRadius: z.number().min(0).default(0) });

export const ellipseNodeSchema = z.object({ ...base, ...visual, type: z.literal('ellipse') });

/**
 * Canva-style text effect (one at a time). Sliders are 0–100 and scale with the font size, so an
 * effect looks the same at any size; `direction` is degrees (0 = right, 90 = down).
 */
export const TEXT_EFFECTS = ['drop', 'glow', 'echo', 'outline', 'background', 'splice', 'hollow', 'neon', 'glitch'] as const;
export const textEffectSchema = z.object({
  type: z.enum(TEXT_EFFECTS),
  color: colorSchema.optional().describe('Effect colour (shadow, outline, background…); default depends on the effect'),
  offset: z.number().min(0).max(100).default(50).describe('drop, echo, splice, glitch: distance'),
  direction: z.number().min(-180).max(180).default(45).describe('drop, echo, splice, glitch: degrees, 0 = right, 90 = down'),
  blur: z.number().min(0).max(100).default(0).describe('drop: softness'),
  transparency: z.number().min(0).max(100).default(60).describe('drop, glow, background: how see-through the effect is (0 = solid)'),
  thickness: z.number().min(0).max(100).default(50).describe('outline, splice, hollow: stroke width'),
  roundness: z.number().min(0).max(100).default(50).describe('background: corner rounding'),
  spread: z.number().min(0).max(100).default(50).describe('background: padding around the words; glow, neon: reach'),
  intensity: z.number().min(0).max(100).default(50).describe('neon: brightness of the glow'),
});
export type TextEffect = z.infer<typeof textEffectSchema>;
export type TextEffectType = TextEffect['type'];

/**
 * Rich text: a style for the characters [start, end) of `text` (UTF-16 offsets). Unset fields keep the
 * node's own style. Spans may not overlap; later spans win where they do.
 */
export const textSpanSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  fills: z.array(paintSchema).optional().describe('Colour of these characters'),
  fontFamily: z.string().optional(),
  fontSize: z.number().min(1).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
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
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  underline: z.boolean().default(false),
  strikethrough: z.boolean().default(false),
  textCase: z.enum(['none', 'upper', 'lower', 'title']).default('none').describe('Shown in this case; `text` keeps what was typed'),
  list: z.enum(['none', 'bullet', 'number']).default('none').describe('Each line (paragraph) becomes a list item'),
  textEffect: textEffectSchema.nullable().default(null),
  curve: z.number().min(-100).max(100).default(0).describe('Bends the text along an arc on one line: + arches up, − sags down'),
  spans: z.array(textSpanSchema).default([]).describe('Rich text: styles for ranges of `text`, e.g. a two-tone headline'),
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
  src: z.string().describe('asset:images/<file> in the document asset folder, an http(s) URL, or (legacy, written out on arrival) a data: URL'),
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

const pointSchema = z.object({ x: z.number(), y: z.number() });

export const connectorEndSchema = z.object({
  nodeId: nodeIdSchema.nullable().default(null).describe('Node this end sticks to; the line follows when it moves. null = a free end at x/y'),
  side: z.enum(['auto', 'top', 'right', 'bottom', 'left']).default('auto').describe('Side of the attached node the line leaves or enters; auto faces the other end'),
  x: z.number().default(0).describe('Free end in parent coordinates (kept up to date while attached)'),
  y: z.number().default(0),
});
export type ConnectorEnd = z.infer<typeof connectorEndSchema>;

const capSchema = z.enum(['none', 'arrow', 'dot']);

/** A line between two nodes or points, for flowcharts, workflows and page maps. Its box and `points` are derived from the ends. */
export const connectorNodeSchema = z.object({
  ...base,
  type: z.literal('connector'),
  start: connectorEndSchema.default({ nodeId: null, side: 'auto', x: 0, y: 0 }),
  end: connectorEndSchema.default({ nodeId: null, side: 'auto', x: 100, y: 0 }),
  routing: z.enum(['elbow', 'straight']).default('elbow').describe('elbow: 90° segments · straight: one direct line'),
  cornerRadius: z.number().min(0).default(8).describe('Rounding of elbow corners'),
  startCap: capSchema.default('none'),
  endCap: capSchema.default('arrow'),
  strokes: z.array(strokeSchema).default([]).describe('First visible stroke = line colour and width (default grey, 2px)'),
  points: z.array(pointSchema).default([]).describe('Computed route in node coordinates — read-only, rebuilt from start/end'),
});

export const nodeSchema = z.discriminatedUnion('type', [
  pageNodeSchema, frameNodeSchema, groupNodeSchema, rectNodeSchema, ellipseNodeSchema, textNodeSchema,
  polygonNodeSchema, pathNodeSchema, imageNodeSchema, stickyNodeSchema, embedNodeSchema, connectorNodeSchema,
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
export type ConnectorNode = z.infer<typeof connectorNodeSchema>;
export type Node = z.infer<typeof nodeSchema>;
export type NodeType = Node['type'];
export type ContainerNode = PageNode | FrameNode | GroupNode;

export const CONTAINER_TYPES: ReadonlySet<NodeType> = new Set(['page', 'frame', 'group']);
export const isContainer = (n: Node): n is ContainerNode => CONTAINER_TYPES.has(n.type);
export type VisualNode = Extract<Node, { fills: Paint[] }>;
export const hasVisual = (n: Node): n is VisualNode => 'fills' in n;

/** Input accepted when creating a node: everything except id/parentId is optional, children may be inline. */
export type NodeInput = Partial<Omit<Node, 'children'>> & { type: Exclude<NodeType, 'page'>; children?: NodeInput[] } & Record<string, unknown>;
