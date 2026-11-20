// Example ArchaDev `execute` calls: a deck on the canvas. Every slide is a top-level 1920×1080
// frame in one row (gap 120), named "01 Cover", "02 Problem"…, so the Slides panel shows the deck
// in order and each frame exports to PDF/PNG. Each CALL is ONE execute call.

// ---- CALL 1: tokens, a reusable slide header, cover + big-number slide -------------------------
setVariable('color/paper', '#f7f4ee');
setVariable('color/ink', '#171614');
setVariable('color/muted', '#6b6760');
setVariable('color/accent', '#0f766e');
setVariable('color/dark', '#12201e');
K = { paper: '#f7f4ee', ink: '#171614', muted: '#6b6760', rule: '#ddd6ca', accent: '#0f766e', dark: '#12201e', cream: '#eef6f4' };
S = { w: 1920, h: 1080, px: 120, gap: 120 };
origin = findEmptySpace(S.w * 7 + S.gap * 6, S.h);
slideAt = (i) => ({ x: origin.x + i * (S.w + S.gap), y: origin.y });   // persists for later calls

// The motif header (dot + label + rule) is a component, so every slide repeats it identically.
cover = insert(null, { type: 'frame', name: '01 Cover', ...slideAt(0), width: S.w, height: S.h, layout: 'column',
  justify: 'end', gap: 40, padding: [96, S.px], fills: [K.dark], clip: true });
motif = insert(cover, { type: 'frame', name: 'Motif', absolute: true, x: S.px, y: 56, layout: 'row', gap: 14, align: 'center', sizing: 'hug', children: [
  { type: 'ellipse', name: 'Dot', width: 12, height: 12, fills: [K.accent] },
  { type: 'text', name: 'Label', text: 'ARUNIKA · SEED 2026', fontFamily: 'Inter', fontSize: 20, letterSpacing: 1.2, fills: ['#8fb3ad'] },
  { type: 'rect', name: 'Rule', width: 80, height: 1, fills: ['#2c4440'] },
] });
MOTIF = makeComponent(motif, 'Slide header: accent dot, uppercase section label, short rule');
insert(cover, { type: 'text', name: 'Title', text: 'Pembukuan toko yang selesai sendiri.', fontFamily: 'Instrument Serif',
  fontSize: 168, lineHeight: 0.92, letterSpacing: -3, fills: [K.cream], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(cover, { type: 'text', name: 'Byline', text: 'Dimas Aryo, CEO · Jakarta, November 2026', fontFamily: 'Inter', fontSize: 32, fills: ['#a9c7c1'] });

s2 = insert(null, { type: 'frame', name: '02 Problem', ...slideAt(1), width: S.w, height: S.h, layout: 'column',
  gap: 40, padding: [136, S.px, 96, S.px], fills: [K.paper], clip: true });
m2 = instance(MOTIF, s2, { name: 'Motif' });
update(m2, { absolute: true, x: S.px, y: 56 });
update(children(m2)[1].id, { text: 'MASALAH', fills: [K.muted] });
update(children(m2)[2].id, { fills: [K.rule] });
insert(s2, { type: 'text', name: 'Action title', text: '64 juta UMKM masih mencatat di buku tulis, dan baru tahu rugi di akhir bulan.',
  fontFamily: 'Instrument Serif', fontSize: 72, lineHeight: 1.05, fills: [K.ink], textSizing: 'auto-height', width: 1400 });
row = insert(s2, { type: 'frame', name: 'Big number row', layout: 'row', gap: 96, align: 'end', sizing: { horizontal: 'fill', vertical: 'fill' } });
insert(row, { type: 'text', name: 'Number', text: '1,5 jam', fontFamily: 'Instrument Serif', fontSize: 320, lineHeight: 0.8, letterSpacing: -10, fills: [K.accent] });
insert(row, { type: 'text', name: 'Explain', text: 'waktu rata-rata pemilik toko untuk tutup buku setiap malam: menyalin nota, menghitung kas, mencocokkan stok.',
  fontFamily: 'Inter', fontSize: 34, lineHeight: 1.4, fills: [K.muted], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(s2, { type: 'text', name: 'Source', text: 'Sumber: survei Arunika ke 312 toko di 9 kota, Agustus 2026.', fontFamily: 'Inter', fontSize: 18, fills: [K.muted] });
screenshot(s2, { scale: 0.35 });

// Next calls: one slide each (split, chart, quote, comparison, ask), reusing MOTIF through instance().
// Charts on the canvas: bars as rects in a row frame (align: 'end'), the highlighted bar in K.accent.
