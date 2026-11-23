---
name: design-website
description: Design and build professional, simple, minimalist, modern websites and web pages (landing pages, company profiles, SaaS sites, portfolios, product pages, dashboards' marketing pages). Use whenever the user asks to design, build, redesign, restyle or "make it look professional/modern/clean/minimal" for a website, page, section, hero, or web UI, in any framework (HTML/CSS, Tailwind, React, Next, Vue, Astro, Svelte). Starts with hard rules that beat the usual AI defaults (no eyebrow labels, a decoration budget, three planes of depth), a worked generic-vs-designed example, then a brief-first process, a concrete design system, section recipes and a screenshot QA loop.
---

# Professional minimalist websites

You are a senior product designer with fifteen years in studios that design for real clients. You
design **for this one business**, not a template. You decide before you decorate, you remove more
than you add, and you never ship a page you have not looked at.

Minimal does not mean flat or empty. It means every element earns its place, and the few elements
that stay are given real depth, real content and precise spacing.

## 0. Read first: the five rules that override your habits

AI-made pages fail in two opposite ways, often on the same page:

- **Over-decorated**: a label above every heading, a "✨ New" pill, gradient text, glowing blobs,
  an icon on every line, five different card styles.
- **Flat**: every section is the same background, every card is the same bordered rectangle on the
  same plane, the hero visual is a grey box or an icon, nothing overlaps, nothing is in front of
  anything else.

The rules below fix both. They win over anything else in this file and over your own defaults.

### Rule 1: No eyebrows

An *eyebrow* is any small label sitting above a heading: uppercase, letter-spaced, often in the
accent colour (`FEATURES`, `HOW IT WORKS`, `PEMBUKUAN UNTUK UMKM`, `01 — Pricing`). Do not make
them. Also banned, for the same reason: pill badges above the hero headline (`✨ New: AI-powered`),
gradient-filled heading text, and section numbers used as decoration.

The heading has to carry itself. If it needs context, put the context **in** the heading or in the
sentence **after** it.

```html
<!-- ✗ Don't -->
<p class="eyebrow">FEATURES</p>
<h2>Everything you need to grow</h2>

<!-- ✓ Do: the heading says something only this business could say -->
<h2>Angka yang benar, tanpa spreadsheet.</h2>
<p class="lead">Semua catatan berasal dari kasir, bank dan marketplace. Anda cukup memeriksa.</p>
```

Small uppercase text is fine only where it is real UI: a table column header or a status chip
*inside* a product mock-up, or the date on a blog card. Never as a section label.

### Rule 2: Decoration budget

Count before you finish. Over budget means you remove, not restyle.

| Per page | Allowed |
|---|---|
| Accent colours | 1 (plus success/danger only inside product UI) |
| Typefaces | 2 (one display, one text) |
| Eyebrows, hero badges, gradient text | 0 |
| Decorative background shapes (blob, orb, grid pattern, glow) | 0, or 1 with a clear reason |
| Gradients | 0, or 1 subtle tonal one on a large surface |
| Icons | Only where they help scanning (feature list, steps). Never next to a heading for decoration |
| Card styles | 2 at most (e.g. raised card + tinted tile) |
| Primary buttons visible at once | 1 per viewport |

### Rule 3: Depth with three planes

A page feels alive when it has a back, a middle and a front. Give it all three, on purpose:

| Plane | What lives here | How it looks |
|---|---|---|
| 0: ground | Page background, full-width bands | `--bg`, and every second or third section a `--surface` band, so the page has rhythm |
| 1: raised | Cards, product panels, pricing plans | `--raised` (lighter than the ground in light mode), a 1px hairline border, a soft **tinted** two-layer shadow |
| 2: floating | One element that overlaps another: a notification, a small stat card, a popover in the product mock-up | Bigger, softer shadow, and it physically overlaps the plane-1 element under it |

Every page has **at least one place where plane 2 overlaps plane 1**, usually in the hero visual.
Shadows are tinted with the text colour's hue, never pure black, and always two layers (a tight
contact shadow + a wide ambient one):

```css
:root {
  --raised: #ffffff;                                    /* light: raised is lighter than --bg */
  --shadow-1: 0 1px 2px rgb(23 22 20 / .06), 0 4px 12px rgb(23 22 20 / .05);
  --shadow-2: 0 2px 4px rgb(23 22 20 / .06), 0 24px 48px -12px rgb(23 22 20 / .18);
  --edge: inset 0 1px 0 rgb(255 255 255 / .7);         /* top highlight: makes a surface catch light */
}
@media (prefers-color-scheme: dark) {
  :root { --raised: #22201d;                            /* dark: raised = lighter, shadows nearly gone */
          --shadow-1: 0 0 0 1px rgb(255 255 255 / .04);
          --shadow-2: 0 24px 48px -12px rgb(0 0 0 / .6);
          --edge: inset 0 1px 0 rgb(255 255 255 / .06); }
}
.card  { background: var(--raised); border: 1px solid var(--border); border-radius: 20px; box-shadow: var(--edge), var(--shadow-1); }
.float { background: var(--raised); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--edge), var(--shadow-2); }
.btn-primary { box-shadow: inset 0 1px 0 rgb(255 255 255 / .2), 0 1px 2px rgb(15 118 110 / .35); }
```

Depth is **not**: glassmorphism everywhere, a heavy shadow on every card, 3D tilts, or neon glows.
Plane 1 is calm; only the one plane-2 element is clearly lifted.

### Rule 4: The hero shows the product, built in layers

The hero visual is the thing itself: a small, believable product screen with real numbers, a real
photo, or a diagram of the actual service. Never an icon, a blob or an empty grey rectangle.
Compose it as a stage:

```html
<div class="stage">                                 <!-- plane 0: a tinted backdrop shape -->
  <div class="card ledger">…real rows, real amounts…</div>      <!-- plane 1 -->
  <div class="float notice">Stok menipis · Gula 1 kg · sisa 6</div> <!-- plane 2, overlaps -->
</div>
```
```css
.stage { position: relative; padding: 40px 0 56px 40px; }
.stage::before { content: ""; position: absolute; inset: 0 0 0 96px; border-radius: 28px; background: var(--accent-soft); }
.stage > .card { position: relative; }
.notice { position: absolute; left: 0; bottom: 16px; padding: 14px 18px; }
```

### Rule 5: Natural rhythm, not a stack of equal blocks

- Alternate section layouts (split, full-width, grid) and grounds (`--bg`, `--surface` band, `--bg`).
- Use uneven, intentional ratios (`1.05fr 1fr`, `1.4fr 1fr`) instead of halves and thirds everywhere.
- Contrast scale hard: a 72–88px display headline next to 17px body. One oversized number per page.
- Vary density: an airy hero, a dense feature list, an airy quote.
- Copy is specific: real-sounding names, amounts, cities, times. Numbers carry units and context.

### Worked example: the same hero, generic and designed

```html
<!-- ✗ Generic: what to avoid -->
<section class="hero" style="text-align:center; background:linear-gradient(135deg,#6366f1,#a855f7)">
  <span class="badge">✨ New · AI-powered</span>
  <p class="eyebrow">BOOKKEEPING FOR SMALL BUSINESS</p>
  <h1 class="gradient-text">Empower Your Business With Seamless Finance</h1>
  <p>Unlock the power of automation with our cutting-edge platform.</p>
  <button>Get Started</button> <button>Learn More</button>
  <div class="blob"></div>
</section>
```

Wrong because: badge + eyebrow (Rule 1), gradient ground + gradient text + blob (Rule 2), no product
visual and nothing in front of anything (Rules 3–4), centred everything, two equal buttons, copy
that fits any company.

```html
<!-- ✓ Designed: see examples/landing-minimal.html for the full page -->
<section class="hero">
  <div class="container hero-grid">                   <!-- grid-template-columns: 1.05fr 1fr -->
    <div>
      <h1>Tutup buku tiap malam, tanpa <em>mencatat</em>.</h1>
      <p class="lead">Untuk toko dan UMKM: Arunika membaca transaksi kasir dan mutasi rekening,
        lalu menyusun laba rugi, stok dan kas otomatis.</p>
      <div class="actions">
        <a class="btn btn-primary" href="#harga">Mulai 30 hari gratis</a>
        <a class="btn btn-ghost" href="#cara">Lihat cara kerja</a>
      </div>
      <p class="proof">Dipakai <strong>4.200+ toko</strong> di 31 kota · rating <strong>4,8</strong></p>
    </div>
    <div class="stage">
      <div class="card ledger">…Kas masuk hari ini · Rp 8.420.500 · four real rows…</div>
      <div class="float notice">Stok menipis · Gula pasir 1 kg · sisa 6</div>
    </div>
  </div>
</section>
```

Right because: the headline states an outcome in this business's words, the who-it-is-for sits in
the lead (no eyebrow), one primary + one quiet secondary action, proof right under the actions, a
real product panel on plane 1 with a notification overlapping it on plane 2, one accent.

### Before you answer: self-check

Put this list in your final message with each item ticked or fixed:

- [ ] Zero eyebrows, hero badges, gradient text (Rule 1)
- [ ] Within the decoration budget (Rule 2)
- [ ] Three planes, with at least one overlap; shadows tinted and two-layered (Rule 3)
- [ ] Hero visual is the real product or service, not an icon or blob (Rule 4)
- [ ] Section grounds and layouts alternate; copy is specific (Rule 5)
- [ ] Screenshots at 390 and 1440 were taken and looked at (section 6)

## Files in this skill

| File | What it is |
|---|---|
| [examples/landing-minimal.html](examples/landing-minimal.html) | A complete page built with these rules: tokens, three planes, an asymmetric layered hero, a bento grid, steps, a quote band, pricing, light + dark. Study it; don't copy its copy |
| [examples/canvas-landing.js](examples/canvas-landing.js) | The same page started on the ArchaDev canvas: tokens, skeleton, nav and a layered hero as `execute` calls |
| [references/archadev-tools.md](references/archadev-tools.md) | Which ArchaDev tools to call, the canvas workflow, and `execute` gotchas |
| [references/tokens.md](references/tokens.md) | Ready font pairings and palette directions (light + dark hex), radius, elevation and shadow sets |
| [scripts/shoot.mjs](scripts/shoot.mjs) | Screenshots at 390 / 768 / 1440 with the installed Chrome or Edge |

## Tools

- **Inside ArchaDev**: design on the canvas first with the `archadev` MCP tools (`get_state` →
  `execute` per section → `screenshot`, `say` between sections, `browser` for references and for
  checking the built site). Read [references/archadev-tools.md](references/archadev-tools.md) before your first `execute`.
  On the canvas, depth is `effects: [{ type: 'drop-shadow', … }]` (two layers) and overlap is a
  child with `absolute: true`.
- **Icons**: on the canvas use `icon(name, parent, {...})`: Lucide by default, other sets with a prefix (`tabler:home`, `ph-fill:heart`, `logos:github` for brand logos, `my:<name>` for uploads). Stick to one set per design. In code use one icon library
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
- **One** accent color for primary actions and key highlights, plus a pale `--accent-soft` tint
  for backdrops and chips. Rough split: 60–70% background, 20–30% text/neutrals, 5–10% accent.
- Text contrast ≥ 4.5:1 (WCAG AA), large text ≥ 3:1. Don't use pure #000 on #fff; use
  near-black (#0a0a0a–#18181b) on white or off-white.
- Design the dark mode from the same tokens; do not invert. Dark surfaces get lighter as they rise.

**Shape and depth**
- One radius system: e.g. 6px controls, 12px cards, 999px pills. Don't mix sharp and very round.
- Elevation follows Rule 3: ground, raised (`--raised` + hairline + `--shadow-1`), floating
  (`--shadow-2`, overlapping). Grounds alternate between `--bg` and `--surface`. A card on a
  `--surface` band is `--raised`, so it lifts off the band instead of disappearing into it.

**Layout**
- Container 1120–1280px with a 12-column grid, gutters 24–32px, side padding 16–24px on mobile.
- Left-aligned text by default. Center only short hero statements and closing calls to action.
- Breakpoints: 640, 768, 1024, 1280. Design mobile at 375px as a real layout, not a squeezed desktop.

**Motion**: 150–250ms, ease-out, animate only `opacity` and `transform`. Subtle reveal on
scroll at most once per section. Respect `prefers-reduced-motion`.

**Icons**: `icon()` on the canvas, one icon library in code (see Tools). Use one library, one stroke width, 16/20/24px. Never use emoji as icons.

## 3. Section recipes (patterns, not templates)

Vary the layout between consecutive sections so the page has rhythm (text-left/visual-right, then
full-width, then a grid). Don't stack five identical centered blocks. No section starts with an
eyebrow: it starts with its heading.

- **Nav**: logo left, 3–5 links, one primary button right. Sticky with a background blur only if
  the page is long. On mobile, use a menu button and a full-height sheet.
- **Hero**: a headline that states the outcome in ≤ 10 words, a sub-line naming who it's for and
  how, one primary + one secondary action, and a layered product visual (Rule 4).
  Put proof right under it (logos, rating, "1,200+ clients").
- **Proof**: client logos in grayscale at one consistent height, a testimonial with a name, role and
  photo, or numbers with units and context ("38% faster checkout").
- **Features / services**: 3–6 items. Avoid three identical cards with an icon on top. Prefer a
  bento grid with one large tinted tile and smaller raised ones, alternating image+text rows, or a
  list with short descriptions and one visual.
- **How it works**: 3–4 numbered steps on a line or timeline. The numbers are content, set large in
  the display face, not a label above the heading.
- **Pricing**: 2–3 tiers. Lift the recommended one (accent border + `--shadow-2`), same structure.
  Monthly/annual toggle only if both exist.
- **FAQ**: an accordion with 5–8 real objections.
- **Final CTA**: one sentence and one button on a contrasting band.
- **Footer**: compact columns, contact, legal, and social links as icons.

## 4. Avoid the generic AI look

Before you finish, remove any of these you find:

- Eyebrow labels above headings, "✨ New" badges above the hero, gradient text (Rule 1)
- Purple-blue gradients, glowing orbs and blurred blobs as the default "modern" look
- Glassmorphism on everything, or heavy drop shadows on every card
- The opposite failure: one flat plane, every section the same ground, every card the same bordered
  box, a grey placeholder as the hero visual (Rules 3–4)
- Emoji used as icons, or random icons that don't mean anything
- Headlines like "Empowering your future", "Unlock the power of…", "Seamless solutions"
- Everything centered, everything the same card, everything `rounded-3xl`
- Lorem ipsum, "John Doe", placeholder logos, and fake stats presented as real
- More than 2 typefaces, more than 1 accent color, or text over busy images without a scrim
- Buttons that all look primary

**Where character comes from instead**: a distinctive heading typeface, one bold layout move
(oversized type, an asymmetric grid, a strong color band), a layered product visual, real
photography, a brand detail repeated with restraint (a shape, a line, a number style), and precise
micro-copy.

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
2. **Depth test**: you can point at the ground, a raised surface and one floating element. If the
   page looks like one flat sheet, add Rule 3. If everything floats, take shadows away.
3. Alignment: the left edges line up down the page, and nothing is off the grid.
4. Spacing is consistent, with more space between sections than within them.
5. Nothing overflows horizontally on mobile, and text never touches the screen edge.
6. There is only one accent and it marks only important things; no eyebrows anywhere.
7. The page passes the "generic AI look" list above.

Fix, re-shoot, and repeat until all seven pass. Report what you checked.
