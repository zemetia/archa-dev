# Slide layouts on the grid

Canvas: 13.333 × 7.5 in (pptxgenjs `LAYOUT_WIDE`) = 1920 × 1080 px. Margins are 0.83 in (120 px) at the
sides and 0.66 in (96 px) top and bottom. There are 12 columns with a 0.3 in gutter; `col(from, span)`
in `examples/deck.mjs` returns `{ x, w }`.

| Layout | Placement (columns · y in inches) | Type |
|---|---|---|
| **Cover** | Title cols 1–10, bottom-aligned ending at y 5.8; byline y 6.15 | Title 72–96pt, byline 16pt |
| **Section divider** | Huge number cols 1–4, y 1.5–5.5; section name cols 5–12 | Number 180–240pt in a tint, name 44pt |
| **Action title + body** | Title cols 1–11, y 0.95, h 1.4; body from y 2.6 | Title 32–40pt (2 lines max), body 18–24pt |
| **Big number** | Number cols 1–8 (one line), body cols 9–12 bottom-aligned with the number | Number 120–170pt, body 18pt |
| **Split** | Text cols 1–5, visual cols 7–12 (or full-bleed to the right edge) | Body 18–20pt |
| **Chart** | Chart cols 1–12, y 2.5, h 4.3; title states the insight | Labels 13–14pt |
| **Comparison** | Columns 1–6 and 7–12, the "us" side on a white card | Items 16–18pt |
| **Process** | 3–5 equal columns, number + title + one line each | Number 30pt, title 18pt |
| **Quote** | Quote cols 1–11, bottom-aligned at y 5.6; name below | Quote 44–60pt serif |
| **Ask / closing** | Statement cols 1–11; three-column breakdown below a rule | Statement 52–64pt |

## Size limits (PowerPoint fonts are wider than web display faces)

- At **Georgia/Segoe 34pt**, about 45 characters fit per line in cols 1–11. Keep titles at 2 lines or fewer.
- At **120pt**, about 9 characters fit in cols 1–8. A big number must stay on one line, otherwise it
  wraps upward over the title (seen in a real render).
- Text in PPTX does not auto-shrink (`fit: 'none'`). If it doesn't fit, shorten it.
- Nothing goes smaller than 12pt except source lines and page numbers (10pt).

## Native vs drawn

- Charts: use `addChart` (editable data). Highlight one bar with `chartColors` (accent for the insight,
  neutral for the rest), hide the value axis, and show data labels.
- Icons: SVG as base64 `addImage({ data: 'data:image/svg+xml;base64,...' })`, colour baked in.
- Photos: `sizing: { type: 'cover', w, h }` crops instead of stretching.
