# Document Model — 01: Nodes and Properties

← [DOCUMENT_MODEL.md](../DOCUMENT_MODEL.md) | [Blueprint INDEX](../INDEX.md) | [02 — Ops →](./02-ops-transactions-undo.md)

**Phase:** 1. Code: `packages/schema/src/`, `packages/core/src/document/`.

---

## Document Shape

```ts
type Document = {
  meta: { id: DocId; name: string; formatVersion: number; createdWith: string };
  pages: PageRef[];                      // ordered; each has rootId
  nodes: Map<NodeId, Node>;              // flat — tree via parentId + children[]
  variables: VariableCollection;         // → DESIGN_SYSTEM/01
  components: Map<ComponentId, ComponentDef>;
  styles: Map<StyleId, NamedStyle>;
  assets: Map<AssetHash, AssetRef>;
  comments: Map<ThreadId, Thread>;
};
```

Flat map + parent pointers: O(1) lookup, cheap moves, cache keys stable when a node moves.

---

## Node Types (v1)

| Type | Container | Notes |
|---|---|---|
| `frame` | ✓ | Auto-layout, clip, fills, strokes, effects, corner radius. Top-level = screen/artboard |
| `group` | ✓ | No own box; bounds = union of children |
| `rect` `ellipse` `line` `polygon` `star` | ✗ | Primitives |
| `path` | ✗ | Vector network / SVG path data |
| `boolean` | ✓ | Live union/subtract/intersect/exclude of children |
| `text` | ✗ | Rich runs; `sizing: 'fixed' \| 'auto-width' \| 'auto-height'` |
| `instance` | ✓ | `componentId` + `overrides` keyed by node-id path |
| `sticky` | ✗ | Board note |
| `code-frame` | ✗ | `source: { url } \| { html }`, viewport, snapshot asset → [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| `wireframe` | ✓ | Agent sketch blocks; always drawn as "idea" style |
| `plugin` | ? | `pluginType: '<pluginId>/<type>'`, opaque `data`, required `fallback` asset |

Images are fills (`{ type: 'image', asset, fit }`), not a node type.

---

## Base Properties (every node)

| Property | Type | Note |
|---|---|---|
| `id` | `NodeId` | nanoid(10), never reused |
| `type` | literal | Discriminant |
| `name` | string | Required. Agents are pushed to name everything |
| `parentId` | `NodeId \| null` | |
| `children` | `NodeId[]` | Containers only; order = z-order |
| `x`, `y`, `rotation` | number | Ignored (lint) inside auto-layout parents |
| `width`, `height` | number | Plus `sizing` per axis → [03](./03-layout.md) |
| `visible`, `locked` | boolean | |
| `opacity`, `blendMode` | | |
| `meta` | record | Free-form, namespaced (`plugin.<id>.*`, `archa.placeholder`) |

---

## Values and Variable References

Any styleable property accepts a literal **or** a reference:

```ts
fill: { type: 'solid', color: { $var: 'color/surface' } }
gap:  { $var: 'space/4' }
```

- References resolve against the active theme → [DESIGN_SYSTEM/01](../DESIGN_SYSTEM/01-variables-themes.md).
- Unknown variable → soft issue `unknown-variable` (render uses fallback magenta).
- **No cascading.** Children never inherit fills or text styles from parents.

---

## Schema Rules

| # | Rule |
|---|---|
| 1 | One file per node type in `packages/schema/src/nodes/`; union in `nodes/index.ts` |
| 2 | Units: px for lengths, degrees for rotation, 0–1 for opacity |
| 3 | Colours stored as oklch `{ l, c, h, a }`; hex accepted on input, converted |
| 4 | Every property has `.describe()` text — it becomes the agent API doc |
| 5 | New optional properties need no migration; renames/removals do → [FILE_FORMATS/03](../FILE_FORMATS/03-migrations-validation.md) |
