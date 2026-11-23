// One execute call: a feature tile with a custom spot illustration and a small bar chart, both as
// editable vector layers; every word is a text node. Checked through the real AgentExecutor.

tile = insert(null, { type: 'frame', name: 'Insights tile', width: 360, layout: 'column', gap: 16, padding: 24, cornerRadius: 20,
  sizing: { horizontal: 'fixed', vertical: 'hug' }, fills: ['#f8fafc'], strokes: [{ color: '#e2e8f0', width: 1 }] });

// Spot illustration: flat shapes, palette colours, ids become layer names.
svg(`<svg viewBox="0 0 160 96">
  <ellipse id="ground" cx="80" cy="84" rx="64" ry="8" fill="#e2e8f0"/>
  <rect id="card" x="36" y="16" width="88" height="60" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <circle id="dot" cx="58" cy="38" r="8" fill="#7c3aed"/>
  <path id="line-1" d="M74 34h34" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
  <path id="line-2" d="M74 46h22" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
  <path id="spark" d="M128 10l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#f59e0b"/>
</svg>`, tile, { width: 160, name: 'Illustration' });

insert(tile, { type: 'text', name: 'Title', text: 'Weekly insights', fontSize: 18, fontWeight: 600, fills: ['#0f172a'] });

// Chart: coordinates computed from the values; labels stay text nodes.
values = [12, 18, 9, 22, 16];
max = Math.max(...values);
bars = values.map((v, i) => `<rect id="bar-${i + 1}" x="${i * 40 + 4}" y="${80 - (v / max) * 72}" width="28" height="${(v / max) * 72}" rx="6" fill="${i === 3 ? '#7c3aed' : '#ddd6fe'}"/>`).join('');
svg(`<svg viewBox="0 0 200 80">${bars}</svg>`, tile, { width: 312, name: 'Bar chart' });

insert(tile, { type: 'text', name: 'Caption', text: 'Thursday was the busiest day', fontSize: 13, fills: ['#64748b'] });
