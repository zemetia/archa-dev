# Formats, safe zones and type minimums

All sizes in px. Design at these sizes and export PNG (JPG at quality 90+ for photos).

| Format | Size | Ratio | Safe zone | Notes |
|---|---|---|---|---|
| Instagram feed portrait | 1080 × 1350 | 4:5 | 72px margin | Takes the most screen height in the feed; default for posts and carousels |
| Instagram feed square | 1080 × 1080 | 1:1 | 64px margin | The profile grid crops posts to about 3:4 (1080 × 1440 shows centre 1012 × 1350); keep the hero central |
| Instagram story / reel cover | 1080 × 1920 | 9:16 | top 250px and bottom 340px hold UI; keep text inside y 250–1580 | Reel covers are cropped to 4:5 in the grid: keep the title in the centre 1080 × 1350 |
| Carousel | 1080 × 1350 each, up to 20 | 4:5 | 72px | Every slide the same size; slide 1 decides whether anyone swipes |
| LinkedIn post image | 1200 × 1500 or 1080 × 1350 | 4:5 | 72px | Text-heavy is accepted here, but the same rules apply |
| X / Twitter image | 1600 × 900 | 16:9 | 64px | The timeline may crop to centre; keep the hero central |

## Type minimums on a 1080-wide canvas

| Role | Size | Note |
|---|---|---|
| Headline | 90–130px | at most 8 words; check it at 300px wide |
| Hero number / date | 300–800px | crop it at the edge if it is bigger than the frame |
| Body / details | 28–34px | at most 3 short lines |
| Logo / page count / source | 24–28px | always the same position |

## Rendering

- `@page { size: 1080px 1350px; margin: 0 }`, render to PDF, then `pdftoppm -png -scale-to-x 1080 -scale-to-y 1350 posts.pdf post`
  for exact 1080 × 1350 PNGs (`--dpi 96` rounds to 1080 × 1351).
- For 1:1 use `size: 1080px 1080px`; for stories `size: 1080px 1920px`.
- Web fonts: load from Google Fonts; the script waits for them. Check the PNG for fallback fonts.
