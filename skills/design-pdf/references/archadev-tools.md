# ArchaDev tools for PDF documents

Two routes, often combined: **lay out the pages on the canvas** (fast to review with the person,
easy to change), then either export from the canvas or write print HTML from that layout.

| Tool | Use it to |
|---|---|
| `get_state` | See existing frames, variables and components before adding pages |
| `execute` | Build one page per call: a top-level frame per page, `setVariable` for the palette, `icon()` for icons, `makeComponent` for repeated blocks (folio, callout, table row) |
| `screenshot` | Look at each page after building it (`scale: 0.5` is enough to judge layout) |
| `inspect` | Read an existing page's structure before editing it |
| `say` | One-line progress note between pages (a separate tool, not inside `execute`) |
| `browser` | Open the rendered `file:///…/doc.html` to check it, or study a reference document online |
| `export_svg` | Pull a chart or logo drawn on the canvas into the HTML as inline SVG |

## Page frames

| Size | Frame (96 dpi px) | 20 mm margin |
|---|---|---|
| A4 portrait | 794 × 1123 | 76 px |
| A4 landscape | 1123 × 794 | 76 px |
| US Letter | 816 × 1056 | 72 px (0.75 in) |
| A5 | 559 × 794 | 57 px |

- Put pages side by side in one row with an 80 px gap, named in order: `01 Cover`, `02 Summary`…
  The **Slides** panel then shows them as page thumbnails in that order.
- Use a fixed height (pages don't grow) and `clip: true`. When content no longer fits, make a new page
  rather than shrinking the type.
- Use `absolute: true` for decorations and running elements (folio, page number, corner marks)
  inside an auto-layout page.

## Export routes

1. **From the canvas**: the person selects a page frame and uses **Export → PDF** in the Design panel.
   This gives one PDF page per frame. Fine for covers, certificates and one-pagers.
2. **Print HTML** (multi-page documents, real text flow, tables that continue across pages):
   write the HTML with the same tokens and render it with `scripts/render-pdf.mjs`, then check the
   page PNGs. See [../examples/proposal.html](../examples/proposal.html).
3. **HTML + CSS export** of a page frame (Design panel → Export) is a good starting point for route 2.

See [../examples/canvas-a4-pages.js](../examples/canvas-a4-pages.js) for a cover and an inner page
built with `execute` and checked against the real executor.
