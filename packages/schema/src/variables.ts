import { z } from 'zod';
import { colorSchema } from './color';

/* Document-level data that is not a node: variables (DESIGN_SYSTEM/01, single theme in v1) and review comments (AGENT_BRIDGE/04). */

const variableBase = { id: z.string().min(1), name: z.string().min(1).describe('Slash path, e.g. color/accent') };

export const variableSchema = z.discriminatedUnion('type', [
  z.object({ ...variableBase, type: z.literal('color'), value: colorSchema }),
  z.object({ ...variableBase, type: z.literal('number'), value: z.number() }),
  z.object({ ...variableBase, type: z.literal('string'), value: z.string() }),
]);
export type Variable = z.infer<typeof variableSchema>;
export type VariableType = Variable['type'];

export const commentMessageSchema = z.object({
  id: z.string().min(1),
  author: z.string().describe('Display name'),
  text: z.string(),
  ts: z.number(),
});
export type CommentMessage = z.infer<typeof commentMessageSchema>;

export const commentSchema = z.object({
  id: z.string().min(1),
  /** With nodeId: offset from the node's top-left, so the pin follows it. Without: page coordinates. */
  nodeId: z.string().nullable().default(null),
  x: z.number(),
  y: z.number(),
  resolved: z.boolean().default(false),
  messages: z.array(commentMessageSchema).min(1),
});
export type Comment = z.infer<typeof commentSchema>;
