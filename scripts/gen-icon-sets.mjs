// Generates packages/icons/data/<set>.json from the icon packages in the workspace (all permissive licences):
// lucide (ISC), Tabler (MIT), Phosphor (MIT), Heroicons (MIT), Simple Icons (CC0 — brand logos stay trademarks of their owners).
// Run: node scripts/gen-icon-sets.mjs
// Each icon becomes ONE path string; `flags` records evenodd fills, logos also carry their brand colour and title.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const NM = 'node_modules';
const OUT = join('packages', 'icons', 'data');
const r = (v) => Math.round(Number(v) * 100) / 100;
const version = (pkg) => JSON.parse(readFileSync(join(NM, pkg, 'package.json'), 'utf8')).version;

/** One SVG element → path data. */
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const LEAD_MOVE = new RegExp(String.raw`^\s*m\s*(${NUM})[\s,]*(${NUM})[\s,]*`);

/**
 * A path's first `m` is absolute, but once paths are concatenated into one string it would turn relative.
 * `m x y …pairs` → `M x y l …pairs`: the implicit pairs after a relative moveto stay relative linetos.
 */
function absoluteStart(d) {
  const m = LEAD_MOVE.exec(d);
  if (!m) return d;
  const rest = d.slice(m[0].length);
  return `M${m[1]} ${m[2]}${/^[-+.\d]/.test(rest) ? 'l' : ''}${rest}`;
}

function toD(tag, a) {
  switch (tag) {
    case 'path': return absoluteStart(a.d);
    case 'line': return `M${r(a.x1)} ${r(a.y1)}L${r(a.x2)} ${r(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
      let d = '';
      for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${r(pts[i])} ${r(pts[i + 1])}`;
      return tag === 'polygon' ? `${d}Z` : d;
    }
    case 'circle': {
      const cx = r(a.cx ?? 0), cy = r(a.cy ?? 0), rr = r(a.r);
      return `M${r(cx - rr)} ${cy}a${rr} ${rr} 0 1 0 ${r(rr * 2)} 0a${rr} ${rr} 0 1 0 ${r(-rr * 2)} 0Z`;
    }
    case 'ellipse': {
      const cx = r(a.cx ?? 0), cy = r(a.cy ?? 0), rx = r(a.rx), ry = r(a.ry);
      return `M${r(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${r(rx * 2)} 0a${rx} ${ry} 0 1 0 ${r(-rx * 2)} 0Z`;
    }
    case 'rect': {
      const x = r(a.x ?? 0), y = r(a.y ?? 0), w = r(a.width), h = r(a.height), rx = Math.min(r(a.rx ?? a.ry ?? 0), w / 2, h / 2);
      if (!rx) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${r(x + rx)} ${y}h${r(w - 2 * rx)}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${r(h - 2 * rx)}a${rx} ${rx} 0 0 1 ${-rx} ${rx}h${r(-(w - 2 * rx))}a${rx} ${rx} 0 0 1 ${-rx} ${-rx}v${r(-(h - 2 * rx))}a${rx} ${rx} 0 0 1 ${rx} ${-rx}Z`;
    }
    default: return '';
  }
}

/** Shapes of an SVG file (regex: these packages ship flat, attribute-only SVGs). Invisible full-size rects are skipped. */
function svgShapes(svg) {
  const out = [];
  let evenodd = false;
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)\/?>/g)) {
    const a = Object.fromEntries([...m[2].matchAll(/([a-zA-Z-:]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    if (a.fill === 'none' && m[1] === 'rect') continue;
    if (a['fill-rule'] === 'evenodd') evenodd = true;
    const d = toD(m[1], a);
    if (d) out.push(d);
  }
  return { d: out.join(''), evenodd };
}

const sets = [];
function write(meta, icons) {
  const names = Object.keys(icons).sort();
  const sorted = Object.fromEntries(names.map((n) => [n, icons[n]]));
  writeFileSync(join(OUT, `${meta.id}.json`), JSON.stringify({ ...meta, icons: sorted }));
  sets.push({ ...meta, count: names.length });
  console.log(meta.id.padEnd(14), names.length);
}

mkdirSync(OUT, { recursive: true });

// lucide: the element lists inside lucide-react's ESM icon modules (evaluated as plain object literals).
{
  const dir = join(NM, 'lucide-react', 'dist', 'esm', 'icons');
  const icons = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()) {
    const m = /const __iconData = (\{[\s\S]*?\n\});/.exec(readFileSync(join(dir, f), 'utf8'));
    if (!m) continue;
    const data = Function(`return (${m[1]});`)();
    icons[data.name] = data.node.map(([tag, a]) => toD(tag, a)).join('');
  }
  write({ id: 'lucide', label: 'Lucide', family: 'Lucide', style: 'Outline', licence: 'ISC', version: version('lucide-react'), viewBox: 24, mode: 'stroke', stroke: 2 }, icons);
}

// Tabler: outline (stroke 2) and filled.
for (const [file, id, style, mode] of [['tabler-nodes-outline.json', 'tabler', 'Outline', 'stroke'], ['tabler-nodes-filled.json', 'tabler-filled', 'Filled', 'fill']]) {
  const nodes = JSON.parse(readFileSync(join(NM, '@tabler', 'icons', file), 'utf8'));
  const icons = {};
  for (const [name, els] of Object.entries(nodes)) {
    const d = els.map(([tag, a]) => toD(tag, a)).join('');
    if (d) icons[name] = d;
  }
  write({ id, label: `Tabler ${style}`, family: 'Tabler', style, licence: 'MIT', version: version('@tabler/icons'), viewBox: 24, mode, ...(mode === 'stroke' ? { stroke: 2 } : {}) }, icons);
}

// Phosphor: five weights (duotone needs two opacities, which one path cannot carry).
for (const weight of ['regular', 'thin', 'light', 'bold', 'fill']) {
  const dir = join(NM, '@phosphor-icons', 'core', 'assets', weight);
  const icons = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const name = f.replace(/\.svg$/, '').replace(new RegExp(`-${weight}$`), '');
    const { d, evenodd } = svgShapes(readFileSync(join(dir, f), 'utf8'));
    if (d) icons[name] = evenodd ? [d, 'e'] : d;
  }
  const style = weight[0].toUpperCase() + weight.slice(1);
  write({ id: weight === 'regular' ? 'ph' : `ph-${weight}`, label: `Phosphor ${style}`, family: 'Phosphor', style, licence: 'MIT', version: version('@phosphor-icons/core'), viewBox: 256, mode: 'fill' }, icons);
}

// Heroicons: outline (stroke 1.5), solid, mini (20), micro (16).
for (const [sub, id, style, box, mode] of [['24/outline', 'hero', 'Outline', 24, 'stroke'], ['24/solid', 'hero-solid', 'Solid', 24, 'fill'], ['20/solid', 'hero-mini', 'Mini', 20, 'fill'], ['16/solid', 'hero-micro', 'Micro', 16, 'fill']]) {
  const dir = join(NM, 'heroicons', ...sub.split('/'));
  const icons = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const { d, evenodd } = svgShapes(readFileSync(join(dir, f), 'utf8'));
    if (d) icons[f.replace(/\.svg$/, '')] = evenodd ? [d, 'e'] : d;
  }
  write({ id, label: `Heroicons ${style}`, family: 'Heroicons', style, licence: 'MIT', version: version('heroicons'), viewBox: box, mode, ...(mode === 'stroke' ? { stroke: 1.5 } : {}) }, icons);
}

// Simple Icons: brand logos with their brand colour.
{
  const si = require(join(process.cwd(), NM, 'simple-icons'));
  const icons = {};
  for (const v of Object.values(si)) if (v && v.slug && v.path) icons[v.slug] = [v.path, `#${v.hex}`, v.title];
  write({ id: 'logos', label: 'Brand logos', family: 'Logos', style: 'Brand', licence: 'CC0 (trademarks belong to their owners)', version: version('simple-icons'), viewBox: 24, mode: 'fill' }, icons);
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(sets.map(({ id, label, family, style, licence, version: v, viewBox, mode, stroke, count }) => ({ id, label, family, style, licence, version: v, viewBox, mode, stroke, count })), null, 1));
