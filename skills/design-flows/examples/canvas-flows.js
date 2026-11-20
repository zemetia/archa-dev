// Example ArchaDev `execute` calls: a page map and a swimlane drawn on the canvas with real
// connector nodes (they stick to the boxes when anyone moves them). Each CALL is ONE execute call.
// Connectors go on the page (parent null), AFTER the nodes they join; never set their x/y/size.

// ---- CALL 1: page map (sitemap) -------------------------------------------------------------
F = { ink: '#171614', muted: '#6b6760', line: '#9a958c', box: '#ffffff', border: '#d9d3c7', key: '#e3f1ef', keyBorder: '#0f766e', board: '#f7f4ee' };
// A page box: number + name + one-line purpose. Built once, reused with instance() + text overrides.
pageBox = (parent, id, name, note, x, y, key) => insert(parent, {
  type: 'frame', name: `${id} ${name}`, x, y, width: 220, layout: 'column', gap: 4, padding: [14, 16], cornerRadius: 10,
  sizing: { horizontal: 'fixed', vertical: 'hug' }, fills: [key ? F.key : F.box],
  strokes: [{ color: key ? F.keyBorder : F.border, width: key ? 2 : 1, align: 'inside' }], children: [
    { type: 'text', name: 'ID', text: id, fontFamily: 'Inter', fontSize: 12, fontWeight: 600, fills: [key ? F.keyBorder : F.muted] },
    { type: 'text', name: 'Name', text: name, fontFamily: 'Inter', fontSize: 17, fontWeight: 600, fills: [F.ink] },
    ...(note ? [{ type: 'text', name: 'Purpose', text: note, fontFamily: 'Inter', fontSize: 12, lineHeight: 1.4, fills: [F.muted], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } }] : []),
  ] });
at = findEmptySpace(1600, 760);
board = insert(null, { type: 'frame', name: 'Page map / Arunika', x: at.x, y: at.y, width: 1600, height: 760, fills: [F.board], cornerRadius: 16 });
insert(board, { type: 'text', name: 'Board title', x: 48, y: 36, text: 'Page map: Arunika (situs + app)', fontFamily: 'Inter', fontSize: 24, fontWeight: 600, fills: [F.ink] });
P = {};
P.home = pageBox(board, '0', 'Beranda', 'Janji utama, bukti, CTA coba gratis', 690, 110, true);
const L2 = [['1.0', 'Fitur', 'Kas, stok, laporan pajak'], ['2.0', 'Harga', 'Warung gratis, Toko Rp 149rb'], ['3.0', 'Cerita', 'Studi kasus pelanggan'], ['4.0', 'Bantuan', 'Panduan, FAQ, kontak'], ['5.0', 'Daftar', 'Akun + OTP WhatsApp']];
L2.forEach(([id, n, d], i) => { P[id] = pageBox(board, id, n, d, 60 + i * 300, 330, id === '5.0'); });
[['1.1', 'Kas & bank', '1.0', 0], ['1.2', 'Stok', '1.0', 1], ['4.1', 'Panduan mulai', '4.0', 0], ['4.2', 'FAQ', '4.0', 1], ['App', 'Dasbor', '5.0', 0]]
  .forEach(([id, n, parentId, k]) => {
    const only = id === 'App';                    // a single child sits right under its parent
    P[id] = pageBox(board, id, n, '', get(P[parentId]).x + (only ? 0 : -40 + k * 160), 560, only);
  });
// Children of one parent sit side by side in narrower boxes (150 wide, 10 apart).
for (const id of ['1.1', '1.2', '4.1', '4.2']) update(P[id], { width: 150 });
screenshot(board, { scale: 0.5 });

// ---- CALL 2: connectors for the page map (elbow lines with arrows) -----------------------------
link = (a, b, opts = {}) => insert(null, { type: 'connector', name: `${get(a).name} → ${get(b).name}`,
  start: { nodeId: a, side: 'bottom' }, end: { nodeId: b, side: 'top' }, routing: 'elbow', cornerRadius: 8,
  endCap: 'arrow', strokes: [{ color: F.line, width: 1.5 }], ...opts });
for (const id of ['1.0', '2.0', '3.0', '4.0', '5.0']) link(P.home, P[id]);
for (const [p, c] of [['1.0', '1.1'], ['1.0', '1.2'], ['4.0', '4.1'], ['4.0', '4.2'], ['5.0', 'App']]) link(P[p], P[c]);
screenshot(board, { scale: 0.5 });

// ---- CALL 3: swimlane (one band per actor, steps as boxes, connectors across lanes) ------------
at2 = findEmptySpace(1800, 620);
lanes = insert(null, { type: 'frame', name: 'Swimlane / Nota supplier', x: at2.x, y: at2.y, width: 1800, height: 620, fills: [F.board], cornerRadius: 16 });
LANES = [['Pemilik toko', '#fdf2f8'], ['Arunika (otomatis)', '#ecfdf5'], ['Admin keuangan', '#fff7ed']];
LANES.forEach(([n, c], i) => {
  insert(lanes, { type: 'rect', name: `Lane ${n}`, x: 0, y: 20 + i * 200, width: 1800, height: 190, fills: [c] });
  insert(lanes, { type: 'text', name: `Lane label ${n}`, x: 24, y: 32 + i * 200, text: n, fontFamily: 'Inter', fontSize: 14, fontWeight: 600, fills: [F.muted] });
});
step = (lane, col, text, auto) => insert(lanes, { type: 'frame', name: text, x: 220 + col * 270, y: 70 + lane * 200, width: 210,
  layout: 'row', align: 'center', padding: [16, 16], cornerRadius: auto ? 999 : 8, sizing: { horizontal: 'fixed', vertical: 'hug' },
  fills: ['#ffffff'], strokes: [{ color: auto ? F.keyBorder : F.border, width: 1.5, align: 'inside' }],
  children: [{ type: 'text', name: 'Label', text, fontFamily: 'Inter', fontSize: 14, lineHeight: 1.35, fills: [F.ink], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } }] });
s1 = step(0, 0, 'Foto nota supplier');
s2 = step(1, 1, 'Baca nota (OCR) + cocokkan stok', true);
s3 = step(1, 2, 'Buat tagihan & jatuh tempo', true);
s4 = step(0, 3, 'Setujui tagihan?');
s5 = step(2, 4, 'Bayar lewat m-banking');
s6 = step(1, 5, 'Tandai lunas saat mutasi masuk', true);   // its own column, so no line crosses it
flow = (a, b, sa, sb, label) => insert(null, { type: 'connector', name: label ?? `${get(a).name} → ${get(b).name}`,
  start: { nodeId: a, side: sa }, end: { nodeId: b, side: sb }, routing: 'elbow', cornerRadius: 8, endCap: 'arrow', strokes: [{ color: F.ink, width: 1.5 }] });
flow(s1, s2, 'right', 'left'); flow(s2, s3, 'right', 'left'); flow(s3, s4, 'right', 'left');
flow(s4, s5, 'right', 'top', 'ya → bayar'); flow(s5, s6, 'right', 'bottom');
// Connectors carry no text: label a decision exit with a small text node next to the line.
insert(lanes, { type: 'text', name: 'Label ya', x: get(s4).x + 226, y: get(s4).y - 6, text: 'ya', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, fills: [F.keyBorder] });
screenshot(lanes, { scale: 0.5 });
