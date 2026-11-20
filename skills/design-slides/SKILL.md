---
name: design-slides
description: Design and produce striking, distinctive presentation decks (pitch decks, company profiles, sales decks, reports, training, keynotes) as editable PowerPoint .pptx (via pptxgenjs) or as HTML slides exported to PDF. Use whenever the user wants a presentation, deck, slides, PPT/PPTX or "keynote-style" visuals that look designed (cool, unique, premium) rather than bullet-point templates. Covers story structure, slide layouts, a design system, build commands and a render-and-look QA loop.
---

# Designed slide decks

A great deck is **a story told one idea per slide**, set in a strict visual system with one
memorable concept. Write the story first, then design and build.

## Files in this skill

| File | What it is |
|---|---|
| [examples/deck.html](examples/deck.html) | A 7-slide pitch deck as HTML slides (cover, big number, split, chart, quote, comparison, ask). Render it with `../design-pdf/scripts/render-pdf.mjs` |
| [examples/deck.mjs](examples/deck.mjs) | The same deck as an **editable PPTX** with pptxgenjs: a 12-column grid helper, a safe-area check, a native chart and speaker notes |
| [examples/canvas-slides.js](examples/canvas-slides.js) | The deck started on the ArchaDev canvas: 1920×1080 frames and a header component reused with `instance()` (checked against the real executor) |
| [scripts/pptx-preview.ps1](scripts/pptx-preview.ps1) | Windows + PowerPoint: renders a .pptx to PDF and per-slide PNGs, hidden, so you can look at the real result |
| [references/layouts.md](references/layouts.md) | Grid placements for every layout, plus PowerPoint text-size limits |
| [references/archadev-tools.md](references/archadev-tools.md) | Which ArchaDev tools to call, slide frames, and export routes |

## Tools

- **Inside ArchaDev**: build the deck as 1920×1080 frames on the canvas (`get_state` → `execute`, one slide
  per call → `screenshot`). The **Slides** panel shows them as a deck. Use the orchestrate tools
  (`delegate`) for long decks.
- **PPTX**: pptxgenjs (`npm i pptxgenjs`), then `scripts/pptx-preview.ps1` (or LibreOffice) to look at it.
- **PDF**: HTML slides plus `../design-pdf/scripts/render-pdf.mjs --preview`.
- **Icons**: `icon()` on the canvas; SVG images in PPTX (export them from the `svg-icons` kit if it is installed).

## 1. Story before slides

1. **Audience and the decision you want** ("approve the budget", "sign the pilot").
2. **The one-sentence message** of the whole deck.
3. **Storyline**: write every slide title as a full sentence (an *action title*), e.g. "Late
   deliveries cost us Rp 1.2B last year", not "Delivery issues". Read only the titles in order;
   they must tell the whole story.
4. A typical arc: hook/problem → why now → solution → how it works → proof → plan/timeline →
   ask/next steps. Aim for 10–15 slides for a pitch and about one slide per minute for a talk.

## 2. Format choice

| Need | Build | Why |
|---|---|---|
| The user will edit it in PowerPoint/Google Slides, or asked for PPT/PPTX | **pptxgenjs** → `.pptx` | real editable text, shapes and charts |
| Viewing/sending only, maximum visual freedom | **HTML slides (1920×1080)** → PDF via headless Chrome | full CSS, web fonts and SVG |
| Both | one design spec, built twice, or HTML → PDF plus a simpler PPTX | |

## 3. Design system

- **Canvas**: 16:9, 13.333 × 7.5in (pptxgenjs `LAYOUT_WIDE`) or 1920×1080px. Margins are 0.83in /
  120px at the sides and 0.66in / 96px top and bottom, with a 12-column grid. Put titles at the same position on every content slide.
- **Type**: 1–2 families. Title 32–44pt, big statement 54–96pt, body 18–24pt, captions ≥ 12pt.
  Never go below 12pt. PPTX fonts must exist on the viewer's machine, so use safe faces
  (Segoe UI, Calibri, Arial, Georgia, Aptos) or tell the user which font to install.
- **Color**: background, text, one accent, plus a neutral for secondary text and lines. Use the
  accent for the one thing to notice on each slide. Section dividers may flip to a full accent or
  dark background.
- **Density**: ≤ 6 lines of text per slide and ≤ 25 words of body. If you need more, move it to
  speaker notes or an appendix.

## 4. Layout palette (vary them, don't repeat one layout)

- **Title/cover**: oversized title, subtitle, date/presenter, and one strong visual or shape.
- **Section divider**: a huge number (01) and the section name on an accent or dark background.
- **Big statement**: one sentence, very large, lots of space.
- **Big number**: "38%" at 120pt+ with a one-line explanation and the source.
- **Split**: text on the left (5 columns), a visual on the right (7 columns, full-bleed to the edge).
- **Comparison**: before/after or us/them in two columns with matching structure.
- **Process/timeline**: 3–5 steps on one line, numbered, with one icon per step (`icon()` on the canvas, Lucide SVG elsewhere).
- **Chart**: an action title stating the insight, one chart, the key data point highlighted in
  the accent color with everything else grey, and direct labels.
- **Quote/testimonial**: a large quote, with the name, role and photo small.
- **Grid of 3–6**: short items in a bento layout, with one item larger.
- **Closing/ask**: what you want, next steps, and contact.

**Unique concept**: pick one and repeat it: a recurring brand shape, an image crop style,
a color-band system per section, oversized typography bleeding off the slide, or a single
consistent illustration style.

**Avoid**: bullet walls, default theme templates, clip-art, 3D or pie charts with many slices,
more than one accent color, centered body text, inconsistent title positions, emoji as icons,
and stock photos of handshakes.

## 5. Build: PPTX with pptxgenjs

Start from [examples/deck.mjs](examples/deck.mjs) and keep its structure:

- A colour object `C`, a font object `F` (system-safe faces: Segoe UI, Georgia, Calibri, Aptos), and the
  grid `G` + `col(from, span)`. **Every** x/w comes from `col()`.
- `add()` records every box. The script refuses to write a file if any box leaves the safe area.
- `addChart` for data (editable), with the insight bar in the accent colour. Use `addNotes` on every slide.
- After writing, **render and look**: `scripts/pptx-preview.ps1 -Pptx deck.pptx`. The box check cannot
  see a 170pt number wrapping onto two lines and covering the title; only the render shows that.
  Text limits are in [references/layouts.md](references/layouts.md).

## 6. Build: HTML slides → PDF

Make each slide a `<section>` of 1920×1080px with `@page { size: 1920px 1080px; margin: 0 }`,
`body { margin: 0 }`, `section { break-after: page }` and `section:last-child { break-after: auto }`
(see [examples/deck.html](examples/deck.html)), then:

```bash
node ../design-pdf/scripts/render-pdf.mjs deck.html deck.pdf --preview --dpi 32
```

Watch for one CSS trap that appeared in real renders: a generic rule such as `.row p` beats the class on
the big number (`.huge`) and silently shrinks it. Scope it with `.row p:not(.huge)`.

## 7. QA: render and look at every slide

- PDF (from HTML): `pdftoppm -png -r 40 deck.pdf slide`, then view the images.
- PPTX on Windows with PowerPoint: `powershell -ExecutionPolicy Bypass -File scripts/pptx-preview.ps1 -Pptx deck.pptx`.
  Elsewhere, use `soffice --headless --convert-to pdf --outdir . deck.pptx` followed by `pdftoppm`. With neither available,
  rely on the safe-area check, and tell the user that the slides were not visually checked.

Check: the titles alone tell the story; layouts vary; nothing overflows its box (text auto-fit
is not a fix, so shorten the text instead); there is one accent per slide; and alignment is
consistent from slide to slide. Fix and re-render. Deliver the file plus a one-line summary of the storyline.
