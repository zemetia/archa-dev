---
name: design-social
description: Design scroll-stopping, minimal, modern social media content (Instagram feed posts 4:5 and 1:1, carousels, stories/reels covers 9:16, LinkedIn and X images) on the ArchaDev canvas (1080×1350 frames) or as HTML rendered to exact-size PNGs. Use whenever the user wants Instagram/IG posts, a carousel, feed content, a promo or announcement graphic, a quote card, a story, or "konten IG" that looks designed rather than like a template. Gives format specs and safe zones, hard rules against generic AI output (no eyebrow labels, one hero at extreme scale, a real overlap for depth), carousel continuity techniques, and a render-and-look loop.
---

# Social content that stops the scroll

You are a senior brand designer who makes social content for real small businesses. A post is
seen for under two seconds, on a phone, between other posts. It must say **one thing**, be
readable at thumbnail size, and look like it belongs to this brand and no other.

## Files in this skill

| File | What it is |
|---|---|
| [examples/canvas-post.js](examples/canvas-post.js) | **On the ArchaDev canvas**: a launch post (cropped glass drawn with `svg()`, tilted price sticker overlapping it) and a carousel hook slide (giant cropped numeral). Checked through the real executor: zero issues |
| [examples/posts-kopi.html](examples/posts-kopi.html) | 4 single posts (1080×1350) for a coffee shop: product launch (glass + price sticker), event (giant cropped date + card), review (quote on espresso), milestone (proportional "cups" + sticker) |
| [examples/carousel-rimbun.html](examples/carousel-rimbun.html) | 5-slide carousel (1080×1350) for a plant shop: hook, three causes, save-this ending; one vine drawn across all five slides so swiping feels continuous |
| [references/formats.md](references/formats.md) | Sizes, safe zones, type minimums and export settings per platform |
| `../design-pdf/scripts/render-pdf.mjs` | Renders the HTML to PDF + preview PNGs; `pdftoppm -scale-to-x/-y` then gives exact-size upload PNGs |

## 0. Rules that beat your defaults

1. **No eyebrows.** No small uppercase label above the headline (`TIPS`, `NEW ARRIVAL`,
   `DID YOU KNOW?`), no "✨" badge, no gradient text. The headline is the hook.
2. **One message, one hero.** One headline of at most 8 words, and one hero element at extreme
   scale: a 700px date, a 330px number, a glass that fills half the frame. Everything else is small.
3. **Readable as a thumbnail.** Headline ≥ 90px, body ≥ 28px on a 1080 canvas. Shrink the PNG to
   300px wide: if the headline is not readable, it is too small or too long.
4. **Depth through one overlap.** A sticker on the product, a card over the colour field, a
   rotated label crossing an edge, with a soft two-layer shadow tinted with the brand's dark colour.
   A tilt of 4–12° on **one** element adds life; more than one looks messy.
5. **Use the edge.** Crop the hero at the frame edge (a date, a ring, a leaf). Keep text and the
   logo inside the 72px margin.
6. **One brand system across posts.** Same 2 fonts, same palette, same logo position, same margin,
   one motif placed differently each time. A grid of nine posts should look like one shop.
7. **Data is drawn honestly.** If shapes stand for numbers, their sizes are proportional. Things
   that are not data get a different shape (a sticker, not a taller bar).
8. **Budget.** 1 accent, 2 typefaces, 0 emoji as decoration, 0 stock clip-art, 0 glows/blobs.
   Real names, prices, dates and places.

## 1. Brief (before any HTML)

- **The job** of the post: launch, event, proof (review/number), teach (carousel), or remind.
- **The one sentence** a viewer should remember, and **the one action** (DM a keyword, save,
  visit, tap the link in bio).
- **Brand assets**: logo, colours, fonts, product photos. Without photos, draw the product as
  simple layered shapes (see the glass in `posts-kopi.html`), never a stock photo.

## 2. Post recipes

| Job | Hero | Layout |
|---|---|---|
| Product launch | The product, large, with a price sticker overlapping it | Headline top-left, product right, two-line "when/where" left |
| Event | The date at 600–800px, cropped | Month + time top-right, a white card with title and 3 details overlapping the date |
| Review / testimonial | The quote at 100–120px serif | Stars as SVG, name and source small; motif cropped in a corner |
| Milestone / stat | The number at 300px+ | One-line thank-you; proportional shapes or one sticker below |
| Tip / how-to | Use a carousel (section 3) | |

## 3. Carousels

- **Slide 1 is the hook**: the problem in the viewer's words, plus a small "geser →" cue.
- **One point per slide**: a huge numeral, a two-to-four-word name, one sentence, one fix in a card.
- **The last slide asks**: save, share, or DM, with the points summarised as a checklist.
- **Continuity**: draw one element across a strip `N × 1080` wide and give each slide its own window
  (`left: -1080 × index`), so it leaves one slide on the right and enters the next on the left.
  Route it through empty zones (behind giant numerals, along an edge), never under body text.
- Alternate grounds (cream, sage, cream…) so every swipe visibly changes. Number the slides (`2/5`).

## 4. Build on the ArchaDev canvas (default inside the app)

A post is **not** a web section or a pitch-deck slide. The commonest failure is building one anyway:
a badge row on top, a 48px title, a 18px paragraph, a grid of bordered cards with 14px text. On a
phone that reads as an empty box with grey lines. Do this instead (copy the shape of
[examples/canvas-post.js](examples/canvas-post.js)):

- **One frame per post**: `insert(null, { type: 'frame', width: 1080, height: 1350, clip: true, fills: [ground] })`,
  layout `none`. Place children with `x`/`y` — auto layout cannot overlap or bleed. Carousel slides sit
  in one row, 80 apart, named `01 Hook`, `02 …`. Build one post per `execute` call.
- **Sizes from section 0**, never the web sizes: headline 96–130 / 800 with letterSpacing ≈ -2,
  body 30–36, small text 26–28. Nothing under 26.
- **Hero**: a giant numeral or date (`fontSize` 600–1100), or a product/illustration drawn with
  `svg(markup, post, { x, y, width })` — flat fills convert to editable vectors. Crop it at an edge and
  set `absolute: true` on it: that tells the checker the crop is intended.
- **Overlap + tilt**: the sticker/card goes in after the hero so it sits on top; put rotation inside
  the SVG (`<g transform="rotate(-10 150 150)">`). Text on it: `textSizing: 'fixed'`, `width`, `height`,
  `textAlign: 'center'` (auto-width text ignores width and alignment).
- **Words stay text nodes**, never `<text>` inside SVG, so the person can edit them.
- **Look at the screenshot** of each post at its small size. If it would pass as a website card, a
  dashboard or a slide, rebuild it around one hero.

## 5. Build and render as HTML (outside the app, or for exact PNG files)

- One `<section>` per post, `width: 1080px; height: 1350px; overflow: hidden`, with
  `@page { size: 1080px 1350px; margin: 0 }`, `body { margin: 0 }`, `break-after: page` (not on the last).
- Shapes or type that bleed off the **bottom** edge go in one full-frame `<svg>`
  (`position: absolute; inset: 0`). A positioned div crossing the bottom edge is cut by print
  fragmentation and prints as a straight-sided arch.
- Render: `node ../design-pdf/scripts/render-pdf.mjs posts.html posts.pdf --preview --dpi 30` (small
  previews to look at), then the upload files at the exact size:
  `pdftoppm -png -scale-to-x 1080 -scale-to-y 1350 posts.pdf post` → `post-1.png`, `post-2.png`…
  (`--dpi 96` alone rounds to 1080×1351).

## 6. QA: look at every post, twice

1. At full size: nothing collides, nothing important within 72px of the edge, no orphan word on the
   headline's last line.
2. At thumbnail size (about 300px wide, or the contact sheet): the headline reads and the hero is
   obvious.
3. Side by side: the set looks like one brand, and no two neighbours share a layout or ground.
4. Rules 1–8 above hold. Fix, re-render, look again. Report what you checked.
