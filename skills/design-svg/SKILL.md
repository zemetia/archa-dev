---
name: design-svg
description: Draw custom SVG — logo marks, spot illustrations, charts, diagrams, decorative patterns, empty-state art, hero visuals — and put it on the ArchaDev canvas as a real drawing (editable vector layers, or an exact image when it needs gradients or text). Use whenever the user asks for an SVG, a vector, an illustration, a logo or mark, a chart or graph drawn by hand, a pattern or background shape, "gambar", "ilustrasi", "grafik", or when you are about to write <svg> markup for a design. Never deliver SVG as a text layer or only as code in chat.
---

# SVG on the canvas

SVG you write is a drawing. It belongs on the canvas where the person can see, move and recolour it —
not in a text layer (that shows the code), and not only as a code block in your reply (the person
then has to copy it somewhere themselves).

## 0. The rules that override your habits

1. **Place it, don't print it.** Every SVG you write goes on the canvas with the `place_svg` tool or
   `svg()` inside `execute`. A chat reply may show the same SVG, but the canvas comes first.
2. **Never put markup in a text node.** `insert(parent, { type: 'text', text: '<svg…' })` is the
   mistake this skill exists for. (ArchaDev now catches it and places a drawing, but do it right.)
3. **Icons and brand logos are not SVG work.** Use `icon('arrow-right', …)` and `icon('logos:github', …)`.
   Write SVG only for what no icon set has: an illustration, a custom mark, a chart, a pattern.
4. **Vectors over images.** Flat fills, strokes, opacity, transforms and arcs stay editable layers.
   Gradients, `<text>`, `<image>`, filters, masks, clip paths, dashed strokes, `<use>` and nested
   `<svg>` turn the whole drawing into one image. Use them only when the look needs them.
5. **Words are text nodes.** Titles, axis labels and numbers go in real text nodes next to the
   drawing, so they stay editable and use the design's fonts.

## 1. The two ways to place SVG

**`place_svg` tool** — the markup is a plain string argument, no escaping:

```json
{ "svg": "<svg viewBox=\"0 0 120 120\">…</svg>", "parent": "Hero visual", "width": 320, "name": "Mark" }
```

**`svg()` in `execute`** — when the drawing is part of a bigger build step:

```js
hero = insert(null, { type: 'frame', name: 'Hero', width: 1440, height: 720, layout: 'row', padding: 96, gap: 64, fills: ['#0f172a'] });
svg(`<svg viewBox="0 0 240 240">…</svg>`, hero, { width: 480, name: 'Hero illustration' });
```

Options for both: `parent`, `x`, `y`, `width`, `height` (one side keeps the aspect ratio), `name`,
`mode` (`auto` default · `vector` fails instead of falling back · `image`).

The reply tells you what happened — read it:

- `"Mark" placed as 7 editable vector layers` — good; each shape is a `path` layer named after its `id`.
- `"Chart" placed as an image (vectors cannot keep gradients or patterns)` — fine if you meant it;
  otherwise flatten the gradient to solid fills and place it again.

## 2. Writing SVG that converts well

- Always a `viewBox` (`0 0 240 160`); size it on the canvas with `width`.
- One shape per element; give meaningful shapes an `id` (`id="leaf-left"`) — it becomes the layer name.
- Colours from the design palette as hex. `currentColor` works (from the `color` attribute).
- `<g transform>` / `rotate` / `scale` / arcs / `<style>` class rules are all fine.
- Keep it simple: 3–15 shapes for a spot illustration, a single path or two for a logo mark.

## 3. Recipes

- **Logo mark**: one or two geometric shapes on a 48 or 64 grid, one brand colour, optional second tone.
  Wordmark = a text node beside it, not `<text>`.
- **Spot illustration** (empty states, feature tiles): 3–4 colours from the palette, flat shapes,
  one focal object, soft background blob in the surface tint.
- **Chart**: compute the coordinates from the real values first (`x = i * step`, `y = h - v / max * h`),
  bars as `<rect>`, lines as one `<path>` with `fill="none"`, area as the same path closed to the baseline
  with a low-opacity fill. Labels and values as text nodes.
- **Pattern / background shape**: large, low-contrast, behind the content (`index: 0` or insert it
  first), clipped by its frame.

## 4. Check

Each reply carries a screenshot. Look at it: right size, nothing clipped, colours from the palette,
readable against its background. To fix, `remove()` the drawing and place a corrected SVG, or `update()`
single vector layers (fills, position).

See [examples/canvas-svg.js](examples/canvas-svg.js) for a checked `execute` snippet.
