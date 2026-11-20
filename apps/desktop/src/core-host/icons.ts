import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { CustomIcon } from '@archa/icons';
import type { NodeInput } from '@archa/schema';
import { archaHome } from '@archa/protocol/node';

/*
 * Icons the person uploaded (blueprint DESIGN_SYSTEM/05 → My icons): one file per machine,
 * ARCHA_HOME/icons/custom.json, shared by every document and by agents as `icon("my:<name>")`.
 */

const file = () => join(archaHome(), 'icons', 'custom.json');

const iconSchema = z.object({
  name: z.string().trim().min(1).max(80),
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
  node: z.record(z.string(), z.unknown()).refine((n) => typeof n.type === 'string', 'node.type is required'),
  preview: z.string().startsWith('data:image/').max(1_500_000).optional(),
});
export const iconsAddSchema = z.object({ icons: z.array(iconSchema).min(1).max(200) });
export const iconsRemoveSchema = z.object({ name: z.string().min(1).max(80) });
const fileSchema = z.object({ format: z.literal('archa-icons'), icons: z.array(iconSchema.extend({ addedAt: z.number() })) });

/** Largest stored icon (JSON chars incl. preview): an icon or logo, not a whole illustration. */
const MAX_ICON_CHARS = 4_000_000;

export class IconStore {
  private cache: CustomIcon[] | null = null;

  list(): CustomIcon[] {
    if (this.cache) return this.cache;
    try {
      this.cache = existsSync(file()) ? fileSchema.parse(JSON.parse(readFileSync(file(), 'utf8'))).icons.map((i) => ({ ...i, node: i.node as NodeInput })) : [];
    } catch {
      // A broken file is kept aside rather than overwritten, so nothing is lost.
      renameSync(file(), `${file()}.broken-${Date.now()}`);
      this.cache = [];
    }
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
    mkdirSync(dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    writeFileSync(tmp, JSON.stringify({ format: 'archa-icons', icons: list }));
    renameSync(tmp, file());
    this.cache = list;
  }
}
