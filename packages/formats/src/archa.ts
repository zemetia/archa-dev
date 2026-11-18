import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { archaManifestSchema, FORMAT_VERSION, nodeSchema, type DocumentData, type Node } from '@archa/schema';

export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

const json = (v: unknown) => strToU8(`${JSON.stringify(v, null, 2)}\n`);

/** Packs a document into `.archa` bytes (blueprint FILE_FORMATS/01). Derived data is never written. */
export function encodeArcha(data: DocumentData): Uint8Array {
  const pages = data.pages.map((p) => ({ ...p, entry: `pages/${p.id}.json` }));
  const files: Zippable = {
    'manifest.json': [json({ format: 'archa', formatVersion: FORMAT_VERSION, id: data.meta.id, name: data.meta.name, createdWith: data.meta.createdWith, pages }), { level: 6 }],
    'document.json': [json({ meta: data.meta }), { level: 6 }],
  };
  for (const p of pages) {
    const ids = collectSubtree(data.nodes, p.rootId);
    const nodes: Record<string, Node> = {};
    for (const id of ids.sort()) nodes[id] = data.nodes[id]!;
    files[p.entry] = [json({ rootId: p.rootId, nodes }), { level: 6 }];
  }
  return zipSync(files);
}

export function decodeArcha(bytes: Uint8Array): DocumentData {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new FormatError('Not a valid .archa file (zip could not be read)');
  }
  const read = (name: string) => {
    const e = entries[name];
    if (!e) throw new FormatError(`.archa is missing ${name}`);
    return JSON.parse(strFromU8(e)) as unknown;
  };
  const manifest = archaManifestSchema.safeParse(read('manifest.json'));
  if (!manifest.success) throw new FormatError(`Invalid manifest.json: ${manifest.error.issues[0]?.message}`);
  const m = manifest.data;
  if (m.formatVersion > FORMAT_VERSION) throw new FormatError(`File format ${m.formatVersion} is newer than this app (${FORMAT_VERSION}). Update ArchaDev.`);
  const nodes: Record<string, Node> = {};
  for (const p of m.pages) {
    const page = read(p.entry) as { nodes: Record<string, unknown> };
    for (const [id, raw] of Object.entries(page.nodes)) {
      const parsed = nodeSchema.safeParse(raw);
      if (!parsed.success) throw new FormatError(`Node ${id} in ${p.entry} is invalid: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      nodes[id] = parsed.data;
    }
  }
  return {
    meta: { id: m.id, name: m.name, formatVersion: FORMAT_VERSION, createdWith: m.createdWith },
    pages: m.pages.map(({ id, name, rootId }) => ({ id, name, rootId })),
    nodes,
  };
}

function collectSubtree(nodes: Record<string, Node>, rootId: string): string[] {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    const n = nodes[id];
    if (!n) continue;
    out.push(id);
    if ('children' in n) stack.push(...n.children);
  }
  return out;
}
