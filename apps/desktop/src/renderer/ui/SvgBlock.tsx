import { useMemo, useState } from 'react';
import { Check, Code2, Copy, Shapes } from 'lucide-react';
import { importSvg, svgDataUrl } from '@archa/formats';
import { place } from '../lib/importers';
import { toast } from '../lib/store';
import { cn } from './controls';

/*
 * SVG an agent wrote in chat (a ```svg fence, raw <svg> markup, or a place_svg call): shown as the
 * drawing, with Place on canvas, Copy and the source on demand. The preview is an <img> of a data URL,
 * so the markup never runs as part of the app page.
 */

export function SvgBlock({ code }: { code: string }) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const src = useMemo(() => svgDataUrl(code), [code]);
  const name = useMemo(() => /<title>([^<]{1,60})<\/title>/i.exec(code)?.[1]?.trim() || 'SVG from chat', [code]);

  const placeOnCanvas = async () => {
    try {
      const r = importSvg(code, { name });
      if (await place(r.node, undefined, 'Place SVG from chat')) toast(r.mode === 'vector' ? `Placed as ${r.shapes} vector layer${r.shapes === 1 ? '' : 's'}` : 'Placed as an image');
    } catch (e) {
      toast(`Could not place the SVG: ${(e as Error).message}`, 'error');
    }
  };
  const copy = () => { void navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); };

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-line bg-panel-2">
      <div className="flex max-h-56 min-h-16 items-center justify-center bg-panel p-3">
        <img src={src} alt={name} draggable={false} className="max-h-48 max-w-full object-contain" />
      </div>
      <div className="flex h-7 items-center gap-0.5 border-t border-line px-1">
        <button onClick={() => void placeOnCanvas()} title="Place this SVG on the canvas"
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] font-medium text-fg-muted hover:bg-panel-3 hover:text-fg">
          <Shapes size={11} />Place on canvas
        </button>
        <span className="flex-1" />
        <button onClick={() => setShowCode(!showCode)} title={showCode ? 'Hide the source' : 'Show the source'} aria-pressed={showCode}
          className={cn('flex h-6 w-6 items-center justify-center rounded-md hover:bg-panel-3 hover:text-fg', showCode ? 'text-fg' : 'text-fg-subtle')}>
          <Code2 size={11} />
        </button>
        <button onClick={copy} title="Copy SVG" className="flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-panel-3 hover:text-fg">
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>
      {showCode && <pre className="max-h-48 select-text overflow-auto whitespace-pre-wrap break-all border-t border-line p-2 font-mono text-[10.5px] leading-relaxed text-fg-muted">{code}</pre>}
    </div>
  );
}
