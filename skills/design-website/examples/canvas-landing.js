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
setVariable('radius/md', 12);
C = { bg: '#fbfaf8', surface: '#f3f1ed', text: '#171614', muted: '#6b6760', border: '#e4e0d9', accent: '#0f766e' };
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
insert(copyCol, { type: 'text', name: 'Eyebrow', text: 'PEMBUKUAN UNTUK TOKO & UMKM', fontFamily: SANS, fontSize: 13, fontWeight: 500, letterSpacing: 1, fills: [C.accent] });
insert(copyCol, { type: 'text', name: 'Headline', text: 'Tutup buku tiap malam, tanpa mencatat.', fontFamily: SERIF, fontSize: 84, lineHeight: 1.05, letterSpacing: -1.5, fills: [C.text], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(copyCol, { type: 'text', name: 'Lead', text: 'Arunika membaca transaksi kasir dan mutasi rekening Anda, lalu menyusun laba rugi, stok dan kas secara otomatis.', fontFamily: SANS, fontSize: 20, lineHeight: 1.6, fills: [C.muted], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
actions = insert(copyCol, { type: 'frame', name: 'Actions', layout: 'row', gap: 12, sizing: 'hug' });
cta = instance(navBtn, actions, { name: 'Primary CTA' });
update(children(cta)[0].id, { text: 'Mulai 30 hari gratis' });
icon('arrow-right', cta, { size: 18, color: '#ffffff' });
update(cta, { gap: 8 });
ledger = insert('Hero', { type: 'frame', name: 'Ledger card', layout: 'column', gap: 10, padding: 28, cornerRadius: 20,
  fills: [C.surface], strokes: [{ color: C.border, width: 1, align: 'inside' }], sizing: { horizontal: 'fill', vertical: 'hug' } });
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
screenshot(page, { scale: 0.5 });

// ---- CALL 3+: Logos, Features (bento: one big stat tile + three small tiles), Pricing (2 plans,
// pro plan with a 2px accent stroke), CTA band, Footer. One section per call, each ending with
// screenshot(). Reuse the button component with instance(); icons with icon(name, parent, {...}).
// Then build "Landing / Mobile" (390 wide, padding 20) from the same tokens and components.
