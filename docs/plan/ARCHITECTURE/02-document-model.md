# 02 — Document model

← [ARCHITECTURE](../ARCHITECTURE.md) · [Plan INDEX](../INDEX.md)

## Shape

A document is a tree of nodes plus side tables.

```
Document
├── meta          id, name, formatVersion, createdWith
├── pages[]       each page has a root node
├── nodes         Map<NodeId, Node>        (flat; tree via parentId + ordered children)
├── variables     tokens, with theme axes (see DESIGN_SYSTEM)
├── components    component definitions (a component is a node subtree with slots)
├── styles        named text / effect / fill styles
├── assets        refs to content-addressed blobs (sha256)
└── comments      threads anchored to node ids
```

Flat map + parent pointers rather than a nested tree: O(1) lookup by id, cheap moves, and the cache keys stay stable when a node moves.

## Node types (v1)

| Type | Notes |
|---|---|
| `frame` | Container. Can have auto-layout, clip, fills, strokes, effects. Top-level frames are artboards/screens |
| `group` | Container without its own box |
| `rect`, `ellipse`, `line`, `polygon`, `star` | Primitive shapes |
| `path` | Vector path (pen tool, boolean results, imported SVG) |
| `text` | Rich text runs; sizing mode `fixed` / `auto-width` / `auto-height` |
| `image` | Image fill on a rect, stored as an asset ref |
| `instance` | Instance of a component, with overrides keyed by node-id path |
| `sticky`, `comment-pin` | Board objects |
| `code-frame` | Renders a URL or local HTML live (Accent's code path), with a snapshot for the canvas |
| `wireframe` | Agent sketch blocks, visually marked as ideas, not built design |
| `plugin:<id>/<type>` | Custom node type owned by a plugin, with a fallback render |

## Properties

- Every property is typed by a zod schema in `@archa/schema`. That schema is the single source for: the `.archa` format, the MCP `execute` API types, the docs agents read, and validation of imports.
- A property value may be a literal or a **variable reference** (`{ "$var": "color/surface" }`). References resolve against the active theme.
- No cascading: children do not inherit fills or text styles (pen lesson: makes agent output predictable).

## Layout

Auto-layout is flexbox restricted to what designers use: direction row/column, gap, padding, align, justify, wrap, sizing per axis `fixed | hug | fill`, min/max. Implemented with **Yoga** (WASM build) in the core, so the CLI and agents get the same geometry as the app.

Hard errors (rejected, transaction rolls back): percentage sizes, `fill` inside a non-layout parent's axis that cannot resolve, children on a primitive shape. Soft issues (applied, reported as lint): text without fill, x/y on a child inside auto-layout, hug/fill cycles that collapse to zero, missing font.

## Ops, transactions, undo

- All mutation is an **op**: `insert`, `update` (property patch), `move`, `delete`, `setVariables`, `reorder`, `createComponent`, `detachInstance`…
- A **transaction** groups ops; it applies fully or not at all. An agent's `execute` call is one transaction.
- Every op has an inverse computed at apply time → undo/redo stacks per author (person and each agent run have their own stack, so "undo" never reverts an agent's work the person did not intend to revert).
- Revision = monotonically increasing integer per document; each transaction bumps it.
- The op log is the journal for crash recovery and the feed for the activity panel and review history.

## Ids and names

- `NodeId` = short random id (nanoid 10), unique per document. Ids are never reused.
- Every node has a `name`. Agents are pushed to name everything (the `execute` response returns created nodes as name → id).

## Room for multiplayer later

Ops are per-node, last-writer-wins on each property, with fractional indexing for child order. That is the same model a CRDT (Yjs or Loro) would provide, so adding cross-machine collaboration later means swapping the op transport, not the document model. Decision D-04 in [DECISIONS.md](../DECISIONS.md).
