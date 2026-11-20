// Example ArchaDev `execute` calls: a minimalist landing page on the canvas.
// Each CALL block below is ONE execute call (the archadev MCP tool). Run them in order; read the
// screenshot and "Issues" in each reply before the next call. Globals (no const/let) persist
// between calls. Same brand as landing-minimal.html.

// ---- CALL 1: tokens + skeleton (the person sees the plan at once) --------------------------
// The empty sections report "layout/collapsed" in Issues until they are filled; that is expected here.
setVariable('color/bg', '#fbfaf8');
setVariable('color/surface', '#f3f1ed');
setVariable('color/text', '#171614');
setVariable('color/muted', '#6b6760');
setVariable('color/border', '#e4e0d9');
setVariable('color/accent', '#0f766e');
setVariable('color/accent-soft', '#e3f1ef');
setVariable('color/raised', '#ffffff');
setVariable('radius/md', 12);
C = { bg: '#fbfaf8', surface: '#f3f1ed', raised: '#ffffff', text: '#171614', muted: '#6b6760', border: '#e4e0d9', accent: '#0f766e', accentSoft: '#e3f1ef' };
// Depth (Rule 3): two-layer shadows tinted with the text hue. Plane 1 = raised, plane 2 = floating.
SHADOW_1 = [{ type: 'drop-shadow', color: '#1716140f', x: 0, y: 1, blur: 2 }, { type: 'drop-shadow', color: '#1716140d', x: 0, y: 4, blur: 12 }];
SHADOW_2 = [{ type: 'drop-shadow', color: '#1716140f', x: 0, y: 2, blur: 4 }, { type: 'drop-shadow', color: '#1716142e', x: 0, y: 24, blur: 48 }];
SERIF = 'Instrument Serif'; SANS = 'Inter';
spot = findEmptySpace(1440, 2400);
page = insert(null, {
  type: 'frame', name: 'Landing / Desktop', x: spot.x, y: spot.y, width: 1440,
  sizing: { horizontal: 'fixed', vertical: 'hug' }, layout: 'column', fills: [C.bg],
  children: ['Nav', 'Hero', 'Logos', 'Features', 'Pricing', 'CTA', 'Footer'].map((n) => ({
    type: 'frame', name: n, layout: 'column', align: 'center', sizing: { horizontal: 'fill', vertical: 'hug' },
  })),
});
// Then, as a separate MCP call: say { text: 'Tokens and skeleton placed; building nav + hero next' }

// ---- CALL 2: nav + hero (one section-sized call) --------------------------------------------
update('Nav', { padding: [0, 140], height: 68, sizing: { horizontal: 'fill', vertical: 'fixed' },
  layout: 'row', justify: 'space-between', align: 'center', strokes: [{ color: C.border, width: 1, align: 'inside' }] });
insert('Nav', { type: 'text', name: 'Logo', text: 'Arunika', fontFamily: SANS, fontSize: 17, fontWeight: 600, fills: [C.text] });
links = insert('Nav', { type: 'frame', name: 'Links', layout: 'row', gap: 32, sizing: 'hug' });
for (const l of ['Fitur', 'Cara kerja', 'Harga'])
  insert(links, { type: 'text', name: `Link ${l}`, text: l, fontFamily: SANS, fontSize: 15, fills: [C.muted] });
navBtn = insert('Nav', { type: 'frame', name: 'Nav button', layout: 'row', align: 'center', justify: 'center',
  padding: [10, 18], cornerRadius: 999, fills: [C.accent], sizing: 'hug',
  children: [{ type: 'text', name: 'Label', text: 'Coba gratis', fontFamily: SANS, fontSize: 15, fontWeight: 500, fills: ['#ffffff'] }] });
makeComponent(navBtn, 'Primary pill button: accent fill, white 15/500 label');

update('Hero', { padding: [96, 140, 80, 140], layout: 'row', gap: 64, align: 'center' });
copyCol = insert('Hero', { type: 'frame', name: 'Hero copy', layout: 'column', gap: 24, sizing: { horizontal: 'fill', vertical: 'hug' } });
// No eyebrow above the headline (Rule 1): who it is for goes into the lead instead.
insert(copyCol, { type: 'text', name: 'Headline', text: 'Tutup buku tiap malam, tanpa mencatat.', fontFamily: SERIF, fontSize: 84, lineHeight: 1.05, letterSpacing: -1.5, fills: [C.text], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(copyCol, { type: 'text', name: 'Lead', text: 'Untuk toko dan UMKM: Arunika membaca transaksi kasir dan mutasi rekening Anda, lalu menyusun laba rugi, stok dan kas secara otomatis.', fontFamily: SANS, fontSize: 20, lineHeight: 1.6, fills: [C.muted], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
actions = insert(copyCol, { type: 'frame', name: 'Actions', layout: 'row', gap: 12, sizing: 'hug' });
cta = instance(navBtn, actions, { name: 'Primary CTA' });
update(children(cta)[0].id, { text: 'Mulai 30 hari gratis' });
icon('arrow-right', cta, { size: 18, color: '#ffffff' });
update(cta, { gap: 8 });
// Hero visual as a stage (Rule 4): tinted backdrop (plane 0) -> raised ledger (plane 1) -> floating notice (plane 2).
stage = insert('Hero', { type: 'frame', name: 'Stage', layout: 'column', padding: [40, 0, 64, 40], cornerRadius: 28,
  fills: [C.accentSoft], sizing: { horizontal: 'fill', vertical: 'hug' } });
ledger = insert(stage, { type: 'frame', name: 'Ledger card', layout: 'column', gap: 10, padding: 28, cornerRadius: 20,
  fills: [C.raised], strokes: [{ color: C.border, width: 1, align: 'inside' }], effects: SHADOW_1, sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(ledger, { type: 'text', name: 'Card label', text: 'Kas masuk hari ini · Toko Sumber Rejeki', fontFamily: SANS, fontSize: 14, fills: [C.muted] });
insert(ledger, { type: 'text', name: 'Total', text: 'Rp 8.420.500', fontFamily: SERIF, fontSize: 56, fills: [C.text] });
// Strokes go round the whole box, so a divider line between rows is a 1px rect.
for (const [k, v] of [['QRIS · 64 transaksi', '+ Rp 5.112.000'], ['Tunai · 41 transaksi', '+ Rp 3.308.500'], ['Belanja stok · CV Sinar', '− Rp 2.150.000']]) {
  insert(ledger, { type: 'rect', name: 'Divider', height: 1, sizing: { horizontal: 'fill', vertical: 'fixed' }, fills: [C.border] });
  insert(ledger, { type: 'frame', name: `Row ${k}`, layout: 'row', justify: 'space-between', padding: [6, 0],
    sizing: { horizontal: 'fill', vertical: 'hug' },
    children: [
      { type: 'text', name: 'Item', text: k, fontFamily: SANS, fontSize: 15, fills: [C.text] },
      { type: 'text', name: 'Amount', text: v, fontFamily: SANS, fontSize: 15, fontWeight: 500, fills: [v.startsWith('+') ? C.accent : C.text] },
    ] });
}
// Plane 2: absolute, so it overlaps the ledger's bottom-left corner instead of joining the column.
// Keep it inside the stage: frames clip their children by default (or set clip: false on the stage).
notice = insert(stage, { type: 'frame', name: 'Stock notice', absolute: true, x: 0, y: 0, layout: 'row', gap: 12, align: 'center',
  padding: [14, 18], cornerRadius: 16, fills: [C.raised], strokes: [{ color: C.border, width: 1, align: 'inside' }], effects: SHADOW_2, sizing: 'hug',
  children: [{ type: 'frame', name: 'Notice text', layout: 'column', gap: 2, sizing: 'hug', children: [
    { type: 'text', name: 'Title', text: 'Stok menipis', fontFamily: SANS, fontSize: 14, fontWeight: 600, fills: [C.text] },
    { type: 'text', name: 'Detail', text: 'Gula pasir 1 kg · sisa 6', fontFamily: SANS, fontSize: 14, fills: [C.muted] },
  ] }] });
icon('package', notice, { size: 18, color: '#b45309' });
move(children(notice)[1].id, notice, 0);
update(notice, { y: get(stage).height - 88 });   // pin near the stage's bottom edge once its height is known
screenshot(page, { scale: 0.5 });

// ---- CALL 3+: Logos, Features (bento: one big accent-soft stat tile + three raised tiles with SHADOW_1),
// Steps on a C.surface band, Pricing on a C.surface band (2 raised plans; the pro plan gets a 2px accent
// stroke and SHADOW_2), CTA, Footer. No section starts with an eyebrow. One section per call, each ending with
// screenshot(). Reuse the button component with instance(); icons with icon(name, parent, {...}).
// Then build "Landing / Mobile" (390 wide, padding 20) from the same tokens and components.
