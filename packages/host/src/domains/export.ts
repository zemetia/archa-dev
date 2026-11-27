import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { ArchaDocument, DocumentError } from '@archa/core';
import { exportHtml, exportHtmlStandalone, exportSvg } from '@archa/formats';
import { inlineData } from '@archa/protocol/node';
import type { HostContext } from '../context';
import type { Routes } from '../router';

/* Export panel: files, standalone page HTML and code (blueprint RENDERING/03, DESIGN_SYSTEM). */


export function exportRoutes(ctx: HostContext): Routes {
  /** Exported files stand alone: asset images are inlined, then the HTML exporter writes its own copies. */
  const standalone = (docId: string) => {
    const s = ctx.session(docId);
    return new ArchaDocument(inlineData(ctx.assetDir(s), s.doc.toData()), s.revision);
  };
  return {
    'export.save': async ({ docId, nodeId, format, path, image }) => {
      if (!isAbsolute(path)) throw new DocumentError('VALIDATION', 'path: Export path must be absolute');
      const doc = standalone(docId);
      if (format === 'png' || format === 'jpg') {
        if (!image) throw new DocumentError('VALIDATION', `${format.toUpperCase()} export needs the rendered image`);
        await writeFile(path, Buffer.from(image, 'base64'));
        return { files: [path] };
      }
      if (format === 'svg') {
        await writeFile(path, exportSvg(doc, nodeId));
        return { files: [path] };
      }
      // HTML: the page goes where the person chose; its CSS and image assets go next to it.
      const dir = dirname(path);
      const files = exportHtml(doc, nodeId, { style: format === 'tailwind' ? 'tailwind' : 'css', name: basename(path, extname(path)) });
      const written: string[] = [];
      for (const f of files) {
        const target = join(dir, f.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, f.data);
        written.push(target);
      }
      return { files: written };
    },
    'export.page': ({ docId, nodeId }) => {
      const n = ctx.session(docId).doc.require(nodeId);
      return { html: exportHtmlStandalone(standalone(docId), nodeId), width: n.width, height: n.height };
    },
    'export.code': ({ docId, nodeId, style }) => {
      const s = ctx.session(docId);
      if (style === 'css') return { code: exportHtmlStandalone(s.doc, nodeId) };
      const [page] = exportHtml(s.doc, nodeId, { style: 'tailwind', inlineAssets: true });
      return { code: String(page!.data) };
    },
  };
}
