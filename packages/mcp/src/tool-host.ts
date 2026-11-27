import { DocumentError, type DocumentSession, type LibraryComponent } from '@archa/core';
import type { CustomIcon } from '@archa/icons';
import type { Author } from '@archa/schema';
import type { ClientInfo, CoreEvents, CoreMethods, DocSummary, LibraryItem, Shot, TrailStep } from '@archa/protocol';

/** What a window sends back for a render / reference / compare request. */
export type RenderReply = Omit<CoreMethods['render.respond']['params'], 'requestId'>;

/** The calling client, as far as the agent tools need it (a host connection satisfies it). */
export type Caller = { id: string; author: Author; client: ClientInfo; threadId?: string };

/**
 * What `execute`, `get_state` and the reference tools need from the core host. The host implements
 * it; this package never imports the host (blueprint STRUCTURE/02 → Dependency Direction).
 */
export interface ToolHost {
  session(ref?: string): DocumentSession;
  readonly selection: { get(docId: string): string[] | undefined };
  summaries(): DocSummary[];
  dataDir(s: DocumentSession): string;
  assetDir(s: DocumentSession): string;
  log(docId: string, author: Author, tool: string, text: string, nodeIds?: string[], runId?: string): void;
  trail(caller: Caller, docId: string, steps: TrailStep[]): void;
  screenshot(caller: Caller, docId: string, nodeId: string, scale?: number, opts?: { slices?: boolean }): Promise<Shot>;
  askRenderer<E extends 'render.request' | 'render.reference' | 'render.compare'>(event: E, data: (requestId: string) => CoreEvents[E], timeoutMs?: number): Promise<RenderReply>;
  readonly library: { read(library: string, id: string): LibraryComponent | null; list(): LibraryItem[] };
  readonly icons: { get(name: string): CustomIcon | undefined; list(): CustomIcon[] };
}

/** A node by id, or by a name that matches exactly one node. */
export function resolveRef(s: DocumentSession, ref: string): string {
  if (s.doc.get(ref)) return ref;
  const byName = s.doc.findByName(ref);
  if (byName.length === 1) return byName[0]!.id;
  if (byName.length > 1) throw new DocumentError('VALIDATION', `Name "${ref}" matches ${byName.length} nodes — use an id`);
  throw new DocumentError('NOT_FOUND', `No node with id or name "${ref}"`);
}

/** One cursor step for the agent trail on the canvas. */
export function trailStep(s: DocumentSession, action: TrailStep['action'], id: string): TrailStep {
  return { action, nodeId: id, name: s.doc.require(id).name, bounds: s.doc.worldBounds(id) };
}
