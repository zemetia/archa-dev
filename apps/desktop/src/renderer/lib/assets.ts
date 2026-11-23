import { CUSTOM_SET, customIconNode, getIcon, iconNode, loadIconSet, parseIconRef } from '@archa/icons';
import type { NodeInput } from '@archa/schema';
import { imageInput, place, svgInput } from './importers';
import { toast, useStore } from './store';

/*
 * Assets panel actions (blueprint DESIGN_SYSTEM/05): build the node for an icon / logo / uploaded icon,
 * insert it (click = middle of the view, drop = pointer), and manage the person's uploaded icons.
 */

/** Drag payload from the Assets panel to the canvas: an icon ref such as "tabler:home". */
export const ASSET_MIME = 'application/x-archa-icon';

export type AssetStyle = {
  size: number;
  /** null = automatic: dark ink, light when dropped straight on the dark page. */
  color: string | null;
  /** Logos in their brand colour (otherwise they follow `color`). */
  brandColors: boolean;
};

let current: AssetStyle = { size: 24, color: null, brandColors: true };
/** Size and colour last picked in the Assets panel; a drop on the canvas uses them too. */
export const assetStyle = () => current;
export const setAssetStyle = (s: AssetStyle) => { current = s; };

/** The node an asset ref inserts, or null if it does not exist. */
export async function assetNode(ref: string, style: AssetStyle): Promise<{ node: NodeInput; autoInk: boolean } | null> {
  const { set, name } = parseIconRef(ref);
  if (set === CUSTOM_SET) {
    const mine = (useStore.getState().customIcons ?? []).find((i) => i.name === name);
    return mine ? { node: customIconNode(mine, { size: style.size, color: style.color ?? undefined }), autoInk: false } : null;
  }
  const icon = getIcon(await loadIconSet(set), name);
  if (!icon) return null;
  const brand = !!icon.brand && style.brandColors;
  const node = iconNode(icon, { size: style.size, color: brand ? undefined : style.color ?? '#18181b' });
  return { node, autoInk: !brand && style.color === null };
}

export async function insertAsset(ref: string, style: AssetStyle, at?: { x: number; y: number }) {
  const r = await assetNode(ref, style);
  if (!r) { toast(`Icon "${ref}" not found`, 'error'); return; }
  await place(r.node, at, `Insert ${String(r.node.name ?? ref)}`, { autoInk: r.autoInk });
}

/* ------------------------------- My icons ------------------------------- */

export async function loadCustomIcons() {
  const { client } = useStore.getState();
  if (client) useStore.setState({ customIcons: await client.call('icons.custom.list') });
}

const readText = (f: File) => f.text();
const readDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

/** SVG files become editable vectors (one colour can be changed later); other SVGs and PNG/JPG/WebP become images. */
export async function uploadIcons(files: File[]) {
  const { client } = useStore.getState();
  if (!client || !files.length) return;
  const icons: Array<{ name: string; width: number; height: number; node: NodeInput; preview: string }> = [];
  for (const f of files) {
    const name = f.name.replace(/\.[^.]+$/, '').trim() || 'Icon';
    try {
      let node: NodeInput | null = null;
      let preview = '';
      if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) {
        const text = await readText(f);
        preview = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        node = svgInput(text, name);
      } else if (/^image\//.test(f.type)) {
        preview = await readDataUrl(f);
        node = await imageInput(preview, name);
      }
      if (!node) { toast(`${f.name}: not an SVG or image`, 'error'); continue; }
      icons.push({ name, width: Number(node.width) || 24, height: Number(node.height) || 24, node: { ...node, x: 0, y: 0 } as NodeInput, preview });
    } catch (e) {
      toast(`${f.name}: ${(e as Error).message}`, 'error');
    }
  }
  if (!icons.length) return;
  try {
    const added = await client.call('icons.custom.add', { icons });
    await loadCustomIcons();
    toast(`Added ${added.length} icon${added.length > 1 ? 's' : ''} to My icons`);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function removeCustomIcon(name: string) {
  const { client } = useStore.getState();
  if (!client) return;
  await client.call('icons.custom.remove', { name });
  await loadCustomIcons();
}
