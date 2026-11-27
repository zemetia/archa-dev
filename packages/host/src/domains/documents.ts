import { normalize } from 'node:path';
import { z } from 'zod';
import { DocumentError } from '@archa/core';
import { opSchema, type Op } from '@archa/schema';
import type { ChatRunner } from '@archa/agents';
import type { HostContext } from '../context';
import type { DocumentFiles } from '../files';
import { projectFiles, projectRoot } from '../projects';
import type { Routes } from '../router';

/* Documents: open, save, close and edit as ops; window restore and app settings (blueprint ARCHITECTURE/04, FILE_FORMATS/01, /05). */

export function documentRoutes(ctx: HostContext, files: DocumentFiles, chat: ChatRunner): Routes {
  return {
    'workspace.list': () => ctx.summaries(),
    'workspace.restore': ({ project }) => files.restore(project),
    'project.files': ({ project }) => {
      const key = (p: string) => normalize(p).toLowerCase();
      return projectFiles(projectRoot(project)).map((f) => ({ ...f, docId: [...ctx.sessions.values()].find((s) => s.filePath && key(s.filePath) === key(f.path))?.id ?? null }));
    },
    // project omitted (agents, CLI): the context of the document used last.
    'doc.new': ({ name, project }) => ({ docId: ctx.newDoc(name ?? 'Untitled', project === undefined ? ctx.projectOf(ctx.lastDocId) : project) }),
    'doc.open': async ({ path, project }) => ({ docId: await files.open(path, project) }),
    'doc.save': async ({ docId, path }) => ({ path: await files.save(ctx.session(docId), path) }),
    'doc.close': ({ docId }) => {
      ctx.forget(docId);
      files.closed(docId);
      chat.store.forget(docId);
      ctx.broadcast('workspace.changed', ctx.summaries());
    },
    'settings.get': () => files.settings,
    'settings.set': (patch) => files.applySettings(patch),
    'doc.rename': ({ docId, name }) => {
      ctx.session(docId).doc.meta.name = name;
      ctx.broadcast('workspace.changed', ctx.summaries());
    },
    'doc.snapshot': ({ docId }) => {
      const s = ctx.session(docId);
      return { data: s.doc.toData(), revision: s.revision };
    },
    'doc.apply': ({ docId, baseRevision, ops, label }, conn) => {
      const parsed = z.array(opSchema).safeParse(ops);
      if (!parsed.success) throw new DocumentError('VALIDATION', `Invalid ops: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      const s = ctx.session(docId);
      const wasDirty = s.dirty;
      const a = s.apply({ author: conn.author, label, baseRevision, ops: ops as Op[] });
      if (!wasDirty) ctx.broadcast('workspace.changed', ctx.summaries());
      return { revision: a.revision, txnId: a.txnId };
    },
    'doc.undo': ({ docId }, conn) => {
      const a = ctx.session(docId).undo(conn.author);
      return a ? { revision: a.revision } : null;
    },
    'doc.redo': ({ docId }, conn) => {
      const a = ctx.session(docId).redo(conn.author);
      return a ? { revision: a.revision } : null;
    },
    'selection.set': ({ docId, ids }, conn) => {
      ctx.selection.set(docId, ids);
      ctx.lastDocId = docId;
      ctx.broadcast('selection.changed', { docId, ids, by: conn.author });
    },
  };
}
