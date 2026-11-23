import { commit, toast, useStore } from './store';

/*
 * Background removal (blueprint RENDERING/04): the image is squeezed to the model's 1024×1024 input
 * here, main runs the model in the ML host and returns a foreground mask, and the mask is stretched
 * back over the full-size pixels as alpha. The result replaces the image's src in one undoable op.
 */

const SIZE = 1024;

export const canRemoveBackground = (nodeId: string | undefined) => {
  const n = nodeId ? useStore.getState().doc?.get(nodeId) : undefined;
  return n?.type === 'image' && !useStore.getState().bgJob;
};

export async function removeBackground(nodeId: string) {
  const st = useStore.getState();
  const node = st.doc?.get(nodeId);
  if (node?.type !== 'image' || st.bgJob) return;
  const src = node.src;
  useStore.setState({ bgJob: { nodeId, phase: 'working', progress: 0 } });
  const off = window.archa.onModelProgress(({ received, total }) => {
    useStore.setState({ bgJob: { nodeId, phase: received < total ? 'download' : 'working', progress: total ? received / total : 0 } });
  });
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const { mask, error } = await window.archa.segment(rgbOf(img));
    if (!mask) throw new Error(error ?? 'Background removal failed');
    let sum = 0;
    for (let i = 0; i < mask.length; i++) sum += mask[i]!;
    if (sum / mask.length < 2) throw new Error('No clear subject found in this image');
    const png = applyMask(img, mask);
    // The image may have changed (or gone) while the model ran.
    const now = useStore.getState().doc?.get(nodeId);
    if (now?.type !== 'image' || now.src !== src) throw new Error('The image changed while removing its background — try again');
    if (await commit('Remove background', [{ op: 'update', id: nodeId, patch: { src: png } }])) toast('Background removed');
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    off();
    useStore.setState({ bgJob: null });
  }
}

/** The image stretched to 1024×1024, as packed RGB bytes. */
function rgbOf(img: HTMLImageElement): Uint8Array {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const rgba = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]!;
    rgb[j + 1] = rgba[i + 1]!;
    rgb[j + 2] = rgba[i + 2]!;
  }
  return rgb;
}

/** Full-size PNG of the image with the (upscaled) mask as its alpha. Existing transparency is kept. */
function applyMask(img: HTMLImageElement, mask: Uint8Array): string {
  const m = document.createElement('canvas');
  m.width = SIZE;
  m.height = SIZE;
  const md = new ImageData(SIZE, SIZE);
  for (let i = 0; i < mask.length; i++) md.data[i * 4 + 3] = mask[i]!;
  m.getContext('2d')!.putImageData(md, 0, 0);
  const w = img.naturalWidth || SIZE, h = img.naturalHeight || SIZE;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(m, 0, 0, w, h);
  return out.toDataURL('image/png');
}
