// Two 4:5 Instagram posts for a coffee shop, one execute call each in practice (shown together here).
// Canvas recipe: a 1080×1350 frame with layout "none" and clip on, everything placed by x/y so the
// hero can bleed off the edge and one element can overlap another. Checked through the real AgentExecutor.

ink = '#2b1d14'; cream = '#f6efe4'; clay = '#c8553d'; sand = '#e9dcc6';
setVariable('color/ink', ink); setVariable('color/cream', cream); setVariable('color/accent', clay);
at = findEmptySpace(2240, 1350);

// ── Post 1 · launch: headline top-left, product huge and cropped at the right edge, a tilted price sticker overlapping it.
p1 = insert(null, { type: 'frame', name: '01 Launch — Es Kopi Gula Aren', x: at.x, y: at.y, width: 1080, height: 1350, clip: true, fills: [cream] });
insert(p1, { type: 'text', name: 'Headline', text: 'Manisnya pas,\ndinginnya lama.', x: 72, y: 96, width: 936, textSizing: 'auto-height', fontSize: 104, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, fills: [ink] });
insert(p1, { type: 'text', name: 'Details', text: 'Es Kopi Gula Aren\nMulai 1 Desember', x: 72, y: 360, width: 520, textSizing: 'auto-height', fontSize: 32, lineHeight: 1.35, fills: [ink] });
// The hero: a glass drawn as flat shapes, 760px tall, cropped by the right edge.
svg(`<svg viewBox="0 0 520 760">
  <path id="glass" d="M40 40h440l-48 680a40 40 0 0 1-40 36H128a40 40 0 0 1-40-36z" fill="#ffffff" opacity="0.55"/>
  <path id="coffee" d="M70 300h380l-36 420a24 24 0 0 1-24 22H130a24 24 0 0 1-24-22z" fill="#8a5a3b"/>
  <path id="milk" d="M70 300h380l-6 70c-60 30-140-10-190 18s-120 20-178-8z" fill="#e9d3b4"/>
  <rect id="ice-1" x="150" y="190" width="110" height="110" rx="18" fill="#ffffff" opacity="0.8"/>
  <rect id="ice-2" x="270" y="220" width="96" height="96" rx="16" fill="#ffffff" opacity="0.7"/>
  <path id="straw" d="M330 0h36l-40 330h-36z" fill="${clay}"/>
</svg>`, p1, { x: 560, y: 470, width: 600, name: 'Hero glass' });
update('Hero glass', { absolute: true }); // the crop at the edge is intended: tells the checker it is a bleed
// One overlap with a tilt: a sticker crossing the glass (rotation lives inside the SVG).
// Centred text needs a box: textSizing 'fixed' + width + height (auto-width text ignores width and textAlign).
svg(`<svg viewBox="0 0 300 300"><g transform="rotate(-10 150 150)">
  <circle id="sticker" cx="150" cy="150" r="128" fill="${clay}"/>
  <circle id="ring" cx="150" cy="150" r="108" fill="none" stroke="${cream}" stroke-width="3"/></g></svg>`, p1, { x: 470, y: 760, width: 300, name: 'Price sticker' });
insert(p1, { type: 'text', name: 'Price', text: '18K', x: 470, y: 856, width: 300, height: 110, textSizing: 'fixed', textAlign: 'center', fontSize: 92, fontWeight: 800, letterSpacing: -2, fills: [cream] });
insert(p1, { type: 'text', name: 'Logo', text: 'senja.kopi', x: 72, y: 1230, fontSize: 28, fontWeight: 700, fills: [ink] });

// ── Post 2 · carousel slide 1 (hook): one giant numeral cropped at the bottom, the hook in the reader's words, a swipe cue.
p2 = insert(null, { type: 'frame', name: '02 Carousel 1/5 — Hook', x: at.x + 1160, y: at.y, width: 1080, height: 1350, clip: true, fills: [ink] });
insert(p2, { type: 'text', name: 'Numeral', text: '3', absolute: true, x: 430, y: 520, fontSize: 1100, fontWeight: 800, lineHeight: 0.9, letterSpacing: -40, fills: [clay] });
insert(p2, { type: 'text', name: 'Hook', text: 'Kopi di rumah\nselalu pahit?', x: 72, y: 96, width: 860, textSizing: 'auto-height', fontSize: 116, fontWeight: 800, lineHeight: 1.0, letterSpacing: -3, fills: [cream] });
insert(p2, { type: 'text', name: 'Promise', text: '3 kesalahan kecil yang\nbikin rasanya rusak.', x: 72, y: 380, width: 640, textSizing: 'auto-height', fontSize: 34, lineHeight: 1.35, fills: [sand] });
insert(p2, { type: 'text', name: 'Swipe cue', text: '1/5 · geser →', x: 72, y: 1230, fontSize: 28, fontWeight: 600, fills: [sand] });
screenshot(p1, { scale: 0.4 });
screenshot(p2, { scale: 0.4 });
