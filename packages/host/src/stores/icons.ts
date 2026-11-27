import { z } from 'zod';
import type { CustomIcon } from '@archa/icons';
import type { NodeInput } from '@archa/schema';
import { customIconSchema, RPC } from '@archa/protocol';
import { paths, readJson, writeJsonAtomic } from '@archa/protocol/node';

/*
 * Icons the person uploaded (blueprint DESIGN_SYSTEM/05 → My icons): one file per machine,
 * ARCHA_HOME/icons/custom.json, shared by every document and by agents as `icon("my:<name>")`.
 */

const file = paths.customIcons;

const iconSchema = customIconSchema;
export const iconsAddSchema = RPC['icons.custom.add'].params;
export const iconsRemoveSchema = RPC['icons.custom.remove'].params;
const fileSchema = z.object({ format: z.literal('archa-icons'), icons: z.array(iconSchema.extend({ addedAt: z.number() })) });

/** Largest stored icon (JSON chars incl. preview): an icon or logo, not a whole illustration. */
const MAX_ICON_CHARS = 4_000_000;

export class IconStore {
  private cache: CustomIcon[] | null = null;

  list(): CustomIcon[] {
    if (this.cache) return this.cache;
    // A broken file is kept aside (quarantine) rather than overwritten, so nothing is lost.
    const stored = readJson(file(), fileSchema, { format: 'archa-icons', icons: [] }, { quarantine: true });
    this.cache = stored.icons.map((i) => ({ ...i, node: i.node as NodeInput }));
    return this.cache;
  }

  get(name: string): CustomIcon | undefined {
    const key = name.trim().toLowerCase();
    return this.list().find((i) => i.name.toLowerCase() === key);
  }

  /** Adds icons; a taken name gets a numeric suffix. Returns the stored icons. */
  add(input: z.infer<typeof iconsAddSchema>['icons']): CustomIcon[] {
    const list = [...this.list()];
    const added: CustomIcon[] = [];
    for (const i of input) {
      if (JSON.stringify(i.node).length + (i.preview?.length ?? 0) > MAX_ICON_CHARS) throw new Error(`"${i.name}" is too large for an icon (over 4 MB)`);
      let name = i.name.trim();
      for (let n = 2; list.some((x) => x.name.toLowerCase() === name.toLowerCase()); n++) name = `${i.name.trim()}-${n}`;
      const icon: CustomIcon = { name, width: i.width, height: i.height, node: { ...i.node, name } as NodeInput, addedAt: Date.now(), ...(i.preview ? { preview: i.preview } : {}) };
      list.push(icon);
      added.push(icon);
    }
    this.save(list);
    return added;
  }

  remove(name: string): void {
    this.save(this.list().filter((i) => i.name.toLowerCase() !== name.trim().toLowerCase()));
  }

  private save(list: CustomIcon[]) {
    writeJsonAtomic(file(), { format: 'archa-icons', icons: list }, { indent: 0 });
    this.cache = list;
  }
}
