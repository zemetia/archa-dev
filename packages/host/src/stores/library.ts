import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { componentMeta, DocumentError, libraryRef, subtreeInput, type ArchaDocument, type LibraryComponent } from '@archa/core';
import type { LibraryItem } from '@archa/protocol';
import { paths, readJson, writeJsonAtomic, listDir } from '@archa/protocol/node';

/*
 * Global libraries (blueprint DESIGN_SYSTEM/02): ARCHA_HOME/libraries/<name>/
 *   library.json              { format: 'archa-library', name, version, exports: { components } }
 *   components/<id>.json      LibraryComponent
 *   components/<id>.png       optional thumbnail (rendered by the window at publish time)
 * A library is plain files: deleting a thumbnail only loses the preview.
 */

export const DEFAULT_LIBRARY = 'my-library';
const nameRe = /^[A-Za-z0-9_-]{1,64}$/;
const libName = z.string().regex(nameRe, 'Library and component ids use letters, digits, - and _');

export const libraryPublishSchema = z.object({
  docId: z.string().min(1),
  nodeId: z.string().min(1),
  library: libName.default(DEFAULT_LIBRARY),
  png: z.string().max(4_000_000).optional(),
});
export const libraryItemSchema = z.object({ library: libName, id: libName });
export const libraryInsertSchema = libraryItemSchema.extend({
  docId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
});

const storedSchema = z.object({
  id: z.string(), name: z.string(), description: z.string().default(''),
  width: z.number(), height: z.number(), node: z.record(z.string(), z.unknown()),
  publishedAt: z.number().default(0),
});

const dirOf = paths.library;
const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);

export class LibraryStore {
  list(): LibraryItem[] {
    const out: LibraryItem[] = [];
    for (const library of listDir(paths.libraries(), (n) => nameRe.test(n))) {
      const comps = join(dirOf(library), 'components');
      for (const f of listDir(comps, (n) => n.endsWith('.json'))) {
        const item = this.read(library, f.slice(0, -5));
        if (!item) continue;
        const png = join(comps, `${item.id}.png`);
        out.push({
          library, id: item.id, ref: `${library}:${item.id}`, name: item.name, description: item.description,
          width: item.width, height: item.height, publishedAt: item.publishedAt,
          thumb: existsSync(png) ? `data:image/png;base64,${readFileSync(png).toString('base64')}` : undefined,
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(library: string, id: string): (LibraryComponent & { publishedAt: number }) | null {
    const file = join(dirOf(library), 'components', `${safeId(id)}.json`);
    return readJson(file, storedSchema, null) as (LibraryComponent & { publishedAt: number }) | null;
  }

  /** Publish a component (or any frame) from an open document. Re-publishing the same main overwrites it. */
  publish(doc: ArchaDocument, nodeId: string, library: string, png?: string): LibraryItem {
    const n = doc.require(nodeId);
    if (n.type !== 'frame') throw new DocumentError('VALIDATION', `Only frames can be published — "${n.name}" is a ${n.type}`);
    // A main that came from a library keeps its id there, so publishing it again updates the same entry.
    const fromRef = libraryRef(n);
    const id = safeId(fromRef?.startsWith(`${library}:`) ? fromRef.slice(library.length + 1) : n.id);
    const item = { id, name: n.name, description: componentMeta(n)?.description ?? '', width: n.width, height: n.height, node: subtreeInput(doc, nodeId), publishedAt: Date.now() };
    const comps = join(dirOf(library), 'components');
    writeJsonAtomic(join(comps, `${id}.json`), item, { indent: 0 });
    const pngFile = join(comps, `${id}.png`);
    if (png) writeFileSync(pngFile, Buffer.from(png.replace(/^data:image\/png;base64,/, ''), 'base64'));
    this.writeManifest(library);
    return { library, id, ref: `${library}:${id}`, name: item.name, description: item.description, width: item.width, height: item.height, publishedAt: item.publishedAt, thumb: png ? `data:image/png;base64,${png.replace(/^data:image\/png;base64,/, '')}` : undefined };
  }

  remove(library: string, id: string) {
    const comps = join(dirOf(library), 'components');
    for (const ext of ['json', 'png']) rmSync(join(comps, `${safeId(id)}.${ext}`), { force: true });
    if (existsSync(dirOf(library))) this.writeManifest(library);
  }

  private writeManifest(library: string) {
    const comps = join(dirOf(library), 'components');
    const ids = listDir(comps, (f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    writeJsonAtomic(join(dirOf(library), 'library.json'), { format: 'archa-library', name: library, version: '1.0.0', exports: { components: ids } });
  }
}
