import { z } from 'zod';
import { nodeIdSchema, type Node } from './nodes';

export const insertOpSchema = z.object({
  op: z.literal('insert'),
  node: z.record(z.string(), z.unknown()),
  parentId: nodeIdSchema,
  index: z.number().int().min(0).optional(),
});
export const updateOpSchema = z.object({ op: z.literal('update'), id: nodeIdSchema, patch: z.record(z.string(), z.unknown()) });
export const moveOpSchema = z.object({ op: z.literal('move'), id: nodeIdSchema, parentId: nodeIdSchema, index: z.number().int().min(0).optional() });
export const deleteOpSchema = z.object({ op: z.literal('delete'), id: nodeIdSchema });

export const opSchema = z.discriminatedUnion('op', [insertOpSchema, updateOpSchema, moveOpSchema, deleteOpSchema]);

/** `insert.node` is a full node at apply time; the schema keeps it loose so validation can name the bad property. */
export type InsertOp = { op: 'insert'; node: Node; parentId: string; index?: number };
export type UpdateOp = { op: 'update'; id: string; patch: Record<string, unknown> };
export type MoveOp = { op: 'move'; id: string; parentId: string; index?: number };
export type DeleteOp = { op: 'delete'; id: string };
export type Op = InsertOp | UpdateOp | MoveOp | DeleteOp;

export const authorSchema = z.object({
  kind: z.enum(['user', 'agent', 'plugin', 'system']),
  id: z.string(),
  name: z.string().optional(),
});
export type Author = z.infer<typeof authorSchema>;

export type Transaction = {
  id: string;
  author: Author;
  label: string;
  baseRevision: number;
  ops: Op[];
};

export type Issue = { rule: string; nodeId: string; nodeName: string; message: string; remedy: string };
