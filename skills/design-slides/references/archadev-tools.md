# ArchaDev tools for slide decks

Design the deck on the canvas first: the person sees every slide at once, reviews the storyline,
and leaves comments on single slides. Then export it, or build the PPTX/HTML from it.

| Tool | Use it to |
|---|---|
| `get_state` | Check existing slides, variables and components before adding more |
| `execute` | One slide per call: a 1920×1080 top-level frame; `setVariable` for the palette; `makeComponent` for the header/footer motif, then `instance()` on every slide; `icon()` for icons |
| `screenshot` | Look at each slide (`scale: 0.35` shows the whole slide) |
| `inspect` | Read an existing slide before changing it |
| `say` | One-line progress note between slides (a separate tool, not inside `execute`) |
| `browser` | Study a reference deck or brand site; open the rendered `deck.html` to check it |
| `delegate` / `wait_workers` | Orchestrate mode: you build the tokens, motif component and empty slide frames, then each worker fills a group of slides |

## Slide frames

- 1920×1080 (16:9), placed in **one row** with a 120 px gap, named `01 Cover`, `02 Problem`… The left
  menu's **Slides** panel shows every top-level frame as a thumbnail in that order, which works as
  a deck overview.
- Use `clip: true` and a fixed size. Inside a slide use auto layout (`layout: 'column'`, `padding: [96, 120]`).
  The motif header and page number are `absolute: true` so they don't take part in the layout.
- The header motif is one component. Override its label per slide with
  `update(children(instance)[1].id, { text: 'MASALAH' })`.

## Export routes

1. **PDF / PNG per slide**: the person selects slide frames and uses Export in the Design panel.
2. **HTML deck → PDF**: write `deck.html` from the canvas design (one `<section>` per frame) and render it
   with `../design-pdf/scripts/render-pdf.mjs`. This gives full typographic control.
3. **Editable PPTX**: rebuild the same grid in pptxgenjs (`examples/deck.mjs`), then run
   `scripts/pptx-preview.ps1` and look at every slide.

See [../examples/canvas-slides.js](../examples/canvas-slides.js): a cover and a big-number slide with a shared
header component, checked against the real executor.
