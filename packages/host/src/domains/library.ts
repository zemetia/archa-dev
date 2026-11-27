import { ArchaDocument, DocumentError, findEmptySpace, libraryInsertOps } from '@archa/core';
import { inlineData } from '@archa/protocol/node';
import type { HostContext } from '../context';
import type { Routes } from '../router';

/* Shared component library and the person's own icons (blueprint DESIGN_SYSTEM/02). */

export function libraryRoutes(ctx: HostContext): Routes {
  const { library, icons } = ctx;
  return {
    'library.list': () => library.list(),
    'library.publish': (p) => {
      // Libraries are shared across documents, so their images are stored inline (they move into each user's folder on insert).
      const s = ctx.session(p.docId);
      return library.publish(new ArchaDocument(inlineData(ctx.assetDir(s), s.doc.toData()), s.revision), p.nodeId, p.library, p.png);
    },
    'library.remove': (p) => { library.remove(p.library, p.id); },
    'library.insert': (p, conn) => {
      const s = ctx.session(p.docId);
      const item = library.read(p.library, p.id);
      if (!item) throw new DocumentError('NOT_FOUND', `Library component ${p.library}:${p.id} not found`);
      const parentId = p.parentId ?? s.doc.pages[0]!.rootId;
      const spot = p.x === undefined || p.y === undefined ? findEmptySpace(s.doc, parentId, item.width, item.height) : { x: p.x, y: p.y };
      const r = libraryInsertOps(s.doc, `${p.library}:${p.id}`, item, parentId, spot);
      const wasDirty = s.dirty;
      s.apply({ author: conn.author, label: `Insert ${item.name} from library`, baseRevision: s.revision, ops: r.ops });
      if (!wasDirty) ctx.broadcast('workspace.changed', ctx.summaries());
      return { nodeId: r.rootId, placed: r.placed };
    },
    'icons.custom.list': () => icons.list(),
    'icons.custom.add': (p) => icons.add(p.icons),
    'icons.custom.remove': (p) => { icons.remove(p.name); },
  };
}
