# 04 — Rendering and layers

← [ARCHITECTURE](../ARCHITECTURE.md) · [Plan INDEX](../INDEX.md)

"Layers" means two things in ArchaDev, and both are planned here.

## A. Render layers (what the canvas view stacks)

Bottom to top, each its own surface so changes in one do not repaint the others:

| # | Layer | Surface | Repaints when |
|---|---|---|---|
| 1 | Background + grid | Canvas 2D | Zoom, theme |
| 2 | **Content** | CanvasKit (Skia WASM) on WebGL, tiled | Document ops |
| 3 | Code frames | Positioned `<webview>`/iframe snapshots; live only when focused | Code change, focus |
| 4 | Overlays: selection, hover, guides, measurements, auto-layout handles | Canvas 2D | Pointer, selection |
| 5 | Collaboration: agent cursors with name tags, comment pins, review marks | DOM | Activity events |
| 6 | Tool UI: text editing caret (DOM `contenteditable` mirror), context menus | DOM | Editing |

Content engine choice: **CanvasKit** gives the same Skia rasteriser in the renderer, in the render worker, and in Node for the CLI (`canvaskit-wasm` runs headless), so a screenshot an agent sees in a headless session matches the app. Decision D-02 in [DECISIONS.md](../DECISIONS.md).

Code frames reuse Accent's lesson: on the canvas they are **pictures** taken at the real viewport height (live iframes as tall as the page break `100vh` layouts). Clicking one opens it live in the Inspect view.

## B. The layer tree (what the person manages)

| Feature | Behaviour |
|---|---|
| Layers panel | Virtualised tree (only visible rows rendered), handles 50k nodes |
| Order | Drag to reorder; z-order = child order; bring forward/back shortcuts |
| Grouping | Group, frame selection, ungroup, wrap in auto-layout |
| Visibility / lock | Per node; locked nodes excluded from canvas hit-testing |
| Masks & boolean ops | Mask node, union/subtract/intersect/exclude producing a `boolean` node with live operands |
| Rename | Inline; batch rename with pattern |
| Search & filter | By name, type, component, variable used |
| Selection sync | Selecting in the tree selects on canvas and vice versa; agent cursor highlights both |
| Pages | Top level of the tree; each page its own R-tree |

## Hit testing

R-tree query → candidate nodes in reverse z-order → precise test (path contains point with stroke width) on the candidates only. Deep select with Ctrl/Cmd; frames select their children on double click.

## Export rendering

Same CanvasKit path: PNG/JPEG/WebP at scale, SVG (vector walk of the scene, no raster), PDF (Skia PDF backend). HTML/CSS and React+Tailwind export are code generators over the node tree, not renderers — see [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) "Code export".
