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
| 5 | Presence: agent session cursors (human-like strokes, clicks, idle fidgets; `pose()` is tested for no frame jumps), name + action tags (`canvas/cursors.ts`, own Canvas 2D layer + rAF loop while a cursor is visible); comment pins, review markup | Canvas 2D / DOM | `agent.trail`, comments |
| 6 | Editing UI: text caret, inline inputs, context menus | DOM | Editing |

Each layer is its own element stacked with CSS; a change in one never repaints the others.

---

## Layer Tree (Layers panel)

| Feature | Rule |
|---|---|
| Rendering | Virtualised list (`@tanstack/react-virtual`); 50k nodes stays smooth |
| Data | Derived from core subscription; collapsed state is view-only (Zustand) |
| Reorder | Drag → one `move`/`reorder` transaction |
| Visibility / lock | `update` ops; locked nodes skipped by hit testing |
| Group / frame / wrap in auto-layout | Single transaction each |
| Boolean ops, mask | Create `boolean` node or `mask: true` on the first child |
| Rename | Inline; batch rename with `{n}`, `{name}` patterns |
| Filter | Name, type, component, variable used |
| Sync | Selection shared between tree and canvas; agent cursor highlights both |

---

## Hit Testing

1. R-tree query at pointer (world coords) → candidates.
2. Sort by z-order (reverse paint order).
3. Precise test per candidate: path `contains` with stroke width; text by line boxes; skip hidden/locked.
4. Selection rules: click selects top-level child of the current scope; double-click enters a frame/group; Ctrl/Cmd+click deep-selects.

Runs in the renderer against the view model (node bounds + paths sent by the core), never round-trips to the core.

---

## Code Frames

| Aspect | Rule |
|---|---|
| Canvas | A **picture** taken at the real viewport size — live iframes as tall as the page break `100vh` layouts (Accent lesson) |
| Refresh | Snapshot retaken when the source file changes (watcher) or the dev server hot-reloads |
| Live | Click → Inspect workspace with the page live; Select / Comment / Interact pointers |
| Selectors | Elements boxes captured with the snapshot so comments can pin to DOM elements |

Wireframe nodes always render with the dashed "idea" style so they are never mistaken for built design.
