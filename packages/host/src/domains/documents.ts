import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { z } from 'zod';
import { DocumentError, DocumentSession } from '@archa/core';
import { decodeArcha, encodeArcha } from '@archa/formats';
import { newId, opSchema, type Op } from '@archa/schema';
import { assetDirFor, dataDirFor, externalizeData, isRuntimeDataDir, migrateDataDir, moveDataDir } from '@archa/protocol/node';
import type { ChatRunner } from '@archa/agents';
import type { HostContext } from '../context';
import { validated, type Routes } from '../router';

/* Documents: open, save, close and edit as ops (blueprint ARCHITECTURE/04, FILE_FORMATS/01). */

/** An id, `.archa` path or name (`ctx.session` resolves it). */
const docId = z.string().min(1).max(4096);
const docName = z.string().max(10_000);
const filePath = z.string().min(1).max(4096);
export const docNewSchema = z.object({ name: docName.optional() });
export const docRefSchema = z.object({ docId });
export const docOpenSchema = z.object({ path: filePath });
/** Empty `docId` = the active document (MCP `save_document` without `doc`). */
export const docSaveSchema = z.object({ docId: z.string().max(4096), path: filePath.optional() });
export const docRenameSchema = z.object({ docId, name: docName });
export const docApplySchema = z.object({ docId, baseRevision: z.number().int().min(0), ops: z.array(z.unknown()), label: z.string().max(10_000) });
export const selectionSetSchema = z.object({ docId, ids: z.array(z.string().min(1).max(200)).max(100_000) });

export function documentRoutes(ctx: HostContext, chat: ChatRunner): Routes {
  return {
    'workspace.list': () => ctx.summaries(),
    'doc.new': validated(docNewSchema, ({ name }) => ({ docId: ctx.newDoc(name ?? 'Untitled') })),
    'doc.open': validated(docOpenSchema, async ({ path }) => {
      const existing = [...ctx.sessions.values()].find((s) => s.filePath === path);
      if (existing) return { docId: existing.id };
      const data = decodeArcha(new Uint8Array(await readFile(path)));
      if (ctx.sessions.has(data.meta.id)) data.meta.id = newId();
      // A pre-1.7.3 `<name>-asset/` folder moves into `<name>-data/`.
      migrateDataDir(path, data.meta.id);
      // Older files carry images as base64: write them out to `<name>-data/assets/`; the next save drops the base64.
      const moved = externalizeData(assetDirFor(path, data.meta.id), data);
      const s = new DocumentSession(data, path);
      s.dirty = moved > 0;
      return { docId: ctx.register(s) };
    }),
    'doc.save': validated(docSaveSchema, async ({ docId, path }) => {
      const s = ctx.session(docId);
      if (path && !isAbsolute(path)) throw new DocumentError('VALIDATION', `Save path must be absolute (got "${path}")`);
      const target = path ? (/\.archa$/i.test(path) ? path : `${path}.archa`) : s.filePath;
      if (!target) throw new DocumentError('VALIDATION', 'No file path yet — choose where to save');
      // The data folder travels with the file: a first save or Save As copies it to `<new name>-data/`.
      migrateDataDir(target, s.id);
      const fromDir = ctx.dataDir(s);
      const toDir = dataDirFor(target, s.id);
      if (fromDir !== toDir) moveDataDir(fromDir, toDir, isRuntimeDataDir(fromDir));
      const tmp = `${target}.tmp`;
      await writeFile(tmp, encodeArcha(s.doc.toData()));
      await rename(tmp, target);
      s.filePath = target;
      s.dirty = false;
      if (path && s.doc.meta.name === 'Untitled') s.doc.meta.name = basename(target).replace(/\.archa$/i, '');
      ctx.broadcast('workspace.changed', ctx.summaries());
      return { path: target };
    }),
    'doc.close': validated(docRefSchema, ({ docId }) => {
      ctx.sessions.delete(docId);
      chat.store.forget(docId);
      if (!ctx.sessions.size) ctx.newDoc('Untitled');
      ctx.lastDocId = [...ctx.sessions.keys()].at(-1) ?? null;
      ctx.broadcast('workspace.changed', ctx.summaries());
    }),
    'doc.rename': validated(docRenameSchema, ({ docId, name }) => {
      ctx.session(docId).doc.meta.name = name;
      ctx.broadcast('workspace.changed', ctx.summaries());
    }),
    'doc.snapshot': validated(docRefSchema, ({ docId }) => {
      const s = ctx.session(docId);
      return { data: s.doc.toData(), revision: s.revision };
    }),
    'doc.apply': validated(docApplySchema, ({ docId, baseRevision, ops, label }, conn) => {
      const parsed = z.array(opSchema).safeParse(ops);
      if (!parsed.success) throw new DocumentError('VALIDATION', `Invalid ops: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      const s = ctx.session(docId);
      const wasDirty = s.dirty;
      const a = s.apply({ author: conn.author, label, baseRevision, ops: ops as Op[] });
      if (!wasDirty) ctx.broadcast('workspace.changed', ctx.summaries());
      return { revision: a.revision, txnId: a.txnId };
    }),
    'doc.undo': validated(docRefSchema, ({ docId }, conn) => {
      const a = ctx.session(docId).undo(conn.author);
      return a ? { revision: a.revision } : null;
    }),
    'doc.redo': validated(docRefSchema, ({ docId }, conn) => {
      const a = ctx.session(docId).redo(conn.author);
      return a ? { revision: a.revision } : null;
    }),
    'selection.set': validated(selectionSetSchema, ({ docId, ids }, conn) => {
      ctx.selection.set(docId, ids);
      ctx.lastDocId = docId;
      ctx.broadcast('selection.changed', { docId, ids, by: conn.author });
    }),
  };
}
