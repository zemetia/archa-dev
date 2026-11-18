import type { ReactNode } from 'react';

/*
 * The small Markdown subset agents write in chat replies: headings, bullet / numbered lists,
 * code fences, **bold**, *italic* and `code`. Builds React elements — never raw HTML.
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
      i++;
      blocks.push(<pre key={blocks.length} className="my-1 overflow-x-auto rounded-lg bg-panel-2 p-2 font-mono text-[11px] leading-relaxed text-fg-muted">{code.join('\n')}</pre>);
      continue;
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
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*(```|#{1,4}\s|[-*•]\s|\d+[.)]\s)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={blocks.length} className="my-1 first:mt-0">{inline(para.join('\n'))}</p>);
  }
  return <>{blocks}</>;
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
