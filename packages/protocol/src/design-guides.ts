/*
 * Built-in design guides: ArchaDev's internal skill, served by the `read_guide` MCP tool and
 * pre-loaded into chat runs (blueprint MCP/04). All text is ours — written for ArchaDev's API.
 */

export type GuideTopic = 'process' | 'layout' | 'effects' | 'taste' | 'type-color' | 'components' | 'icons' | 'svg' | 'social' | 'landing' | 'web-app' | 'mobile';

export const GUIDES: Record<GuideTopic, { title: string; when: string; body: string }> = {
  process: {
    title: 'Working loop',
    when: 'every task',
    body: `1. Plan in one line: the screens/sections you will build and their order.
2. Tokens first on an empty document: setVariable for color/bg, color/surface, color/text, color/muted, color/accent, color/border and radius/md. On a document that has variables, use them.
3. Skeleton: insert every planned top-level frame at findEmptySpace() with its final width, a name and layout:"column". The person sees the plan at once.
4. Fill one section per execute call (a nav, a hero, a card grid). Big snippets are fine; one call that builds a whole section beats five small ones.
5. Every reply shows a screenshot of what you built. Look at it, read "Issues", fix in place with update(); never delete and rebuild.
6. Repeated pieces (button, card, row, nav item): build once, makeComponent(), then instance().
7. Finish with one sweep over each frame (find(...) for text with no fill, clipped nodes, odd spacing), then a 2-3 line summary.`,
  },
  layout: {
    title: 'Layout vocabulary',
    when: 'building any frame',
    body: `- Every container is a frame with layout "row" or "column", gap and padding. Absolute x/y only for top-level frames, overlays and decorations (absolute: true).
- Screen widths: desktop 1440, laptop 1280, tablet 834, mobile 390. Height: sizing.vertical "hug" so the screen grows with content.
- A section = full-width frame (sizing.horizontal "fill") with padding 64-120 vertical, then an inner "Container" frame with fixed width (1120-1200) centred via the parent's align:"center".
- Rows of equal cards: parent layout "row", gap 24; each card sizing.horizontal "fill" so they share width.
- More cards than fit in one row (features, pricing, gallery, logos, product list): a GRID — parent layout "row", wrap 3 (or columns: 3), gap 24, lineGap 24-32, cards sizing.horizontal "fill". The 4th card starts the second row by itself; never build rows by hand or compute x/y.
- Text that wraps: textSizing "auto-height" + sizing.horizontal "fill" (or a fixed width). Short labels: "auto-width".
- Buttons: frame layout "row", align "center", justify "center", padding {top:12,right:20,bottom:12,left:20}, sizing "hug".
- Spacing scale only: 4, 8, 12, 16, 24, 32, 48, 64, 96. Inner gaps smaller than outer gaps.
WRONG: x/y inside an auto-layout frame (ignored) · "fill" in a layout:"none" parent · fixed heights on text containers (clips) · 1px off-scale gaps.`,
  },
  effects: {
    title: 'Depth: glass, gradients, rich text',
    when: 'heroes, navs over images, cards with depth, headlines',
    body: `- Glass (frosted, blurred, "kaca") nav / card / panel: the layer must sit OVER something (photo, gradient, content) and have a see-through fill.
  { fills: ["#ffffff1f"], strokes: [{ color: "#ffffff33", width: 1 }], backdropBlur: 16, cornerRadius: 16 } — dark: fills ["#0b0b0e80"]. A nav over a hero: insert it inside the hero with absolute: true, x/y at the top.
  backdropBlur 12-24; it does nothing on an opaque fill (lint effect/blur-hidden). blur: 8 blurs the layer itself (soft glows, out-of-focus shapes).
- Photo with text on top: the photo is the frame's own fill (place_image { fillOf: frame }) and a scrim gradient above it: fills [image, { type: "linear-gradient", angle: 180, stops: ["#00000000", "#000000b3"] }]. Never stack translucent rects as a fake gradient.
- Gradients: { type: "linear-gradient", angle, stops } or "radial-gradient" (glow spots: radial with an accent stop fading to transparent). Keep them subtle: two or three close hues.
- Two-tone or mixed headline ("Design faster" with "faster" in accent or italic serif) = ONE text node with spans, never two text nodes side by side.
- Colours that come from the palette: write "$color/accent" so the design follows the token.
- Shadows: one soft drop-shadow on floating things only ({ type: "drop-shadow", y: 8, blur: 24, color: "#0000001f" }).`,
  },
  taste: {
    title: 'Taste: avoid generic output',
    when: 'every visual decision',
    body: `- Minimal by default: only the sections and elements the request names; no filler copy, eyebrow labels, badges, stat rows or decorative icons unless asked. Fewer, larger, well-spaced elements beat many small ones.
- One focal point per screen: one big headline or one hero visual, one primary button.
- Hierarchy through size and weight, not colour: headline 48-72 / 700, section titles 28-36 / 600, body 16 / 400 with lineHeight 1.5, muted text for support copy.
- Restraint: at most one accent colour, shadows only on floating things (menus, modals, a hero card), corner radius consistent (8-16).
- Do not put a card around everything. Group with whitespace and dividers first.
- Real copy: specific product names, numbers, dates and labels. Never "Lorem ipsum", "Feature 1", "Title here".
- Alignment: everything on a shared left edge or a centred axis — never both in one section.
- Density matches the job: marketing pages breathe (large padding), tools are compact (12-14px text, 8-12 gaps).`,
  },
  'type-color': {
    title: 'Type and colour',
    when: 'choosing tokens',
    body: `Type: one family (Inter unless the brief says otherwise; a serif or display face only for headlines). Scale 12 / 14 / 16 / 20 / 24 / 32 / 48 / 64. Weights 400, 500, 600, 700. letterSpacing -0.5 to -1.5 on sizes ≥ 32.
Light palette: bg #ffffff, surface #f7f7f8, text #111113, muted #6b6b76, border #e6e6ea, accent one saturated hue (e.g. #5b5bd6, #0f766e, #e5484d).
Dark palette: bg #0b0b0e, surface #16161a, text #ededf0, muted #9a9aa5, border #26262c, accent lighter than in light mode.
Contrast: body text ≥ 4.5:1 on its background, large text ≥ 3:1 (lint checks this). Text on accent buttons: white on dark accents, near-black on light accents.
Every text node needs fills — text has no colour by default.`,
  },
  components: {
    title: 'Components',
    when: 'anything that repeats',
    body: `- Check the Components and Library lists in the state first; place existing ones with instance(id, parent) or fromLibrary(ref, parent).
- Build a component once, inside the first screen that needs it, then makeComponent(frame, "one-line purpose", { props: { label: { type: "text", node: labelId } } }). Place more with instance(id, parent, { props: { label: "…" } }) or setProps(instance, { label }).
- Variants (size, tone, state): build each main, makeComponent(..., { set: "Button", variant: { size: "lg" } }); switch a copy with setProps(copy, { size: "sm" }).
- To change every copy: edit the main, then syncInstances(main) — edits made on single copies stay.
- Good candidates: Button (primary/secondary), Input, Nav item, Card, List row, Badge, Avatar, Tab, Table row.`,
  },
  icons: {
    title: 'Icons',
    when: 'navs, buttons, lists, features',
    body: `icon(name, parent, { size?: 20, color?: "#hex", strokeWidth?: 2, index?, x?, y? }) inserts an icon as a vector and returns its id. icons("query") searches every set when unsure.
Sets: plain names are lucide; "tabler:…", "ph:…" (Phosphor; ph-fill/ph-bold/ph-light/ph-thin), "hero:…" (Heroicons; hero-solid/hero-mini/hero-micro). Keep ONE icon set per design.
Brand logos: icon("logos:github"), "logos:google", "logos:apple", "logos:stripe", "logos:whatsapp"… keep their brand colour (pass color for a one-colour row of logos). Use them for social links, "trusted by" rows and sign-in buttons — never draw a logo by hand. "my:<name>" places an icon the person uploaded.
Common names: search, menu, x, check, chevron-right, chevron-down, arrow-right, plus, minus, settings, user, users, bell, mail, home, calendar, clock, star, heart, shopping-cart, credit-card, lock, eye, trash-2, pencil, download, upload, share-2, filter, sliders-horizontal, layout-dashboard, bar-chart-3, file-text, folder, image, globe, phone, map-pin, sun, moon, log-out, zap, shield-check, sparkles.
Sizes: 16 in dense UI and buttons, 20 in navs and lists, 24-32 in feature tiles (inside a tinted rounded frame). Colour = the text colour next to it, or the accent.`,
  },
  svg: {
    title: 'SVG drawings',
    when: 'logos, illustrations, charts, diagrams, patterns, custom marks',
    body: `When you write SVG, put it ON THE CANVAS — never in a text node, never only as code in your reply.
Place it with the place_svg tool { svg, parent?, x?, y?, width?, height?, name? } (the markup goes in as a plain string, no escaping), or inside execute: svg(markup, parent, { width?, height?, x?, y?, name?, mode? }) -> id.
The reply says how it landed: "N editable vector layers" (every shape is a path the person can recolour and move) or "an image" (exact look, not editable). Shapes stay vectors; gradients, <text>, <image>, filters, masks, clip paths, dashed strokes, <use> and nested <svg> make it an image. Prefer vectors: flat fills, strokes, opacity, transforms, arcs, <style> class rules all convert. Put words in real text nodes next to the drawing, not in <text>.
Write clean SVG: a viewBox (e.g. 0 0 240 160), width/height or the width option for the size on the canvas, one shape per element, id on each meaningful shape (it becomes the layer name), colours from the design's palette as hex.
Use icon() for icons and logos:<brand> for brand logos — write SVG only for things no set has: an illustration, a custom logo mark, a decorative pattern, a chart, a diagram.
Charts: draw bars/lines/areas from the real values with exact coordinates; keep axis labels and numbers as text nodes beside the svg so they stay editable.
Look at the screenshot in the reply; fix by placing a corrected SVG and removing the old one, or edit the vector layers with update().`,
  },
  social: {
    title: 'Social posts (Instagram feed, carousel, story)',
    when: 'Instagram / IG posts, feed content, carousels, stories, konten IG, 4:5 or 1:1 graphics',
    body: `A post is not a web page or a slide: it is seen for under two seconds, on a phone, as a thumbnail. These sizes OVERRIDE the web/UI sizes in the other guides.
Frames: feed 1080×1350 (4:5, default), square 1080×1080, story 1080×1920 (keep text inside y 250–1580). Carousel = one frame per slide in a row, 80 apart, named "01 Hook", "02 …". Frame layout "none", clip true; place everything with x/y so things can overlap and bleed. Margin 72.
Type on a 1080 canvas: headline 96–130 / 800, at most 8 words, letterSpacing about -2; body 30–36, at most 3 short lines; logo, page count, "geser →" 26–28. Nothing smaller than 26. A 13–18px label is invisible on a phone.
One message, one hero at extreme scale: a 600–1100px numeral or date, a product filling half the frame, a 110px quote. Crop the hero at an edge (set absolute: true on it so the checker knows the crop is meant). Everything else is small.
Depth through ONE overlap: a sticker or card crossing the hero. Tilt via svg() (rotation inside the SVG). Draw products and illustrations with svg(); words stay text nodes on top. Centred text on a sticker needs textSizing "fixed" + width + height.
Do NOT: eyebrow labels or badges above the headline, pill tags, a grid of 4 feature cards, empty bordered cards, UI mockups with tiny labels, small text blocks, more than 1 accent, a header row of tags. If it looks like a landing page section or a pitch-deck slide, start over.
Carousel: slide 1 = the hook in the reader's words + "1/5 · geser →"; one point per slide (huge numeral, 2–4 word name, one sentence); last slide asks to save/share/DM. Alternate grounds (light, dark, light…) and change the layout each slide; same logo spot, margin and fonts on all.
Check every screenshot at thumbnail size: if the headline is not readable when the post is 300px wide, make it bigger or shorter. The design-social skill has worked examples.`,
  },
  landing: {
    title: 'Landing page',
    when: 'marketing sites, heroes, pricing',
    body: `Build the sections the request names. When it names none, keep it minimal: Nav (logo, up to 3 links, one button) → Hero (headline ≤ 8 words, one short line, one button, one visual) → at most one section with real content → a one-line footer. Social proof, feature grids, pricing, testimonials, FAQ and multi-column footers only when asked.
Width 1440, inner container 1200. Hero padding 96-128 top. Separate sections with space, or alternate bg / surface — not borders.
Pricing: 3 tiers in a row, middle one highlighted (accent border or dark surface), price large (40-48), feature list with check icons, one button per tier.`,
  },
  'web-app': {
    title: 'Web app and dashboard',
    when: 'dashboards, admin, SaaS screens, tables, forms',
    body: `Show only the data and controls the screen's job needs; add more panels, filters or widgets only when asked.
Shell: 1440×900, row layout: Sidebar (240-260 wide, nav items with icons, active item tinted) + Main (fill) with a Topbar (64 high: title, search, actions) and a content column with padding 24-32.
KPI row: 3-4 cards (label 13 muted, value 28-32 semibold, delta badge green/red). Charts: a frame with axis labels and bars/lines drawn as rects or paths — give data real-looking values.
Tables: header row (12-13, muted, uppercase optional), rows 48-56 high with dividers, right-align numbers, status as badges, row actions as icons.
Forms: label above input (14/500), inputs 40-44 high with border and radius 8, helper text 12 muted, primary action bottom-right.
Text sizes 13-14 for UI, 12 for meta. Gaps 8-16. Keep it calm: neutral surfaces, accent only for primary action and active state.`,
  },
  mobile: {
    title: 'Mobile app',
    when: 'phone screens, onboarding flows',
    body: `One task per screen, few words: a title, the content, one primary action.
Frame 390×844 (fixed height for a screen; hug for a long scroll), padding 20 sides. Status bar area 44-54 at the top, home indicator space 34 at the bottom.
Touch targets ≥ 44 high. Primary button full width (sizing.horizontal "fill"), 52-56 high, radius 12-16, at the bottom.
Type: title 28-34 / 700, body 16-17, captions 13. Tab bar: 4-5 items with icon (24) + label (11), active in accent.
Flows: place screens in one row left to right with 80 gap, named "01 Welcome", "02 …", so the sequence reads at a glance.`,
  },
};

export const GUIDE_INDEX = (Object.entries(GUIDES) as Array<[GuideTopic, (typeof GUIDES)[GuideTopic]]>)
  .map(([k, g]) => `  ${k} — ${g.title} (${g.when})`).join('\n');

export function guideText(topic: string): string {
  const g = GUIDES[topic as GuideTopic];
  if (!g) return `No guide "${topic}". Topics:\n${GUIDE_INDEX}`;
  return `# ${g.title}\n${g.body}`;
}

const KEYWORDS: Array<[GuideTopic, RegExp]> = [
  ['effects', /\b(glass|glassy|frosted|blur|blurred|kaca|buram|backdrop|gradients?|gradien|scrim|overlay|two-tone|dua warna)\b/i],
  ['landing', /\b(landing|hero|marketing|website|homepage|home page|pricing|waitlist|portfolio|company profile|saas site)\b/i],
  ['web-app', /\b(dashboard|admin|analytics|table|crm|settings page|web ?app|saas|console|form|kanban|inbox|sidebar)\b/i],
  ['mobile', /\b(mobile|phone|ios|android|app screen|onboarding|splash|tab bar)\b/i],
  ['svg', /\b(svg|vector|illustrations?|ilustrasi|logo ?marks?|chart|graph|grafik|diagram|pattern|drawing)\b/i],
  ['social', /\b(instagram|insta|ig|feeds?|carousels?|karosel|ig stor(y|ies)|insta stor(y|ies)|reels?|tiktok|postingan|social media|sosmed|sosial media|1080 ?[x×] ?1350)\b|\b4 ?: ?5\b|\b9 ?: ?16\b/i],
];

/** Guides worth pre-loading for a request (saves the agent a `read_guide` call on the first turn). */
export function guidesFor(request: string): GuideTopic[] {
  const picked = KEYWORDS.filter(([, re]) => re.test(request)).map(([t]) => t);
  // A social post is not a page or a screen: their sizes would fight the social ones.
  return picked.includes('social') ? picked.filter((t) => t !== 'landing' && t !== 'web-app' && t !== 'mobile') : picked;
}

/** Guides every design run needs, sent once in the (cached) system prompt so the agent never has to fetch them. */
export const CORE_GUIDE_TOPICS: GuideTopic[] = ['process', 'layout', 'effects', 'taste', 'type-color', 'components', 'icons'];
export const CORE_GUIDES = CORE_GUIDE_TOPICS.map((t) => guideText(t)).join('\n\n');
