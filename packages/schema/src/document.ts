import { z } from 'zod';
import type { Node } from './nodes';
import type { Comment, Variable } from './variables';

/**
 * 2: polygon, path, image, sticky and embed nodes; document variables and comments.
 * 3: inner-shadow, layer-blur and background-blur effects; justify "space-around".
 */
export const FORMAT_VERSION = 3;

export const pageRefSchema = z.object({ id: z.string(), name: z.string(), rootId: z.string() });
export type PageRef = z.infer<typeof pageRefSchema>;

export const documentMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  formatVersion: z.number().int(),
  createdWith: z.string(),
});
export type DocumentMeta = z.infer<typeof documentMetaSchema>;

/** Serialised document: what a snapshot, an RPC reply and a `.archa` file carry. */
export type DocumentData = {
  meta: DocumentMeta;
  pages: PageRef[];
  nodes: Record<string, Node>;
  variables?: Variable[];
  comments?: Comment[];
};

export const archaManifestSchema = z.object({
  format: z.literal('archa'),
  formatVersion: z.number().int(),
  id: z.string(),
  name: z.string(),
  createdWith: z.string(),
  pages: z.array(z.object({ id: z.string(), name: z.string(), rootId: z.string(), entry: z.string() })),
});
export type ArchaManifest = z.infer<typeof archaManifestSchema>;
