# Print CSS: patterns and traps

## Two layout models

**Fixed pages** (covers, brochures, certificates, designed reports; used in `examples/proposal.html`):
every page is a `.page` element of exactly the paper size, and you decide what goes on each page.

```css
@page { size: A4; margin: 0; }
body { margin: 0; }                         /* REQUIRED: the default 8px margin pushes a blank page in */
.page { width: 210mm; height: 297mm; padding: 22mm 20mm; overflow: hidden; break-after: page; }
.page:last-child { break-after: auto; }     /* else a blank page at the end */
```

**Flowing text** (long reports, e-books, contracts): content flows across pages and the browser
breaks it.

```css
@page { size: A4; margin: 22mm 20mm 24mm; }
@page :first { margin: 0; }                 /* full-bleed cover; the cover is exactly 210×297mm */
h1, h2, h3 { break-after: avoid; }
table, figure, .card { break-inside: avoid; }
thead { display: table-header-group; }      /* repeats on every page */
p { orphans: 3; widows: 3; }
```

## Traps (all seen in real renders)

| Symptom | Cause | Fix |
|---|---|---|
| A blank page between pages | `body` default margin, or a page element 1px taller than the paper | `body { margin: 0 }`, exact mm sizes, `overflow: hidden` |
| A blank last page | `break-after: page` on the last page | `.page:last-child { break-after: auto }` |
| Fallback fonts (Times/Arial) | Printed before web fonts loaded | `--virtual-time-budget=8000` (the script does this), or local `@font-face` |
| Backgrounds missing | Print colour adjust | `print-color-adjust: exact` on `html` |
| A circle or giant number that bleeds off the **bottom** edge prints as a straight-sided arch or a stretched glyph | Print fragmentation cuts any box that crosses the page bottom (even with `overflow: hidden`) | Draw bottom-bleeding shapes and type in one full-page `<svg>` (`position:absolute; inset:0`). Bleeding off the top, left or right is fine |
| A big number shows at body size | A generic rule (`.stats p`) beats the class (`.big`) | Scope the generic rule (`.stats p:not(.big)`) |
| Grid items jump rows | Auto-placement with mixed explicit columns | Give each item an explicit `grid-row` |
| Text clipped at the bottom of a fixed page | Too much content | Move it to a new page; never shrink body text below 9pt |

## Page numbers

- Fixed pages: write the folio in each `.page` (`2 / 4`).
- Flowing text: Chrome's CLI cannot add page numbers. Use Playwright (`page.pdf({ displayHeaderFooter: true,
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: {...} })`),
  or Paged.js (`https://unpkg.com/pagedjs/dist/paged.polyfill.js`) with `@page { @bottom-center { content: counter(page) } }`.

## Units

Use `mm` for page geometry and `pt` for type (10pt body ≈ 13.3px). 1 mm ≈ 3.78 px at 96 dpi.
Images need ≥ 300 dpi at print size (a 80 mm wide photo needs at least 945 px).
