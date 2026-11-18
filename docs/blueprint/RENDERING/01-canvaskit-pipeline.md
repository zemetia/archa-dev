# Rendering — 01: CanvasKit Pipeline

← [RENDERING.md](../RENDERING.md) | [Blueprint INDEX](../INDEX.md) | [02 — Layers →](./02-layers-hit-testing.md)

**Phase:** 1 (headless), 2 (app). Code: `packages/render/src/`.

> **Current state (MVP):** `packages/render` ships a **Canvas2D backend** (`draw.ts`, `scene.ts`) with a per-frame bitmap cache (`cache.ts`). The `drawNode(ctx, doc, node)` contract below is kept so CanvasKit can replace it without touching callers. Skia-in-WASM is confirmed as the target by [REFERENCE.md](../REFERENCE.md).

---

## Package Layout

```
packages/render/src/
├── index.ts            createRenderer, exportImage, exportSvg, exportPdf
├── engine/             CanvasKit loader (browser + node), surface factory (WebGL, CPU)
├── draw/               one file per node type: frame.ts, text.ts, path.ts, ...
├── paint/              fills, strokes, effects (shadow, blur), blend, image fills
├── text/               paragraph builder, font manager, fallback chain
├── tiles/              → CACHE/02
├── cache/              L3, L4
├── worker.ts           render worker entry
└── node.ts             headless entry for CLI/MCP (canvaskit-wasm in Node)
```

---

## Surfaces

| Context | Surface | Fallback |
|---|---|---|
| Renderer content layer | WebGL2 via `MakeWebGLCanvasSurface` | CPU surface (`ARCHA_NO_GPU`, blocklisted drivers) |
| Render worker | OffscreenCanvas WebGL | CPU |
| Node (CLI, MCP, tests) | CPU raster surface | — |

---

## Draw Order per Node

```
save → transform (x, y, rotation) → opacity / blend layer (only if needed)
  → clip (frame.clip)
  → fills (in order) → children (frames, groups) → strokes (inside/center/outside) → effects
restore
```

- Effects that need a layer (blur, layer blur, opacity < 1 with children) use `saveLayer` — and mark the node "expensive" → L4 bitmap cache.
- Images: decoded once per mip level from the asset store; never decode at full resolution beyond the zoom need.

---

## Text

| Rule | Detail |
|---|---|
| Shaping | CanvasKit `ParagraphBuilder`; results cached in L2 |
| Fonts | Loaded from asset store / system / Google Fonts download into `~/.archadev/cache/fonts/` |
| Missing font | Fallback stack + soft issue `text/font-missing` |
| Editing | DOM `contenteditable` mirror on the overlay layer; committed as one transaction on blur/Enter |

---

## Headless Parity

The same `draw/` code runs in all contexts. Golden-image tests render fixtures in Node and compare with the app's renders captured by Playwright (tolerance 0.1%) to catch divergence (fonts, GPU vs CPU AA).

---

## Rules

| # | Rule |
|---|---|
| 1 | `draw/*` functions are pure: `(canvas, node, resolved, ctx) → void`. No document access beyond `ctx` |
| 2 | Resolved values come from the core (variables already resolved) — render never resolves variables |
| 3 | Free every CanvasKit object (`.delete()`); `using`/helper `withPaint()` enforced by lint rule |
| 4 | No per-frame allocations in hot paths; reuse paints and paths |
