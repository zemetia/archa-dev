import type { ReactNode } from 'react';
import { extractSvg, isSvgMarkup } from '@archa/formats';
import { SvgBlock } from './SvgBlock';

/*
 * The small Markdown subset agents write in chat replies: headings, bullet / numbered lists,
 * code fences, **bold**, *italic* and `code`. Builds React elements — never raw HTML. Complete SVG
 * (a ```svg fence or bare <svg>…</svg> lines) shows as the drawing, not as code.
 */

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      const closed = i < lines.length;
      i++;
      const svg = closed ? svgOf(code.join('\n')) : null;
      if (svg) { blocks.push(<SvgBlock key={blocks.length} code={svg} />); continue; }
      blocks.push(<pre key={blocks.length} className="my-1 overflow-x-auto rounded-lg bg-panel-2 p-2 font-mono text-[11px] leading-relaxed text-fg-muted">{code.join('\n')}</pre>);
      continue;
    }
    if (/^\s*(<\?xml|<svg[\s>])/i.test(line)) {
      const start = i;
      while (i < lines.length && !/<\/svg>/i.test(lines[i]!)) i++;
      if (i < lines.length) {
        const svg = svgOf(lines.slice(start, ++i).join('\n'));
        if (svg) { blocks.push(<SvgBlock key={blocks.length} code={svg} />); continue; }
      }
      i = start;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<div key={blocks.length} className="mb-0.5 mt-1.5 text-[12.5px] font-semibold text-fg">{inline(heading[2]!)}</div>);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const items: Array<{ depth: number; ordered: boolean; text: string }> = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) {
        const m = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(lines[i]!)!;
        items.push({ depth: Math.min(2, Math.floor(m[1]!.length / 2)), ordered: /\d/.test(m[2]!), text: m[3]! });
        i++;
      }
      blocks.push(
        <ul key={blocks.length} className="my-1 space-y-0.5">
          {items.map((it, n) => (
            <li key={n} className="flex gap-1.5" style={{ paddingLeft: it.depth * 12 }}>
              <span className="shrink-0 text-fg-subtle">{it.ordered ? `${items.slice(0, n + 1).filter((x) => x.ordered && x.depth === it.depth).length}.` : '•'}</span>
              <span className="min-w-0">{inline(it.text)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    if (!line.trim()) { i++; continue; }
    // The first line always belongs to the paragraph (an unfinished <svg> line would otherwise loop forever).
    const para: string[] = [lines[i++]!];
    while (i < lines.length && lines[i]!.trim() && !/^\s*(```|#{1,4}\s|[-*•]\s|\d+[.)]\s|<svg[\s>]|<\?xml)/i.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={blocks.length} className="my-1 first:mt-0">{inline(para.join('\n'))}</p>);
  }
  return <>{blocks}</>;
}

/** The SVG in a block when the block is just SVG markup (a finished one), else null. */
function svgOf(text: string): string | null {
  const t = text.trim();
  return isSvgMarkup(t) ? extractSvg(t) : null;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) out.push(<code key={out.length} className="rounded bg-panel-2 px-1 py-px font-mono text-[11px] text-accent-fg">{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={out.length} className="font-semibold text-fg">{t.slice(2, -2)}</strong>);
    else out.push(<em key={out.length}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
