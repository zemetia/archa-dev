import { insertOpsFor } from '@archa/core';
import { importSvg } from '@archa/formats';
import type { NodeInput } from '@archa/schema';
import { commit, select, setTool, toast, useStore } from './store';
import { containerAt, originOf, toWorld } from './geometry';

/*
 * Image / SVG import (blueprint FILE_FORMATS/04). Runs in the renderer for image decoding; SVG goes
 * through the shared DOM-free parser. The result is ordinary insert ops.
 */

const MAX_IMAGE_SIDE = 2048;

/** Opens a file picker and places the image or SVG at the centre of the view. */
export function importImageOrSvg(): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        try {
          await importFile(file);
        } catch (e) {
          toast(`Import failed: ${(e as Error).message}`, 'error');
        }
      }
      resolve();
    };
    input.click();
  });
}

export async function importFile(file: File, at?: { x: number; y: number }) {
  const name = baseName(file);
  return place(await fileInput(file), at, `Import ${name}`);
}

/** The node an image or SVG file becomes (SVG as editable vectors when it can be). */
async function fileInput(file: File): Promise<NodeInput> {
  const name = baseName(file);
  if (isSvg(file)) {
    return svgInput(await file.text(), name);
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`);
  return imageInput(await readDataUrl(file), name);
}

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, '') || 'Image';
const isSvg = (file: File) => file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

/**
 * Files dropped on the canvas (photos from Explorer, a browser, the desktop): placed side by side
 * starting under the pointer, inside the frame there, then selected together.
 */
export async function dropFiles(files: File[], at: { x: number; y: number }) {
  const images = files.filter((f) => f.type.startsWith('image/') || isSvg(f));
  if (!images.length) {
    if (files.length) toast('Drop image files (PNG, JPG, WebP, GIF, SVG)', 'error');
    return;
  }
  const ids: string[] = [];
  let x = at.x;
  for (const f of images) {
    try {
      const input = await fileInput(f);
      const w = Number(input.width ?? 100);
      // The first image centres on the pointer; the next ones line up to its right.
      const cx = ids.length ? x + w / 2 : at.x;
      const id = await place(input, { x: cx, y: at.y }, `Drop ${baseName(f)}`);
      if (id) ids.push(id);
      x = cx + w / 2 + 24;
    } catch (e) {
      toast(`Could not import ${f.name}: ${(e as Error).message}`, 'error');
    }
  }
  if (ids.length > 1) select(ids);
}

/** Inserts a node centred on `at` (default: the middle of the view). `autoInk` lightens a dark icon dropped straight on the dark page. */
export async function place(input: NodeInput, at: { x: number; y: number } | undefined, label: string, opts: { autoInk?: boolean } = {}): Promise<string | null> {
  const st = useStore.getState();
  const doc = st.doc;
  if (!doc) return null;
  const host = document.querySelector('[data-canvas-host]');
  const c = at ?? toWorld(st.camera, (host?.clientWidth ?? 800) / 2, (host?.clientHeight ?? 600) / 2);
  const w = Number(input.width ?? 100), h = Number(input.height ?? 100);
  const parent = containerAt(doc, c.x, c.y);
  const o = originOf(doc, parent.id);
  // Icons are drawn in dark ink for light frames; straight on the dark page they get light ink to stay visible.
  if (opts.autoInk && input.type === 'path' && parent.type === 'page') {
    const light = (ps: unknown) => (Array.isArray(ps) ? ps.map((p) => (typeof p === 'string' ? '#d4d4d8' : { ...(p as object), color: '#d4d4d8' })) : ps);
    input = { ...input, strokes: light(input.strokes), fills: light(input.fills) } as NodeInput;
  }
  const { ops, rootId } = insertOpsFor({ ...input, x: Math.round(c.x - w / 2 - o.x), y: Math.round(c.y - h / 2 - o.y) }, parent.id);
  if (!(await commit(label, ops))) return null;
  select([rootId]);
  setTool('select');
  return rootId;
}

export async function imageInput(src: string, name: string): Promise<NodeInput> {
  const img = new Image();
  img.src = src;
  await img.decode();
  let w = img.naturalWidth || 300, h = img.naturalHeight || 200;
  let data = src;
  // Big bitmaps are downscaled once on import: the document carries the pixels (no asset store yet).
  if (!src.startsWith('data:image/svg') && Math.max(w, h) > MAX_IMAGE_SIDE) {
    const s = MAX_IMAGE_SIDE / Math.max(w, h);
    w = Math.round(w * s); h = Math.round(h * s);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    data = canvas.toDataURL(src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', 0.9);
  }
  // Large images land at a comfortable size; the pixels stay full resolution.
  const fit = Math.min(1, 800 / Math.max(w, h));
  return { type: 'image', name, src: data, fit: 'crop', width: Math.round(w * fit), height: Math.round(h * fit) };
}

const readDataUrl = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error ?? new Error('read failed'));
  r.readAsDataURL(file);
});

/* ---------------------------------- SVG ----------------------------------- */

/**
 * SVG markup → a node: editable vectors when every shape converts, else an exact image of it (the
 * shared parser in `@archa/formats`, the same one the agent `svg()` call uses). Throws on non-SVG.
 */
export function svgInput(svgText: string, name: string): NodeInput {
  return importSvg(svgText, { name }).node;
}
