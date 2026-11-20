---
name: design-pdf
description: Design and produce beautiful, distinctive PDF documents (proposals, reports, company profiles, CVs/resumes, invoices, e-books, certificates, brochures, one-pagers, guides) by authoring HTML/CSS for print and rendering it with headless Chrome/Edge. Use whenever the user wants a PDF that looks designed (cool, unique, premium, professional, branded) rather than a plain text export. For mechanical PDF work (merge, split, fill forms, extract text, OCR) use a pdf-manipulation skill instead.
---

# Designed PDF documents

Author the document as **HTML + CSS for paged media**, then print it to PDF with headless
Chrome or Edge. You get real typography, grids, web fonts, SVG charts and icons, and pixel-exact
results. Then render the pages to images and **look at them** before you hand anything over.

## Files in this skill

| File | What it is |
|---|---|
| [examples/proposal.html](examples/proposal.html) | A 4-page A4 proposal in the "Swiss / colour block" concept: full-bleed cover, huge section numbers, timeline, pricing table, signatures |
| [examples/canvas-a4-pages.js](examples/canvas-a4-pages.js) | The same cover and an inner page laid out on the ArchaDev canvas with `execute` (checked against the real executor) |
| [scripts/render-pdf.mjs](scripts/render-pdf.mjs) | `node scripts/render-pdf.mjs doc.html doc.pdf --preview` renders with the installed Chrome/Edge (waiting for fonts) and writes page PNGs |
| [references/print-css.md](references/print-css.md) | Fixed-page vs flowing layouts, page numbers, and the traps that create blank pages or fallback fonts |
| [references/archadev-tools.md](references/archadev-tools.md) | Which ArchaDev tools to call, page frame sizes, and canvas → PDF export routes |

## Tools

- **Inside ArchaDev**: lay out the pages as frames on the canvas first (`get_state` → `execute`, one page
  per call → `screenshot`), so the person can review the concept before you write the print HTML.
  Single pages can be exported directly from the Design panel (Export → PDF).
- **Rendering**: `scripts/render-pdf.mjs` (Chrome/Edge, no install) and `pdftoppm` (poppler) for previews.
- **Icons**: `icon()` on the canvas; inline Lucide SVG in the HTML (the `svg-icons` kit can export them).
- For merge, split, forms or text extraction, use a PDF-manipulation skill; this skill is about design.

## 1. Brief

- **Document type and reader**: a proposal for a busy client and a report for an analyst need
  different density.
- **Size**: A4 (210×297mm) by default in Indonesia/Europe, US Letter for US readers. Landscape
  for decks-as-PDF and certificates.
- **Screen or print?** Screen PDFs can use full-bleed color and links. Print needs ≥ 3mm bleed,
  no essential content within 5mm of the trim, and 300dpi images.
- **Brand**: logo, colors and fonts if any. If there are none, pick a direction from section 3.

## 2. The page system

```css
@page { size: A4; margin: 22mm 20mm 24mm; }
@page :first { margin: 0; }                       /* full-bleed cover */
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 10.5pt/1.55 "Inter", sans-serif; color: #18181b; }   /* margin: 0 or a blank page appears */
h1, h2, h3 { break-after: avoid; }
figure, table, .card { break-inside: avoid; }
.page-break { break-before: page; }
p { orphans: 3; widows: 3; }
```

- **Grid**: 12 columns inside the margins (or 6 on A4 portrait). Align everything to it: text
  blocks, images, rules, numbers.
- **Type scale for print**: body 9.5–11pt, captions 8pt, H3 12–13pt, H2 16–20pt, H1 28–40pt,
  cover title 48–96pt. Line length 60–75 characters. Use 1–2 families.
- **Vertical rhythm**: spacing in multiples of the body line-height (e.g. 4mm / 8mm / 16mm).
- **Running elements**: page numbers, section name, document title and confidentiality notes go
  in the footer. With Playwright use `displayHeaderFooter` + `footerTemplate`
  (`<span class="pageNumber"></span> / <span class="totalPages"></span>`). With plain Chrome
  CLI, number pages with a fixed footer or Paged.js.
- Use real tables (`thead` repeats on each page), and tabular numbers (`font-variant-numeric: tabular-nums`)
  for figures. Right-align numeric columns.

## 3. Make it unique, not a Word export

Pick **one** strong concept and carry it through every page:

- **Typographic cover**: an oversized title (80pt+) cropped by the page edge, with a small meta block
  (client, date, version) on a strict grid.
- **Color-block system**: each section gets its own color field on its opener page, and section
  numbers are set huge (01, 02, 03) in a light tint.
- **Editorial**: a serif display face, a pull quote at 20pt+, a two-column body, a wide margin
  column for notes, figures and captions.
- **Swiss / data**: strict grid, one accent, thick rules, big key numbers ("+38%") with small labels.
- **Brand motif**: one shape from the logo, repeated as a corner mark, section divider or bullet.

Also:
- Every section opener gets breathing room: it either starts a new page or has ≥ 25mm of space above it.
- Show data instead of describing it: inline SVG charts (bar, line, donut) in the brand palette,
  direct labels instead of legends, and no 3D.
- Use callout boxes for key takeaways, with at most one per page.
- Use icons from one library with one stroke weight (Lucide by default; `icon()` on the canvas).
- Photography should be real or clearly illustrative. Never use stretched or low-resolution images.

**Avoid**: centered paragraphs, more than 2 typefaces, a rainbow of colors, clip-art, a heavy
border around every box, a cover that is just a title on white with a logo, and tables with full
grid lines everywhere (use horizontal rules only).

## 4. Document type notes

- **Proposal**: cover, problem in the client's words, solution, scope/deliverables table,
  timeline, investment (pricing table + terms), why us (proof), next steps with a signature or CTA.
- **Report**: cover, executive summary on one page (3–5 key numbers + conclusions), sections
  with numbered headings, appendix. Use chart titles that state the finding ("Sales grew 38% in Q3").
- **CV/resume**: one or two pages, a sidebar grid (contact/skills) plus a main column (experience),
  a clean timeline, and no skill-percentage bars. It must stay ATS-friendly, so keep the text as
  real text, not images.
- **Invoice**: issuer and client blocks, invoice no./date/due, a line-item table, subtotal/tax/total
  with total emphasized, and payment details. Precision beats decoration.
- **Certificate**: landscape, generous margins, a centered composition (the one place centering is right),
  the name as the largest element, and signature lines and an ID at the bottom.
- **E-book / guide**: cover, table of contents with page numbers, chapter openers, and
  consistent callouts for tips and warnings.

## 5. Render

```bash
node scripts/render-pdf.mjs doc.html doc.pdf --preview     # PDF + doc-page-1.png, doc-page-2.png…
```

The script finds Chrome or Edge (or `CHROME_PATH`) and gives fonts time to load. Fixed-page layouts and
blank-page traps are covered in [references/print-css.md](references/print-css.md).

For page numbers in the footer, use Playwright (`npm i -D playwright`) and call
`page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, footerTemplate })`.

Fonts: load them with `@font-face` from local files or Google Fonts, and wait for them to load
(`document.fonts.ready`) before printing.

## 6. QA: look at every page

`--preview` writes the page images (`pdftoppm -png -r 60 out.pdf page` does the same by hand).
View the images (or a few at a time for long documents) and check:
1. Nothing is cut off and nothing runs into the margin.
2. There are no orphaned headings at a page bottom and no single lines alone at a page top.
3. There are no blank or near-empty pages unless they are intended.
4. Tables and figures did not split badly.
5. The cover and section openers carry the concept, and the body is calm and readable.
6. Fonts actually loaded (no fallback Times or Arial).

Fix, re-render, and re-check. Deliver the PDF, and keep the HTML source next to it so it can be edited later.
