/*
 * CSS declarations → Tailwind v4 utilities. Named utilities where one exists, arbitrary values
 * (`w-[320px]`) otherwise, and an arbitrary property (`[prop:value]`) as the last resort.
 * Spaces inside arbitrary values become underscores, as Tailwind expects.
 */

const arb = (v: string) => v.replace(/_/g, '\\_').replace(/\s*,\s*/g, ',').replace(/\s+/g, '_');

const KEYWORDS: Record<string, Record<string, string>> = {
  display: { flex: 'flex', block: 'block' },
  'flex-direction': { row: 'flex-row', column: 'flex-col' },
  position: { absolute: 'absolute', relative: 'relative' },
  'flex-shrink': { '0': 'shrink-0' },
  flex: { '1 1 0': 'flex-1' },
  'align-self': { stretch: 'self-stretch' },
  'align-items': { 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end' },
  'justify-content': { center: 'justify-center', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around' },
  'text-align': { center: 'text-center', right: 'text-right' },
  'white-space': { pre: 'whitespace-pre', 'pre-wrap': 'whitespace-pre-wrap' },
  overflow: { hidden: 'overflow-hidden', visible: 'overflow-visible' },
  'object-fit': { cover: 'object-cover', contain: 'object-contain', fill: 'object-fill' },
  'border-radius': { '50%': 'rounded-full' },
  'font-weight': { '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black' },
  margin: { '0': 'm-0' },
  border: { '0': 'border-0' },
  'min-width': { '0': 'min-w-0' },
  'min-height': { '0': 'min-h-0' },
};

const PREFIX: Record<string, string> = {
  left: 'left', top: 'top', width: 'w', height: 'h', gap: 'gap', 'border-radius': 'rounded',
  'background-color': 'bg', color: 'text', 'font-size': 'text', 'line-height': 'leading',
  'letter-spacing': 'tracking', opacity: 'opacity', 'box-shadow': 'shadow', rotate: 'rotate',
};

export function tailwindClasses(decls: Array<[string, string]>): string[] {
  const out: string[] = [];
  for (const [prop, value] of decls) {
    const kw = KEYWORDS[prop]?.[value];
    if (kw) { out.push(kw); continue; }
    if (prop === 'padding') { out.push(...padding(value)); continue; }
    // `text-[…]` is ambiguous between colour and size: Tailwind needs the type hint for sizes.
    if (prop === 'font-size') { out.push(`text-[length:${value}]`); continue; }
    const pre = PREFIX[prop];
    out.push(pre ? `${pre}-[${arb(value)}]` : `[${prop}:${arb(value)}]`);
  }
  return out;
}

function padding(value: string): string[] {
  const [t, r, b, l] = value.split(' ');
  if (!r) return [`p-[${t}]`];
  if (t === b && r === l) return t === r ? [`p-[${t}]`] : [`py-[${t}]`, `px-[${r}]`];
  return [[t, 'pt'], [r, 'pr'], [b, 'pb'], [l, 'pl']].filter(([v]) => v !== '0px').map(([v, p]) => `${p}-[${v}]`);
}
