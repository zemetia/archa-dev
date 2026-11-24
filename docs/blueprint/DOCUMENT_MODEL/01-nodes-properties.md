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

Effects (format 3): `drop-shadow` / `inner-shadow` `{ x, y, blur, color }`, `layer-blur` / `background-blur` `{ radius }`. `meta.context` = the person's note for agents on a layer (no format change; `meta` is free-form).
| `group` | ✓ | No own box; bounds = union of children → [Groups](#groups) |
| `rect` `ellipse` `line` `polygon` `star` | ✗ | Primitives |
| `path` | ✗ | Vector network / SVG path data |
| `boolean` | ✓ | Live union/subtract/intersect/exclude of children |
| `text` | ✗ | Rich runs; `sizing: 'fixed' \| 'auto-width' \| 'auto-height'`. **Built:** `fontStyle`, `underline`, `strikethrough`, `textCase` (display only; `text` keeps what was typed), `list` (bullet/number per line), `curve` (−100…100, one line on an arc; box = `curveBox`), `textEffect` (one of drop, glow, echo, outline, background, splice, hollow, neon, glitch; sliders 0–100 scale with the font size). Helpers `core/src/text.ts`, drawn by `render/src/text.ts`; CSS/SVG export maps them (curves stay straight in HTML) |
| `instance` | ✓ | `componentId` + `overrides` keyed by node-id path |
| `sticky` | ✗ | Board note |
| `code-frame` | ✗ | `source: { url } \| { html }`, viewport, snapshot asset → [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| `wireframe` | ✓ | Agent sketch blocks; always drawn as "idea" style |
| `plugin` | ? | `pluginType: '<pluginId>/<type>'`, opaque `data`, required `fallback` asset |

Images are fills (`{ type: 'image', asset, fit }`), not a node type. **Built (v4):** `fills` is a stack (last on top) of `solid` · `linear-gradient` (`angle` in CSS degrees, `stops`) · `radial-gradient` (`center`, `radius` as box fractions) · `image` (`src`, `fit` crop/fit/fill/tile, `opacity`); `paintColor()` gives one stand-in colour for contrast and ink checks. Text `spans` (`[start, end)` over `text`, with `fills`, font, weight, style, size, tracking, decoration) make rich text in one node (`styledParagraphs`, `remapSpans` keeps them on their characters when the text is edited). Any node may carry `bindings` (property path → variable id) → [DESIGN_SYSTEM/01](../DESIGN_SYSTEM/01-variables-themes.md).

**Built today (`formatVersion` 4; v3 added inner-shadow, layer-blur and background-blur effects, justify `space-around` and the `connector` node; v4 adds gradient and image paints, text `spans` and `bindings`):** `page`, `frame`, `group`, `rect`, `ellipse`, `text`, plus `polygon` (`sides`, stretched to the box), `path` (`d` + `viewBox` stretched to width × height, `fillRule`, `lineCap`, `lineJoin`; strokes always centred), `image` (`src` data URL until the asset store lands, `fit` crop/fit/fill), `sticky` (`text`, `fontSize`) `embed` (`url`; the live page of a code frame without the code link) and `connector` (below). Document-level, not nodes: `variables` and `comments` (`packages/schema/src/variables.ts`).

---

## Connectors

Lines for flowcharts, workflows and page maps (`packages/core/src/connectors.ts`).

| Property | Meaning |
|---|---|
| `start`, `end` | `{ nodeId \| null, side: auto\|top\|right\|bottom\|left, x, y }` — attached ends follow their node; `x/y` (parent coords) place a free end and are kept current while attached, so deleting the node leaves the line where it was |
| `routing` | `elbow` (90° segments, out of the facing sides) or `straight` (box edge to box edge) |
| `cornerRadius` · `startCap` · `endCap` | Elbow rounding; caps `none`/`arrow`/`dot` (default: arrow at the end) |
| `strokes` | First visible stroke is the line; none = grey 2px |
| `points`, `x`, `y`, `width`, `height` | **Derived**: `routeConnectors` rebuilds them at the end of `runLayout`, in the core and the renderer mirror, so moving a node needs no connector ops |

Renderer, SVG and HTML export all draw from `connectorGeometry` (one path + filled caps). Connectors are part of `formatVersion` 3; an older app quarantines them (kept and saved back, not drawn).

## Groups

`group` already exists in the schema (no fills, effects or layout), so grouping needs no format change. Code: `packages/core/src/groups.ts` (ops), `fit.ts` (bounds), `transform.ts` (page matrices).

| Rule | Behaviour |
|---|---|
| Bounds | After every transaction `applyOps` fits each group (deepest first) to the union of its children's turned boxes — hidden children count only when all are hidden; an empty group keeps its box. Children shift so nothing moves on the canvas (a turned group's origin is compensated). The fit is written as `update`s whose inverses join the transaction's undo |
| Group (Ctrl+G) | Selected layers minus descendants of other selected layers go into a new group in the parent of the **top-most selected layer** (last in paint order), at that layer's z-slot; members keep paint order and page position (turned parents become member rotation). In auto layout the group takes that flow slot; `fill` members become fixed. Locked / hidden layers group as they are. Selection → the group |
| Ungroup (Ctrl+Shift+G) | Each selected group or plain frame is replaced by its children at its slot; page position kept; group rotation adds to theirs, opacity multiplies, hidden → hidden, locked → locked (meta, bindings dropped). Several and nested picks in one transaction, outer first. Selection → the released layers. Other layers: no-op with a note |
| Components | Layers inside an instance cannot be grouped or ungrouped (detach first); a main or an instance cannot be ungrouped. Grouping a whole instance is fine |
| Delete | Deleting a group's last layers deletes the group too (`emptiedGroups`) |

---

**Built (v3, optional properties):**

| Feature | Shape | Rule |
|---|---|---|
| Gradient paints | `fills: [{ type: 'linear', angle, stops: [{offset, color}] } \| { type: 'radial', cx, cy, radius, stops }]` | CSS angles (180 = top → bottom); radius = fraction of the longer side. Input also takes CSS `linear-gradient(…)` / `radial-gradient(…)` strings |
| Rich text | text `spans: [{ start, end, fills?, fontWeight?, fontFamily?, letterSpacing?, underline?, strikethrough? }]` | UTF-16 ranges over `text`; input `runs: ["a ", { text: "b", fill }]`. Editing `text` keeps spans on the same characters (`adjustSpans`) |
| Token bindings | `bind: { fill: '<variable id>', cornerRadius: …, … }` (keys in `BINDABLE`) | → [DESIGN_SYSTEM/01 → Bindings](../DESIGN_SYSTEM/01-variables-themes.md) |

## Base Properties (every node)

| Property | Type | Note |
|---|---|---|
| `id` | `NodeId` | nanoid(10), never reused |
| `type` | literal | Discriminant |
| `name` | string | Required. Agents are pushed to name everything |
| `parentId` | `NodeId \| null` | |
| `children` | `NodeId[]` | Containers only; order = z-order |
| `x`, `y` | number | Ignored (lint) inside auto-layout parents |
| `rotation` | number | **Built:** degrees clockwise about the box centre (−360…360, default 0); `x/y/width/height` stay the upright box, children turn with it, connectors ignore it. Optional → no `formatVersion` bump. Agents: `rotation` (aliases `rotate`, `angle`) |
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

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [APP_UI/01](../APP_UI/01-shell-tools-panels.md) · [DOCUMENT_MODEL/02](./02-ops-transactions-undo.md) · [MCP/02](../MCP/02-execute-api.md) · [RENDERING/02](../RENDERING/02-layers-hit-testing.md)

**Code:** [`apps/desktop/src/renderer/canvas/EmbedLayer.tsx`](../../../apps/desktop/src/renderer/canvas/EmbedLayer.tsx) · [`packages/core/src/bindings.ts`](../../../packages/core/src/bindings.ts) · [`packages/core/src/connectors.ts`](../../../packages/core/src/connectors.ts) · [`packages/core/src/document.ts`](../../../packages/core/src/document.ts) · [`packages/core/src/fit.ts`](../../../packages/core/src/fit.ts) · [`packages/core/src/groups.ts`](../../../packages/core/src/groups.ts) · [`packages/core/src/text.ts`](../../../packages/core/src/text.ts) · [`packages/core/src/transform.ts`](../../../packages/core/src/transform.ts) · [`packages/core/test/connectors.test.ts`](../../../packages/core/test/connectors.test.ts) · [`packages/core/test/groups.test.ts`](../../../packages/core/test/groups.test.ts) · [`packages/formats/src/export/html.ts`](../../../packages/formats/src/export/html.ts) · [`packages/formats/test/text.test.ts`](../../../packages/formats/test/text.test.ts) · [`packages/render/src/fonts.ts`](../../../packages/render/src/fonts.ts) · [`packages/schema/src/color.ts`](../../../packages/schema/src/color.ts) · [`packages/schema/src/ids.ts`](../../../packages/schema/src/ids.ts) · [`packages/schema/src/index.ts`](../../../packages/schema/src/index.ts) · [`packages/schema/src/nodes.ts`](../../../packages/schema/src/nodes.ts)
<!-- backlinks:end -->
