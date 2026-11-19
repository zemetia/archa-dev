import { personaColor, type AgentTrail, type TrailAction, type TrailStep } from '@archa/protocol';
import { toScreen } from '../lib/geometry';
import type { Camera } from '../lib/store';

/*
 * Agent session cursors (blueprint RENDERING/02 → Agent presence). Every agent tool call arrives as a
 * trail of steps; the session's cursor glides from step to step, outlines what it is working on and
 * leaves a dashed path behind, so parallel sessions can be followed on the same canvas.
 */

type Pt = { x: number; y: number };
export type AgentCursor = {
  /** Author id: one cursor per session. */
  id: string;
  name: string;
  steps: TrailStep[];
  /** When the current steps started playing, and where the cursor was then (world coordinates). */
  start: number;
  from: Pt | null;
  /** Visited points kept for the path, newest last. */
  path: Pt[];
};

const MAX_STEPS = 80;
const PATH_POINTS = 24;
/** Time per step: travel + dwell. Long trails play faster so a big snippet still finishes in ~6 s. */
const stepMs = (n: number) => Math.max(140, Math.min(650, 6000 / Math.max(1, n)));
const TRAVEL = 0.55;
/** A finished cursor stays this long, then fades for FADE_MS. */
const LINGER_MS = 8000;
const FADE_MS = 1200;

const center = (s: TrailStep): Pt => ({ x: s.bounds.x + s.bounds.width / 2, y: s.bounds.y + s.bounds.height / 2 });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Where a cursor is now, and which step it is on (null once it has played every step). */
export function cursorAt(c: AgentCursor, now: number): { pos: Pt; step: TrailStep | null; index: number; arrived: boolean } {
  const per = stepMs(c.steps.length);
  const t = now - c.start;
  const i = Math.floor(t / per);
  if (i >= c.steps.length) return { pos: center(c.steps.at(-1)!), step: null, index: c.steps.length, arrived: true };
  const step = c.steps[i]!;
  const target = center(step);
  const prev = i === 0 ? c.from ?? target : center(c.steps[i - 1]!);
  const k = ease(Math.min(1, (t - i * per) / per / TRAVEL));
  return { pos: { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k }, step, index: i, arrived: k >= 1 };
}

/** Appends a trail: steps not played yet keep playing first, from wherever the cursor is now. */
export function pushTrail(prev: AgentCursor | undefined, t: AgentTrail, now: number): AgentCursor {
  const name = t.author.name ?? t.author.id;
  if (!prev) return { id: t.author.id, name, steps: t.steps.slice(-MAX_STEPS), start: now, from: null, path: [] };
  const at = cursorAt(prev, now);
  const path = [...prev.path, ...prev.steps.slice(0, at.index).map(center), at.pos].slice(-PATH_POINTS);
  const steps = [...prev.steps.slice(at.index), ...t.steps].slice(-MAX_STEPS);
  return { id: prev.id, name, steps, start: now, from: at.pos, path };
}

/** True while a cursor is still on screen (playing, lingering or fading). */
export function cursorAlive(c: AgentCursor, now: number, working: boolean): boolean {
  return working || now < endOf(c) + LINGER_MS + FADE_MS;
}

const endOf = (c: AgentCursor) => c.start + stepMs(c.steps.length) * c.steps.length;

const VERB: Record<TrailAction, string> = {
  focus: 'Focusing', read: 'Reading', create: 'Creating', edit: 'Editing', copy: 'Copying', move: 'Moving', delete: 'Deleting', look: 'Checking',
};

/** Session colours come from the --color-persona-N tokens, read once per frame. */
export function personaPalette(): string[] {
  const css = getComputedStyle(document.documentElement);
  return Array.from({ length: 8 }, (_, i) => css.getPropertyValue(`--color-persona-${i}`).trim() || '#f97316');
}

/**
 * Draws every cursor. `working` names the sessions whose run is still going: their cursor never fades,
 * and once their steps are played it shows "Thinking" while the agent prepares its next call.
 */
export function drawCursors(ctx: CanvasRenderingContext2D, cam: Camera, cursors: AgentCursor[], working: Set<string>, now: number) {
  const palette = personaPalette();
  for (const c of cursors) {
    const live = working.has(c.name);
    const end = endOf(c);
    const alpha = live || now < end + LINGER_MS ? 1 : Math.max(0, 1 - (now - end - LINGER_MS) / FADE_MS);
    if (alpha <= 0) continue;
    const color = palette[personaColor(c.name)]!;
    const at = cursorAt(c, now);
    const screen = (p: Pt) => toScreen(cam, p.x, p.y);
    ctx.save();
    ctx.globalAlpha = alpha;

    // Path: where this session has been, fading towards the oldest point.
    const pts = [...c.path, ...c.steps.slice(0, at.index).map(center), at.pos].slice(-PATH_POINTS).map(screen);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = color;
    for (let i = 1; i < pts.length; i++) {
      ctx.globalAlpha = alpha * (0.15 + 0.5 * (i / pts.length));
      ctx.beginPath();
      ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y);
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;

    // What it is working on right now.
    const step = at.step ?? c.steps.at(-1)!;
    if (at.arrived && (at.step || now < end + LINGER_MS)) {
      const p = toScreen(cam, step.bounds.x, step.bounds.y);
      const w = step.bounds.width * cam.zoom, h = step.bounds.height * cam.zoom;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      if (step.action === 'delete') ctx.setLineDash([3, 3]);
      ctx.strokeRect(p.x, p.y, w, h);
      ctx.setLineDash([]);
      if (at.step && (step.action === 'create' || step.action === 'copy')) {
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha * 0.08;
        ctx.fillRect(p.x, p.y, w, h);
        ctx.globalAlpha = alpha;
      }
    }

    const s = screen(at.pos);
    arrow(ctx, s.x, s.y, color);
    const doing = at.step ? `${VERB[at.step.action]} ${at.step.name}` : live ? 'Thinking…' : '';
    label(ctx, s.x + 14, s.y + 16, c.name, doing, color);
    ctx.restore();
  }
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 16);
  ctx.lineTo(x + 4.5, y + 12);
  ctx.lineTo(x + 8, y + 19);
  ctx.lineTo(x + 10.5, y + 18);
  ctx.lineTo(x + 7, y + 11);
  ctx.lineTo(x + 12, y + 11);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.25;
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, doing: string, color: string) {
  ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
  const nameW = ctx.measureText(name).width;
  ctx.font = '400 11px Inter, "Segoe UI", system-ui, sans-serif';
  const shown = doing.length > 40 ? `${doing.slice(0, 39)}…` : doing;
  const doingW = shown ? ctx.measureText(shown).width + 8 : 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, nameW + doingW + 14, 20, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText(name, x + 7, y + 14);
  if (shown) {
    ctx.globalAlpha *= 0.85;
    ctx.font = '400 11px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(shown, x + 7 + nameW + 8, y + 14);
  }
}
