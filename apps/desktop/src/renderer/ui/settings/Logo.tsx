import claude from '../../assets/logos/claude.svg';
import openai from '../../assets/logos/openai.svg';
import antigravity from '../../assets/logos/antigravity.png';
import gemini from '../../assets/logos/googlegemini.svg';
import ollama from '../../assets/logos/ollama.svg';
import openrouter from '../../assets/logos/openrouter.svg';
import github from '../../assets/logos/github.svg';
import figma from '../../assets/logos/figma.svg';
import linear from '../../assets/logos/linear.svg';
import notion from '../../assets/logos/notion.svg';
import slack from '../../assets/logos/slack.svg';
import vercel from '../../assets/logos/vercel.svg';
import mcp from '../../assets/logos/modelcontextprotocol.svg';
import { cn } from '../controls';

/*
 * Brand marks (simple-icons, CC0; Antigravity from antigravity.google). Monochrome SVGs are drawn as a
 * CSS mask so their colour comes from a token class — the app never hard-codes a colour.
 */

export type Brand = 'claude' | 'codex' | 'agy' | 'gemini' | 'ollama' | 'openrouter' | 'github' | 'figma' | 'linear' | 'notion' | 'slack' | 'vercel' | 'mcp';

const BRANDS: Record<Brand, { src: string; tone?: string }> = {
  claude: { src: claude, tone: 'bg-claude' },
  codex: { src: openai, tone: 'bg-fg' },
  agy: { src: antigravity },
  gemini: { src: gemini, tone: 'bg-agy' },
  ollama: { src: ollama, tone: 'bg-fg' },
  openrouter: { src: openrouter, tone: 'bg-fg' },
  github: { src: github, tone: 'bg-fg' },
  figma: { src: figma, tone: 'bg-fg' },
  linear: { src: linear, tone: 'bg-fg' },
  notion: { src: notion, tone: 'bg-fg' },
  slack: { src: slack, tone: 'bg-fg' },
  vercel: { src: vercel, tone: 'bg-fg' },
  mcp: { src: mcp, tone: 'bg-fg' },
};

/** The bare mark. */
export function BrandMark({ brand, size = 16, className }: { brand: Brand; size?: number; className?: string }) {
  const b = BRANDS[brand];
  if (!b.tone) return <img src={b.src} alt="" width={size} height={size} draggable={false} className={cn('shrink-0 object-contain', className)} />;
  const mask = `url("${b.src}") center / contain no-repeat`;
  return <span aria-hidden className={cn('inline-block shrink-0', b.tone, className)} style={{ width: size, height: size, mask, WebkitMask: mask }} />;
}

/** The mark on a rounded tile, for lists and headers. */
export function BrandTile({ brand, size = 'md', muted }: { brand: Brand; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  const px = size === 'sm' ? 24 : size === 'md' ? 36 : 44;
  return (
    <span className={cn('flex shrink-0 items-center justify-center bg-panel-3 ring-1 ring-line', size === 'lg' ? 'rounded-xl' : 'rounded-lg', muted && 'opacity-50 grayscale')}
      style={{ width: px, height: px }}>
      <BrandMark brand={brand} size={Math.round(px * 0.55)} />
    </span>
  );
}
