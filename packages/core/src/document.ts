import {
  FORMAT_VERSION, isContainer, newId, nodeSchema,
  type DocumentData, type Node, type NodeId, type PageRef, type ContainerNode,
} from '@archa/schema';

export type Rect = { x: number; y: number; width: number; height: number };

/** In-memory document. Flat node map, tree via parentId + children (blueprint DOCUMENT_MODEL/01). */
export class ArchaDocument {
  meta: DocumentData['meta'];
  pages: PageRef[];
  readonly nodes = new Map<NodeId, Node>();
  revision = 0;

  constructor(data: DocumentData, revision = 0) {
    this.meta = { ...data.meta };
    this.pages = data.pages.map((p) => ({ ...p }));
    for (const [id, n] of Object.entries(data.nodes)) this.nodes.set(id, structuredClone(n));
    this.revision = revision;
  }

  static create(name = 'Untitled'): ArchaDocument {
    const rootId = newId();
    const pageId = newId();
    const root = nodeSchema.parse({ id: rootId, type: 'page', name: 'Page 1', parentId: null, children: [] });
    return new ArchaDocument({
      meta: { id: newId(), name, formatVersion: FORMAT_VERSION, createdWith: 'archadev' },
      pages: [{ id: pageId, name: 'Page 1', rootId }],
      nodes: { [rootId]: root },
    });
  }

  get(id: NodeId): Node | undefined {
    return this.nodes.get(id);
  }

  require(id: NodeId): Node {
    const n = this.nodes.get(id);
    if (!n) throw new DocumentError('NOT_FOUND', `Node "${id}" does not exist`);
    return n;
  }

  container(id: NodeId): ContainerNode {
    const n = this.require(id);
    if (!isContainer(n)) throw new DocumentError('VALIDATION', `"${n.name}" (${n.type}) cannot have children — only page, frame and group can`);
    return n;
  }

  children(id: NodeId): Node[] {
    const n = this.nodes.get(id);
    if (!n || !isContainer(n)) return [];
    return n.children.map((c) => this.nodes.get(c)).filter((c): c is Node => !!c);
  }

  /** Depth-first, parent before children. */
  *walk(id: NodeId): Generator<Node> {
    const n = this.nodes.get(id);
    if (!n) return;
    yield n;
    if (isContainer(n)) for (const c of n.children) yield* this.walk(c);
  }

  isAncestor(ancestorId: NodeId, id: NodeId): boolean {
    let cur = this.nodes.get(id);
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = this.nodes.get(cur.parentId);
    }
    return false;
  }

  pageOf(id: NodeId): PageRef | undefined {
    let cur = this.nodes.get(id);
    while (cur?.parentId) cur = this.nodes.get(cur.parentId);
    return this.pages.find((p) => p.rootId === cur?.id);
  }

  /** Absolute bounds on the page (rotation is not supported yet). */
  worldBounds(id: NodeId): Rect {
    const n = this.require(id);
    let x = n.x, y = n.y;
    let cur = n.parentId ? this.nodes.get(n.parentId) : undefined;
    while (cur && cur.type !== 'page') {
      x += cur.x;
      y += cur.y;
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return { x, y, width: n.width, height: n.height };
  }

  findByName(name: string): Node[] {
    return [...this.nodes.values()].filter((n) => n.name === name);
  }

  toData(): DocumentData {
    return { meta: { ...this.meta }, pages: this.pages.map((p) => ({ ...p })), nodes: Object.fromEntries([...this.nodes].map(([k, v]) => [k, structuredClone(v)])) };
  }

  clone(): ArchaDocument {
    return new ArchaDocument(this.toData(), this.revision);
  }
}

export type DocumentErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'STALE_REVISION' | 'CONFLICT';

export class DocumentError extends Error {
  constructor(readonly code: DocumentErrorCode, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'DocumentError';
  }
}
