import { z } from 'zod';
import { colorSchema } from './color';

export const nodeIdSchema = z.string().min(1).describe('Node id');
export type NodeId = string;

const sizingModeSchema = z.enum(['fixed', 'hug', 'fill']).describe('fixed: own size · hug: fit children/text · fill: take the remaining space of an auto-layout parent');

export const paintSchema = z.object({
  type: z.literal('solid'),
  color: colorSchema,
  visible: z.boolean().default(true),
});
export type Paint = z.infer<typeof paintSchema>;

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
  sizing: z.object({ horizontal: sizingModeSchema, vertical: sizingModeSchema }).default({ horizontal: 'fixed', vertical: 'fixed' }),
  absolute: z.boolean().default(false).describe('Opt out of the parent auto-layout and keep x/y'),
  meta: z.record(z.string(), z.unknown()).default({}),
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
  justify: z.enum(['start', 'center', 'end', 'space-between', 'space-around']).default('start').describe('Main-axis distribution'),
});

export const groupNodeSchema = z.object({ ...base, ...container, type: z.literal('group') });

export const rectNodeSchema = z.object({ ...base, ...visual, type: z.literal('rect'), cornerRadius: z.number().min(0).default(0) });

export const ellipseNodeSchema = z.object({ ...base, ...visual, type: z.literal('ellipse') });

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
  src: z.string().describe('data: URL (png, jpeg, webp, gif or svg)'),
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
