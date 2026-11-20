// Example ArchaDev `execute` calls: lay out PDF pages on the canvas before writing the HTML.
// A4 at 96 dpi = 794 × 1123 px (Letter = 816 × 1056). One top-level frame per page, in a row,
// named "01 Cover", "02 Problem"…, so the Slides panel and PDF export show them in order.
// Each CALL is ONE execute call.

// ---- CALL 1: tokens + cover page ------------------------------------------------------------
setVariable('color/paper', '#fbf8f2');
setVariable('color/ink', '#1b1a17');
setVariable('color/muted', '#6f6a61');
setVariable('color/brand', '#7c2d12');
setVariable('color/brand-soft', '#f3e3d6');
P = { paper: '#fbf8f2', ink: '#1b1a17', muted: '#6f6a61', brand: '#7c2d12', soft: '#f3e3d6', cream: '#fbf3ea' };
A4 = { w: 794, h: 1123, m: 76 };            // 20 mm margins ≈ 76 px
at = findEmptySpace(A4.w * 4 + 80 * 3, A4.h);
cover = insert(null, { type: 'frame', name: '01 Cover', x: at.x, y: at.y, width: A4.w, height: A4.h,
  layout: 'column', justify: 'end', padding: A4.m, gap: 48, clip: true, fills: [P.brand] });
insert(cover, { type: 'ellipse', name: 'Mark', absolute: true, x: 420, y: -110, width: 680, height: 680,
  fills: [], strokes: [{ color: '#ffffff', width: 84, align: 'inside' }], opacity: 0.07 });
insert(cover, { type: 'text', name: 'Kicker', absolute: true, x: A4.m, y: A4.m, text: 'NARA STUDIO · PROPOSAL NO. 2611-04',
  fontFamily: 'Inter', fontSize: 10, fontWeight: 600, letterSpacing: 1.2, fills: ['#f3cdb3'] });
insert(cover, { type: 'text', name: 'Title', text: 'Identitas & website untuk Kopi Rana', fontFamily: 'Fraunces',
  fontSize: 86, lineHeight: 0.95, letterSpacing: -1.5, fills: [P.cream], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
meta = insert(cover, { type: 'frame', name: 'Meta', layout: 'row', gap: 24, padding: [20, 0, 0, 0], sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(meta, { type: 'rect', name: 'Meta rule', absolute: true, x: 0, y: 0, width: A4.w - A4.m * 2, height: 1, fills: [P.cream], opacity: 0.35 });
for (const [k, v] of [['UNTUK', 'Rana Pratiwi, Pemilik'], ['TANGGAL', '20 November 2026'], ['BERLAKU HINGGA', '20 Desember 2026']])
  insert(meta, { type: 'frame', name: `Meta ${k}`, layout: 'column', gap: 6, sizing: { horizontal: 'fill', vertical: 'hug' }, children: [
    { type: 'text', name: 'Key', text: k, fontFamily: 'Inter', fontSize: 9, fontWeight: 600, letterSpacing: 1, fills: ['#f3cdb3'] },
    { type: 'text', name: 'Value', text: v, fontFamily: 'Inter', fontSize: 12, fills: [P.cream] },
  ] });
screenshot(cover, { scale: 0.5 });

// ---- CALL 2: an inner page with the section-number grid ------------------------------------
pg = insert(null, { type: 'frame', name: '02 Problem', x: at.x + A4.w + 80, y: at.y, width: A4.w, height: A4.h,
  layout: 'column', gap: 32, padding: [84, A4.m, 76, A4.m], fills: [P.paper] });
head = insert(pg, { type: 'frame', name: 'Opener', layout: 'row', gap: 40, sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(head, { type: 'text', name: 'Number', text: '01', fontFamily: 'Fraunces', fontSize: 160, lineHeight: 0.8, fills: [P.soft] });
col = insert(head, { type: 'frame', name: 'Heading', layout: 'column', gap: 12, padding: [20, 0, 0, 0], sizing: { horizontal: 'fill', vertical: 'hug' } });
insert(col, { type: 'text', name: 'Label', text: 'MASALAH', fontFamily: 'Inter', fontSize: 10, fontWeight: 600, letterSpacing: 1.2, fills: [P.muted] });
insert(col, { type: 'text', name: 'H2', text: 'Kopinya dikenal di Malang, tapi tidak bisa ditemukan di internet.', fontFamily: 'Fraunces',
  fontSize: 34, lineHeight: 1.1, fills: [P.ink], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } });
stats = insert(pg, { type: 'frame', name: 'Stats', layout: 'row', gap: 24, sizing: { horizontal: 'fill', vertical: 'hug' } });
for (const [n, l] of [['1.800', 'cup terjual per minggu'], ['70%', 'pelanggan baru dari rekomendasi'], ['0', 'halaman saat orang mencari “kopi rana”']])
  insert(stats, { type: 'frame', name: `Stat ${n}`, layout: 'column', gap: 6, sizing: { horizontal: 'fill', vertical: 'hug' }, children: [
    { type: 'text', name: 'Value', text: n, fontFamily: 'Fraunces', fontSize: 46, fills: [P.brand] },
    { type: 'text', name: 'Caption', text: l, fontFamily: 'Inter', fontSize: 11, fills: [P.muted], textSizing: 'auto-height', sizing: { horizontal: 'fill', vertical: 'hug' } },
  ] });
insert(pg, { type: 'text', name: 'Folio', absolute: true, x: A4.m, y: A4.h - 48, text: 'Nara Studio · Proposal Kopi Rana    2 / 4',
  fontFamily: 'Inter', fontSize: 9, fills: [P.muted] });
screenshot(pg, { scale: 0.5 });

// Next: one call per remaining page. Then the person exports each page frame as PDF from the
// Design panel, or you write the print HTML (see proposal.html) from this layout.
