// Example: the deck.html pitch deck as an EDITABLE PowerPoint file, built with pptxgenjs.
//   npm i pptxgenjs   (in a scratch folder)   then   node deck.mjs   → arunika-deck.pptx
// Everything sits on one grid (G) in inches, every box is checked against the safe margins
// before writing, and every slide gets speaker notes.
import pptxgen from 'pptxgenjs';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';                      // 13.333 × 7.5 in
pptx.title = 'Arunika: Pitch deck 2026';

// ---- system -------------------------------------------------------------------------------
const C = { paper: 'F7F4EE', ink: '171614', muted: '6B6760', rule: 'DDD6CA', accent: '0F766E', soft: 'DCEFEB', dark: '12201E', cream: 'EEF6F4' };
const F = { display: 'Georgia', body: 'Segoe UI' }; // safe on Windows + Mac; tell the user if you pick a non-system font
const G = { W: 13.333, H: 7.5, mx: 0.83, my: 0.66 };  // 0.83 in = the 120 px side margin of deck.html
G.cw = G.W - G.mx * 2;
const col = (from, span, cols = 12, gutter = 0.3) => {  // 12-column grid → { x, w }
  const unit = (G.cw - gutter * (cols - 1)) / cols;
  return { x: G.mx + (from - 1) * (unit + gutter), w: unit * span + gutter * (span - 1) };
};

const boxes = [];
function add(slide, kind, content, o) {           // records each box so it can be checked
  boxes.push({ slide: slide._slideNum ?? slides.length, kind, ...o });
  if (kind === 'text') slide.addText(content, { margin: 0, valign: 'top', fit: 'none', ...o });
  else slide.addShape(content, o);
}
const slides = [];
function newSlide(bg, motif, num) {
  const s = pptx.addSlide();
  slides.push(s);
  s.background = { color: bg };
  const dark = bg !== C.paper && bg !== C.soft;
  add(s, 'shape', pptx.ShapeType.ellipse, { x: G.mx, y: 0.42, w: 0.09, h: 0.09, fill: { color: dark ? C.cream : C.accent }, line: { type: 'none' } });
  add(s, 'text', motif, { x: G.mx + 0.2, y: 0.36, w: 4, h: 0.22, fontFace: F.body, fontSize: 11, charSpacing: 1, color: dark ? 'A9C7C1' : C.muted });
  if (num) add(s, 'text', num, { x: G.W - G.mx - 1, y: G.H - 0.5, w: 1, h: 0.2, fontFace: F.body, fontSize: 10, color: C.muted, align: 'right' });
  return s;
}
// Georgia/Segoe are wider than web display faces: ~36pt keeps a 70–80 character title on 2 lines.
const title = (s, text, color = C.ink, size = 34) =>
  add(s, 'text', text, { ...col(1, 11), y: 0.95, h: 1.4, fontFace: F.display, fontSize: size, color, lineSpacingMultiple: 0.95 });

// ---- 1 cover --------------------------------------------------------------------------------
let s = newSlide(C.dark, 'ARUNIKA · SEED 2026');
add(s, 'text', 'Pembukuan toko yang selesai sendiri.', { ...col(1, 10), y: 3.2, h: 2.6, fontFace: F.display, fontSize: 88, color: C.cream, lineSpacingMultiple: 0.88, valign: 'bottom' });
add(s, 'text', 'Dimas Aryo, CEO · Jakarta, November 2026', { ...col(1, 8), y: 6.15, h: 0.35, fontFace: F.body, fontSize: 16, color: 'A9C7C1' });
s.addNotes('Satu kalimat: Arunika menutup buku toko kecil secara otomatis dari data kasir dan bank.');

// ---- 2 problem: big number --------------------------------------------------------------------
s = newSlide(C.paper, 'MASALAH', '02');
title(s, '64 juta UMKM masih mencatat di buku tulis, dan baru tahu rugi di akhir bulan.');
// A big number must fit on ONE line: at 120pt Georgia each character is ~0.9 in wide.
add(s, 'text', '1,5 jam', { ...col(1, 8), y: 3.4, h: 2.3, fontFace: F.display, fontSize: 120, color: C.accent, valign: 'bottom' });
add(s, 'text', [{ text: 'waktu rata-rata pemilik toko untuk ' }, { text: 'tutup buku setiap malam', options: { bold: true, color: C.ink } }, { text: ': menyalin nota, menghitung kas, mencocokkan stok.' }],
  { ...col(9, 4), y: 4.6, h: 1.3, fontFace: F.body, fontSize: 18, color: C.muted, valign: 'bottom' });
add(s, 'text', 'Sumber: survei Arunika ke 312 toko di 9 kota, Agustus 2026.', { ...col(1, 8), y: 6.35, h: 0.25, fontFace: F.body, fontSize: 10, color: C.muted });
s.addNotes('Angka 1,5 jam dari survei kami sendiri; sebutkan metodenya kalau ditanya.');

// ---- 3 solution: split (steps left 5 cols, product card right 7 cols) -----------------------------
s = newSlide(C.paper, 'SOLUSI', '03');
title(s, 'Arunika membaca kasir dan bank, lalu menyusun laporannya sendiri.');
[['1', 'Hubungkan rekening & kasir', 'Akses baca saja, 5 menit'], ['2', 'Konfirmasi kategori yang ragu', 'Rata-rata 6 transaksi per hari'], ['3', 'Terima laporan tiap pagi', 'Lewat WhatsApp, jam 07.00']]
  .forEach(([n, h, sub], i) => {
    const y = 2.75 + i * 1.05;
    add(s, 'text', n, { x: col(1, 1).x, y, w: 0.5, h: 0.6, fontFace: F.display, fontSize: 30, color: C.accent });
    add(s, 'text', [{ text: h, options: { fontSize: 18, color: C.ink, breakLine: true } }, { text: sub, options: { fontSize: 13, color: C.muted } }],
      { x: col(1, 1).x + 0.6, y, w: col(1, 5).w - 0.6, h: 0.8, fontFace: F.body });
  });
const card = col(7, 6);
add(s, 'shape', pptx.ShapeType.roundRect, { ...card, y: 2.7, h: 3.6, rectRadius: 0.25, fill: { color: 'FFFFFF' }, line: { color: C.rule, width: 0.75 } });
add(s, 'text', 'Kas masuk kemarin · Toko Sumber Rejeki', { x: card.x + 0.4, y: 3.0, w: card.w - 0.8, h: 0.3, fontFace: F.body, fontSize: 12, color: C.muted });
add(s, 'text', 'Rp 8,42 jt', { x: card.x + 0.4, y: 3.35, w: card.w - 0.8, h: 0.9, fontFace: F.display, fontSize: 48, color: C.ink });
[['QRIS', '+ Rp 5,11 jt', C.accent], ['Tunai', '+ Rp 3,31 jt', C.accent], ['Belanja stok', '− Rp 2,15 jt', C.ink]].forEach(([k, v, c], i) => {
  const y = 4.45 + i * 0.55;
  add(s, 'shape', pptx.ShapeType.line, { x: card.x + 0.4, y, w: card.w - 0.8, h: 0, line: { color: C.rule, width: 0.75 } });
  add(s, 'text', k, { x: card.x + 0.4, y: y + 0.12, w: 3, h: 0.3, fontFace: F.body, fontSize: 14, color: C.ink });
  add(s, 'text', v, { x: card.x + card.w - 3.4, y: y + 0.12, w: 3, h: 0.3, fontFace: F.body, fontSize: 14, bold: true, color: c, align: 'right' });
});
s.addNotes('Tunjukkan bahwa pemilik hanya mengonfirmasi, tidak mengetik.');

// ---- 4 traction: native, editable chart, one bar highlighted ------------------------------------
s = newSlide(C.paper, 'TRAKSI', '04');
title(s, 'Toko berbayar tumbuh 38% per bulan sejak Mei.');
s.addChart(pptx.ChartType.bar, [{ name: 'Toko berbayar', labels: ['Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt'], values: [310, 480, 690, 1010, 1420, 1960] }], {
  ...col(1, 12), y: 2.5, h: 4.3, barDir: 'col', barGapWidthPct: 35,
  chartColors: [C.rule, C.rule, C.rule, C.rule, C.rule, C.accent], // the insight in accent, the rest neutral
  showValue: true, dataLabelFontFace: F.body, dataLabelFontSize: 14, dataLabelColor: C.ink, dataLabelPosition: 'outEnd',
  catAxisLabelFontFace: F.body, catAxisLabelFontSize: 13, catAxisLabelColor: C.muted, catAxisLineShow: true,
  valAxisHidden: true, valGridLine: { style: 'none' }, showLegend: false,
});
boxes.push({ slide: slides.length, kind: 'chart', ...col(1, 12), y: 2.5, h: 4.3 });
s.addNotes('Data dari dashboard billing per 31 Oktober.');

// ---- 5 quote ------------------------------------------------------------------------------
s = newSlide(C.soft, 'PELANGGAN', '05');
add(s, 'text', '“Dulu saya baru tahu rugi di akhir bulan. Sekarang saya tahu setiap pagi.”', { ...col(1, 11), y: 2.6, h: 3.0, fontFace: F.display, fontSize: 54, color: C.ink, valign: 'bottom', lineSpacingMultiple: 0.95 });
add(s, 'text', [{ text: 'Sri Wahyuni', options: { bold: true, color: C.ink } }, { text: ' · Toko Sumber Rejeki, Klaten · pelanggan sejak Juni' }], { ...col(1, 10), y: 5.9, h: 0.35, fontFace: F.body, fontSize: 15, color: C.muted });

// ---- 6 comparison ----------------------------------------------------------------------------
s = newSlide(C.paper, 'KENAPA KAMI', '06');
title(s, 'Aplikasi kasir mencatat penjualan. Kami menutup bukunya.');
const sides = [['APLIKASI KASIR BIASA', C.muted, ['Hanya transaksi di kasirnya sendiri', 'Mutasi bank dicocokkan manual', 'Laporan pajak diekspor ke Excel']],
  ['ARUNIKA', C.accent, ['Kasir, bank & marketplace jadi satu', 'Pencocokan otomatis, 97% akurat', 'Laporan PPh Final UMKM siap kirim']]];
sides.forEach(([h, c, items], i) => {
  const area = col(i ? 7 : 1, 6);
  if (i) add(s, 'shape', pptx.ShapeType.roundRect, { ...area, y: 2.55, h: 3.3, rectRadius: 0.2, fill: { color: 'FFFFFF' }, line: { type: 'none' } });
  add(s, 'text', h, { x: area.x + 0.35, y: 2.85, w: area.w - 0.7, h: 0.3, fontFace: F.body, fontSize: 12, bold: true, charSpacing: 1, color: c });
  items.forEach((t, k) => {
    const y = 3.35 + k * 0.7;
    add(s, 'shape', pptx.ShapeType.line, { x: area.x + 0.35, y, w: area.w - 0.7, h: 0, line: { color: C.rule, width: 0.75 } });
    add(s, 'text', t, { x: area.x + 0.35, y: y + 0.15, w: area.w - 0.7, h: 0.4, fontFace: F.body, fontSize: 17, color: C.ink });
  });
});

// ---- 7 ask ----------------------------------------------------------------------------------
s = newSlide(C.accent, 'PERMINTAAN');
add(s, 'text', 'Kami mengumpulkan Rp 12 miliar untuk 20.000 toko dalam 18 bulan.', { ...col(1, 11), y: 1.9, h: 2.6, fontFace: F.display, fontSize: 58, color: 'F1FBF9', valign: 'bottom', lineSpacingMultiple: 0.95 });
add(s, 'shape', pptx.ShapeType.line, { ...col(1, 12), y: 5.0, h: 0, line: { color: '4FA59A', width: 0.75 } });
[['45%', 'Integrasi 8 bank & 5 POS baru'], ['35%', 'Tim penjualan di 6 kota'], ['20%', 'Operasional & cadangan']].forEach(([n, t], i) => {
  const c = col(1 + i * 4, 4);
  add(s, 'text', [{ text: n, options: { fontFace: F.display, fontSize: 36, color: 'F1FBF9', breakLine: true } }, { text: t, options: { fontFace: F.body, fontSize: 14, color: 'BFE3DD' } }],
    { ...c, y: 5.25, h: 1.1 });
});
s.addNotes('Tutup dengan permintaan yang jelas; jangan tambah slide "Terima kasih".');

// ---- check: everything inside the safe area, then write ----------------------------------------
const bad = boxes.filter((b) => b.x < G.mx - 0.01 || b.x + b.w > G.W - G.mx + 0.01 || b.y < 0.3 || b.y + (b.h ?? 0) > G.H - 0.25);
if (bad.length) { console.error('Outside the safe area:', bad.map((b) => `slide ${b.slide} ${b.kind} x=${b.x.toFixed(2)} w=${b.w.toFixed(2)} y=${b.y} h=${b.h}`)); process.exit(1); }
await pptx.writeFile({ fileName: 'arunika-deck.pptx' });
console.log(`arunika-deck.pptx: ${slides.length} slides, ${boxes.length} boxes inside the safe area`);
