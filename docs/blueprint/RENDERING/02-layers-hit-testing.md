# Rendering — 02: Render Layers and Layer Tree

← [RENDERING.md](../RENDERING.md) | [Blueprint INDEX](../INDEX.md) | [03 — Export →](./03-export.md)

**Phase:** 2 (layers, tree), 11 (code frames). Code: `apps/desktop/src/renderer/canvas/`.

---

## Render Layers (bottom → top)

| # | Layer | Surface | Repaints on |
|---|---|---|---|
| 1 | Background + grid | Canvas 2D | Zoom, theme |
| 2 | Content | CanvasKit WebGL, tiled | `cache.invalidated` |
| 3 | Code frames | Snapshot images; one live `<webview>` when focused | Snapshot change, focus |
| 4 | Overlays: selection, hover, guides, measure, layout handles | Canvas 2D | Pointer, selection |
| 5 | Presence: agent session cursors (human-like strokes, clicks, idle fidgets; `pose()` is tested for no frame jumps), name + action tags led by the agent's logo chip (Claude / Antigravity / Codex, from the author id prefix) (`canvas/cursors.ts`, own Canvas 2D layer + rAF loop while a cursor is visible). An agent's `done` tool (`agent.done` event) marks its cursor done: it plays its last steps, lingers and fades even while the agent process stays warm; its next trail brings it back. Comment pins, review markup | Canvas 2D / DOM | `agent.trail`, `agent.done`, comments |
| 6 | Editing UI: text caret, inline inputs, context menus | DOM | Editing |

Each layer is its own element stacked with CSS; a change in one never repaints the others.

---

## Change Animations

`canvas/changes.ts`. A `doc.applied` from an agent (or the person's discrete commands: Paste, Duplicate, Delete, Undo/Redo, Import, Insert, Align, Reorder, Add auto layout) plays instead of snapping; drags, resizes and panel edits never animate. `prefers-reduced-motion` turns it off.

| Change | Effect | How |
|---|---|---|
| Insert / shown | Pop in: fade + scale 0.92 → 1 with a small overshoot, 320 ms | `NodeAnim` passed to `drawNode` |
| Position change, incl. siblings pushed by auto-layout | Glide from the old place, 340 ms (FLIP on parent-relative x/y) | `NodeAnim.dx/dy` |
| Delete / hidden | Old pixels fade and shrink, 240 ms | ghost bitmap snapshotted before apply |
| Restyle (fills, text, size …) | Old look dissolves into the new, 260 ms | ghost bitmap, outermost changed node only |

Top-level nodes with an animating subtree skip the frame bitmap cache while they play (`PageFx.live`); the cache path returns once they settle.

## Layer Tree (Layers panel)

| Feature | Rule |
|---|---|
| Rendering | Virtualised list (`@tanstack/react-virtual`); 50k nodes stays smooth |
| Data | Derived from core subscription; collapsed state is view-only (Zustand) |
| Order | See **Layer order** below — `layerOrder()` in `@archa/core` `layers.ts` |
| Drag & drop | Drop above / below a row = reorder (accent line); middle of a frame or group row = drop into it (accent ring); bottom of the list = page root. `layerMoveOps()` → one `move` transaction (+ `update` x/y), undoable |
| Drop rules | No drop into itself or a descendant; a selected row drags the whole selection in stacking order; into a free container the layer keeps its canvas position; into auto layout it joins the end of the flow; out of auto layout `fill` sizes become `fixed` |
| Visibility / lock | `update` ops; locked nodes skipped by hit testing |
| Group / frame / wrap in auto-layout | Single transaction each |
| Boolean ops, mask | Create `boolean` node or `mask: true` on the first child |
| Rename | Inline; batch rename with `{n}`, `{name}` patterns |
| Filter | Name, type, component, variable used |
| Sync | Selection shared between tree and canvas; agent cursor highlights both |

### Layer order (decided 2026-11-24)

`children` is paint order — the last child draws on top ([DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md)). The panel reads top row first:

| Container | Panel order | Why |
|---|---|---|
| Page, group, frame without auto layout | Reverse of `children` — top row = drawn on top | Matches overlap on the canvas (Figma convention) |
| Auto-layout frame (`layout` row / column) | Same as `children` — top row = first in the flow | Children do not overlap; the list reads like the canvas (left→right, top→bottom) |

Index maths never lives in UI code: drops are `{ targetId, position: before | after | inside }` in list terms and the core converts them.

---

## Hit Testing

1. R-tree query at pointer (world coords) → candidates.
2. Sort by z-order (reverse paint order).
3. Precise test per candidate: path `contains` with stroke width; text by line boxes; skip hidden/locked.
4. Selection rules: click selects top-level child of the current scope (a click on a group's child selects the group); double-click enters a frame/group; Ctrl/Cmd+click deep-selects. Dragging a group's layer keeps it in the group unless it is dropped into another frame (groups are never drop targets).

Runs in the renderer against the view model (node bounds + paths sent by the core), never round-trips to the core.

**Rotation** (`lib/geometry.ts`): each node's step is translate(x, y) then a turn about its centre; `hitPath` carries the pointer into each node's own box, so turned frames hit-test their children. The overlay draws the turned outline, handles at turned points and a rotate knob 22 px above the top edge (drag; Shift = 15° steps); resize reads the pointer along the node's own axes and keeps the opposite handle fixed on the page (`resizeFrame` / `resizedBox`). Turned top-level frames skip the bitmap cache and cull by their circumscribed circle. Exports: SVG `rotate(θ cx cy)`, HTML/Tailwind CSS `rotate`.

**Multi-selection transform** (`lib/groupTransform.ts`, pure + tested; `Canvas.tsx` gesture `group`): two or more layers get one shared box (union of their turned bounds) with 8 handles and a rotate knob, and scale / turn **as one unit**. Every layer goes page space → its own parent space through world matrices, so layers in different (turned) parents work; layers inside another selected layer ride along; connectors' free ends follow the map.

| Gesture | Rule |
|---|---|
| Scale | Opposite handle (edge) stays fixed; Alt = scale contents too (as the Scale tool), Alt+Shift = both; Shift = keep ratio (corners take the larger change). Each layer's centre maps exactly; its new box decomposes (map × own turn): turn follows its x axis, width = that axis' stretch, height = the stretch across it. Exact at 90° multiples; a turned layer under a non-uniform scale drops the skew |
| Flip | Dragging past the anchor mirrors positions; outlines stay, the turn is mirrored (−φ) so upright text stays upright. No mirror property on nodes yet, so content is not mirrored |
| Select tool (V) | Like Figma's normal resize: boxes + positions only. Text keeps its font size and wraps at its new width (`fixed` once its height changed); strokes and radii unchanged |
| Scale tool (K) | Like Figma's K: also scales what is inside each layer — children, fonts, strokes, radii, gap, padding, shadows (`scaledStyle`, factor √(kx·ky)) |
| Rotate | Pivot = **mean of the layers' centres** (owner's ask; it follows where the layers are, not their extents), Alt = centre of the shared box; each layer's turn grows by the same angle and its centre orbits the pivot; Shift = 15° steps |
| Auto-layout children | Size / turn change, x/y stay with the layout (their slot does not move) |
| Commit | Live preview on the view model only (no core calls while dragging); one `update` transaction on pointer-up (`Resize / Scale / Rotate N layers`) = one undo step. Overlay shows the mapped box, the pivot and a live `W × H` / `θ°` readout |

**Moving between frames** (`Canvas.tsx` move gesture): the drop target is the deepest frame under the pointer (dragged layers excluded); the page when it is outside every frame. Inside an auto-layout parent a drag reorders while the pointer stays inside it and drags the layers out once it leaves. Dropping into auto layout inserts at the slot under the pointer (insert line shown); dropping into a free frame or the page keeps the world position and turns `fill` sizing into `fixed`. While dragging, layers whose frame clips them are drawn again on top, whole. **Smart guides** (`lib/snap.ts`, pure + tested): the dragged box's left / centre / right and top / middle / bottom snap (6 screen px) to the same edges of the other layers in its frame and in the frame under the pointer, plus those frames' boxes; every edge that lines up draws a red guide spanning both boxes. Ctrl/Cmd drags freely. Files dropped from Explorer land under the pointer, in the frame there → [FILE_FORMATS/04](../FILE_FORMATS/04-importers.md).

---

## Code Frames

| Aspect | Rule |
|---|---|
| Canvas | A **picture** taken at the real viewport size — live iframes as tall as the page break `100vh` layouts (Accent lesson) |
| Refresh | Snapshot retaken when the source file changes (watcher) or the dev server hot-reloads |
| Live | Click → Inspect workspace with the page live; Select / Comment / Interact pointers |
| Selectors | Elements boxes captured with the snapshot so comments can pin to DOM elements |

Wireframe nodes always render with the dashed "idea" style so they are never mistaken for built design.

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) · [APP_UI/01](../APP_UI/01-shell-tools-panels.md) · [CACHE/02](../CACHE/02-render-tiles.md) · [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) · [MCP/01](../MCP/01-transports-tools.md)

**Code:** [`apps/desktop/src/renderer/canvas/Canvas.tsx`](../../../apps/desktop/src/renderer/canvas/Canvas.tsx) · [`apps/desktop/src/renderer/canvas/changes.ts`](../../../apps/desktop/src/renderer/canvas/changes.ts) · [`apps/desktop/src/renderer/canvas/cursors.ts`](../../../apps/desktop/src/renderer/canvas/cursors.ts) · [`apps/desktop/src/renderer/canvas/EmbedLayer.tsx`](../../../apps/desktop/src/renderer/canvas/EmbedLayer.tsx) · [`apps/desktop/src/renderer/canvas/overlay.ts`](../../../apps/desktop/src/renderer/canvas/overlay.ts) · [`apps/desktop/src/renderer/lib/geometry.ts`](../../../apps/desktop/src/renderer/lib/geometry.ts) · [`apps/desktop/src/renderer/lib/groupTransform.ts`](../../../apps/desktop/src/renderer/lib/groupTransform.ts) · [`apps/desktop/src/renderer/lib/snap.ts`](../../../apps/desktop/src/renderer/lib/snap.ts) · [`apps/desktop/src/renderer/ui/LayersPanel.tsx`](../../../apps/desktop/src/renderer/ui/LayersPanel.tsx) · [`apps/desktop/test/changes.test.ts`](../../../apps/desktop/test/changes.test.ts) · [`apps/desktop/test/cursors.test.ts`](../../../apps/desktop/test/cursors.test.ts) · [`apps/desktop/test/group-transform.test.ts`](../../../apps/desktop/test/group-transform.test.ts) · [`apps/desktop/test/rotation.test.ts`](../../../apps/desktop/test/rotation.test.ts) · [`apps/desktop/test/snap.test.ts`](../../../apps/desktop/test/snap.test.ts) · [`packages/core/src/layers.ts`](../../../packages/core/src/layers.ts) · [`packages/core/test/layers.test.ts`](../../../packages/core/test/layers.test.ts) · [`packages/protocol/src/rpc.ts`](../../../packages/protocol/src/rpc.ts)
<!-- backlinks:end -->
