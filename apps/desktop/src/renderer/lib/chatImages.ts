import type { ChatImage } from '@archa/protocol';

/*
 * Images pasted into the chat composer. Each is re-encoded once in the renderer: the long side capped
 * where vision models stop gaining detail, and kept under the ~5 MB a single image may weigh.
 */

const MAX_SIDE = 1568;
const MAX_BYTES = 3_500_000;
const THUMB_SIDE = 160;
export const MAX_CHAT_IMAGES = 6;

/** Image files on a paste or drop, in order. */
export const imageFiles = (data: DataTransfer | null): File[] => [...(data?.files ?? [])].filter((f) => f.type.startsWith('image/'));

export async function toChatImage(file: File): Promise<ChatImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
    const s = Math.min(1, MAX_SIDE / Math.max(w, h));
    // Screenshots stay PNG (sharp text); photos and anything too heavy become JPEG.
    let dataUrl = draw(img, Math.round(w * s), Math.round(h * s), file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
    if (dataUrl.length * 0.75 > MAX_BYTES) dataUrl = draw(img, Math.round(w * s), Math.round(h * s), 'image/jpeg');
    const t = Math.min(1, THUMB_SIDE / Math.max(w, h));
    const thumb = draw(img, Math.max(1, Math.round(w * t)), Math.max(1, Math.round(h * t)), 'image/jpeg');
    const [head, data] = dataUrl.split(',', 2) as [string, string];
    return { mime: head.includes('image/png') ? 'image/png' : 'image/jpeg', data, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(img: HTMLImageElement, w: number, h: number, type: 'image/png' | 'image/jpeg'): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // JPEG has no alpha: transparent screenshots get a white backdrop instead of black.
  if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(type, 0.88);
}
