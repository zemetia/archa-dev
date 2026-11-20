# Starting tokens

Pick **one** direction from the brief's three adjectives, then adjust the accent to the brand.
Every palette passes WCAG AA for body text on its background. Check your own changes.

## Font pairings (all on Google Fonts)

| Mood | Headings | Body / UI | Notes |
|---|---|---|---|
| Calm, editorial, premium | Instrument Serif 400 | Inter 400/500/600 | Large serif headlines (64–88px), italic for one emphasised word |
| Precise, technical, SaaS | Inter Tight 600 or Geist 600 | Inter / Geist 400/500 | Tight tracking (−0.03em) on big sizes, mono for numbers or code |
| Warm, friendly, local business | Fraunces 500 (soft optical size) | DM Sans 400/500 | Rounded radii (12–16px) suit it |
| Bold, modern, startup | Space Grotesk 600 | Inter 400/500 | Oversized headings, strong colour block |
| Corporate, trustworthy | Manrope 700 | Manrope 400/500 | One family, hierarchy by size and weight |
| Fashion, studio, portfolio | Playfair Display 400 or Newsreader | Work Sans 400 | Lots of whitespace, small uppercase labels |

Use at most 2 families and 4 font files. Use `font-display: swap`.

## Palettes (light / dark)

Token order: bg · surface · text · muted · border · accent · accent-ink (text on the accent).

**Stone + teal** (calm, finance, health)
- Light: `#fbfaf8 #f3f1ed #171614 #6b6760 #e4e0d9 #0f766e #ffffff`
- Dark: `#11110f #1a1917 #f2f0ec #a29d94 #2b2926 #2dd4bf #062b27`

**Zinc + indigo** (SaaS, developer tools)
- Light: `#ffffff #f7f7f8 #111113 #6b6b76 #e6e6ea #4f46e5 #ffffff`
- Dark: `#0b0b0e #16161a #ededf0 #9a9aa5 #26262c #818cf8 #0b0b0e`

**Paper + ink + vermilion** (editorial, studio, events)
- Light: `#f7f4ee #efeae1 #1c1a17 #6f685d #ddd5c7 #c2410c #ffffff`
- Dark: `#141210 #1e1b18 #f1ece4 #a69d90 #322d27 #ff7a45 #1c0d05`

**White + forest** (agriculture, sustainability, local food)
- Light: `#ffffff #f4f6f2 #14200f #5d6b57 #e1e7dc #2f6b2a #ffffff`
- Dark: `#0d120b #151c13 #e9efe5 #9aa894 #263022 #7bc96f #0d120b`

**Slate + amber** (logistics, industry, B2B)
- Light: `#fafafa #f1f3f5 #0f172a #5b6474 #e2e6eb #b45309 #ffffff`
- Dark: `#0b1020 #131a2b #e8ecf3 #98a2b3 #253049 #f59e0b #1a1003`

**Monochrome** (portfolio, architecture, luxury): no hue at all
- Light: `#ffffff #f5f5f5 #0a0a0a #6b6b6b #e5e5e5 #0a0a0a #ffffff`
- Dark: `#0a0a0a #171717 #fafafa #a3a3a3 #262626 #fafafa #0a0a0a`

## Radius sets (pick one per site)

| Feel | Controls | Cards | Large surfaces | Buttons |
|---|---|---|---|---|
| Sharp, editorial | 2 | 4 | 6 | 2 |
| Neutral modern | 6 | 12 | 20 | 8 or 999 (pill) |
| Soft, friendly | 10 | 16 | 28 | 999 |

## Shadows (use sparingly: floating things only)

```css
--shadow-sm: 0 1px 2px rgb(0 0 0 / .05);
--shadow-md: 0 1px 2px rgb(0 0 0 / .04), 0 8px 24px rgb(0 0 0 / .06);
--shadow-lg: 0 2px 4px rgb(0 0 0 / .04), 0 24px 48px rgb(0 0 0 / .10);
```

In dark mode, raise surfaces with a lighter background instead of shadows.
