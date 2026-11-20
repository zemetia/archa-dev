---
name: design-website
description: Design and build professional, simple, minimalist, modern websites and web pages (landing pages, company profiles, SaaS sites, portfolios, product pages, dashboards' marketing pages). Use whenever the user asks to design, build, redesign, restyle or "make it look professional/modern/clean/minimal" for a website, page, section, hero, or web UI, in any framework (HTML/CSS, Tailwind, React, Next, Vue, Astro, Svelte). Gives a brief-first process, a concrete design system (type, spacing, color, layout), section recipes, an anti-generic checklist and a screenshot QA loop.
---

# Professional minimalist websites

Minimal does not mean empty. It means **every element earns its place**: few colors, one or two
typefaces, generous space, strict alignment, real content, and one clear action per section.
The goal is a site that looks like a careful human designer made it for this specific business,
not a generic AI template.

## Files in this skill

| File | What it is |
|---|---|
| [examples/landing-minimal.html](examples/landing-minimal.html) | A complete page built with this system: tokens, an asymmetric hero, a bento grid, steps, a quote, pricing, light + dark. Open it, study it, and don't copy its copy |
| [examples/canvas-landing.js](examples/canvas-landing.js) | The same page started on the ArchaDev canvas: tokens, skeleton, nav and hero as `execute` calls (checked against the real executor) |
| [references/archadev-tools.md](references/archadev-tools.md) | Which ArchaDev tools to call, the canvas workflow, and `execute` gotchas |
| [references/tokens.md](references/tokens.md) | Ready font pairings and palette directions (light + dark hex), radius and shadow sets |
| [scripts/shoot.mjs](scripts/shoot.mjs) | Screenshots at 390 / 768 / 1440 with the installed Chrome or Edge |

## Tools

- **Inside ArchaDev**: design on the canvas first with the `archadev` MCP tools (`get_state` →
  `execute` per section → `screenshot`, `say` between sections, `browser` for references and for
  checking the built site). Read [references/archadev-tools.md](references/archadev-tools.md) before your first `execute`.
- **Icons**: on the canvas use `icon(name, parent, {...})` (Lucide). In code use one icon library
  (`lucide-react` or inline Lucide SVG). If the `svg-icons` skill / icon kit is installed, use it to search and export.
- **QA**: `node scripts/shoot.mjs <url|file.html> <outDir>`, then look at the PNGs.

## 1. Brief first (2 minutes, before any code)

Write these down (ask the user only for what you cannot infer):

1. **Who** visits, and what do they already know?
2. **The one action** you want them to take (book, buy, sign up, contact, download).
3. **Three brand adjectives** (e.g. *calm, precise, warm*), which drive every style choice below.
4. **Proof** the business has: numbers, clients, testimonials, screenshots, certificates.
5. **Content**: real names, real products, real copy. If you must invent copy, make it specific to
   the business ("Same-day courier across Surabaya" beats "Fast, reliable solutions").

Then list sections in order. Each section answers one visitor question:
*What is this? → Why trust it? → How does it work? → What does it cost? → What do I do now?*

## 2. Design system (decide once, use everywhere)

Define these as CSS variables / Tailwind theme tokens **before** building components.

**Typography**
- One sans for UI and body: Inter, Geist, Manrope, Plus Jakarta Sans, DM Sans or IBM Plex Sans.
  Optionally add **one** display face for headings to give character: a serif (Instrument Serif,
  Fraunces, Newsreader) or a tight grotesk (Space Grotesk, Satoshi, General Sans).
- Scale (ratio ~1.25): 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36 · 48 · 60 · 72px.
  Body 16–18px, line-height 1.6. Headings line-height 1.1–1.2 with letter-spacing −0.01 to −0.03em.
- Body copy is at most ~65 characters per line (`max-width: 65ch`).
- Use 2–3 weights only (400, 500, 600/700). Hierarchy comes from size and color before weight.

**Spacing**: 4/8-point scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128.
Section padding is 96–128px desktop and 64px mobile. Related items sit closer than unrelated
ones (proximity carries the grouping, not borders).

**Color**
- A neutral scale (9–11 steps), slightly tinted toward the brand hue so it doesn't feel dead-grey.
- **One** accent color for primary actions and key highlights. Optional: one secondary for
  success/charts. Rough split: 60–70% background, 20–30% text/neutrals, 5–10% accent.
- Text contrast ≥ 4.5:1 (WCAG AA), large text ≥ 3:1. Don't use pure #000 on #fff; use
  near-black (#0a0a0a–#18181b) on white or off-white.
- Design the dark mode from the same tokens; do not invert. Dark surfaces get lighter as they rise.

**Shape and depth**
- One radius system: e.g. 6px controls, 12px cards, 999px pills. Don't mix sharp and very round.
- Separate surfaces with 1px borders (neutral-200) or a subtle background shift. Shadows are rare,
  soft and layered (`0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .06)`).

**Layout**
- Container 1120–1280px with a 12-column grid, gutters 24–32px, side padding 16–24px on mobile.
- Left-aligned text by default. Center only short hero statements and closing calls to action.
- Breakpoints: 640, 768, 1024, 1280. Design mobile at 375px as a real layout, not a squeezed desktop.

**Motion**: 150–250ms, ease-out, animate only `opacity` and `transform`. Subtle reveal on
scroll at most once per section. Respect `prefers-reduced-motion`.

**Icons**: `icon()` on the canvas, one icon library in code (see Tools). Use one library, one stroke width, 16/20/24px. Never use emoji as icons.

## 3. Section recipes (patterns, not templates)

Vary the layout between consecutive sections so the page has rhythm (text-left/visual-right, then
full-width, then a grid). Don't stack five identical centered blocks.

- **Nav**: logo left, 3–5 links, one primary button right. Sticky with a background blur only if
  the page is long. On mobile, use a menu button and a full-height sheet.
- **Hero**: a headline that states the outcome in ≤ 10 words, a sub-line naming who it's for and
  how, one primary + one secondary action, and a real visual (product shot, photo, UI, diagram).
  Put proof right under it (logos, rating, "1,200+ clients").
- **Proof**: client logos in grayscale at one consistent height, a testimonial with a name, role and
  photo, or numbers with units and context ("38% faster checkout").
- **Features / services**: 3–6 items. Avoid three identical cards with an icon on top. Prefer a
  bento grid with one large item, alternating image+text rows, or a list with short
  descriptions and one visual.
- **How it works**: 3–4 numbered steps on a line or timeline.
- **Pricing**: 2–3 tiers. Highlight one with the accent border, not a different design.
  Monthly/annual toggle only if both exist.
- **FAQ**: an accordion with 5–8 real objections.
- **Final CTA**: one sentence and one button on a contrasting band.
- **Footer**: compact columns, contact, legal, and social links as icons.

## 4. Avoid the generic AI look

Before you finish, remove any of these you find:

- Purple-blue gradients, glowing orbs and blurred blobs as the default "modern" look
- Glassmorphism on everything, or heavy drop shadows on every card
- Emoji used as icons, or random icons that don't mean anything
- Headlines like "Empowering your future", "Unlock the power of…", "Seamless solutions"
- Everything centered, everything the same card, everything `rounded-3xl`
- Lorem ipsum, "John Doe", placeholder logos, and fake stats presented as real
- More than 2 typefaces, more than 1 accent color, or text over busy images without a scrim
- Buttons that all look primary

**Where character comes from instead**: a distinctive heading typeface, one bold
layout move (oversized type, an asymmetric grid, a strong color band), real photography or
product imagery, a brand detail repeated with restraint (a shape, a line, a number style), and
precise micro-copy.

## 5. Build quality

- Semantic HTML (`header`, `nav`, `main`, `section` with headings, `footer`), one `h1`, and
  heading levels in order.
- Every interactive element has hover, focus-visible (a visible ring) and active states.
  Touch targets are ≥ 44px.
- Images use `width`/`height` or `aspect-ratio` (no layout shift), `loading="lazy"` below the fold,
  modern formats, and alt text that describes them.
- Fonts: at most 2 families and 4 files, `font-display: swap`, preload the main one.
- Meta: title, description, Open Graph image, and favicon.

## 6. QA: look at it

Screenshot the page at 375, 768 and 1440px wide and actually view the images:

```bash
node scripts/shoot.mjs http://localhost:3000 shots          # or a file.html; writes shots/shot-390.png …
node scripts/shoot.mjs page.html shots --widths 390,1440 --height 4000
```

Inside ArchaDev you can use the `browser` tool instead: `open` the URL, `resize { width: 390, mobile: true }`,
then `screenshot { fullPage: true }`.

Don't screenshot a phone width with `chrome --window-size=390,…` directly. Headless Chrome will not
make a window narrower than about 500px, so the page looks cut off when it isn't. The script renders
each width inside an iframe of exactly that width.

Check:
1. **Squint test**: the headline and primary action are what you see first.
2. Alignment: the left edges line up down the page, and nothing is off the grid.
3. Spacing is consistent, with more space between sections than within them.
4. Nothing overflows horizontally on mobile, and text never touches the screen edge.
5. There is only one accent and it marks only important things.
6. The page passes the "generic AI look" list above.

Fix, re-shoot, and repeat until all six pass. Report what you checked.
