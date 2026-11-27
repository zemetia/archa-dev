import { personaColor, type AgentTrail, type TrailAction, type TrailStep } from '@archa/protocol';
import { toScreen } from '../lib/geometry';
import type { Camera } from '../lib/store';
import claudeLogo from '../assets/logos/claude.svg';
import openaiLogo from '../assets/logos/openai.svg';
import agyLogo from '../assets/logos/antigravity.png';

/*
 * Agent session cursors (blueprint RENDERING/02 → Agent presence). Every agent tool call arrives as a
 * trail of steps; the session's cursor moves like a person's hand would: quick curved strokes that
 * slightly overshoot, a click on what it changes, small fidgets over the element it works on, a wider
 * wander while it thinks, and long still pauses. Parallel sessions read as people sharing the canvas.
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
  /** Idle drift strength when these steps started, so the cursor eases out of it instead of jumping. */
  drift0: number;
  /** The agent called done(): play the remaining steps, then fade even if its process stays up. */
  done?: boolean;
};

const MAX_STEPS = 80;
/** Time per step: travel + dwell. Long trails play faster so a big snippet still finishes in ~6 s. */
const stepMs = (n: number) => Math.max(140, Math.min(650, 6000 / Math.max(1, n)));
const TRAVEL = 0.55;
/** Once the session is done (run over, steps played) the cursor waits this long, then fades for FADE_MS. */
const LINGER_MS = 700;
const FADE_MS = 500;

const center = (s: TrailStep): Pt => ({ x: s.bounds.x + s.bounds.width / 2, y: s.bounds.y + s.bounds.height / 2 });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
/** A hand's reach: minimum-jerk speed profile, a ~4% overshoot near the end, settled at 1. */
const reach = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  const k = x * x * x * (10 - 15 * x + 6 * x * x);
  return k + 0.04 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - 0.55) / 0.45)));
};
/** Idle motion fades in over this long once the cursor stops. */
const DRIFT_IN_MS = 700;
/** Click actions show a press + ripple for this long after the cursor lands. */
const CLICK_MS = 420;
const CLICKS = new Set<TrailAction>(['create', 'edit', 'copy', 'move', 'delete']);
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** Deterministic 0-1 noise per (session, slot, channel): the idle motion needs no per-frame state. */
const rand = (seed: number, slot: number, ch: number) => {
  let h = Math.imul(seed ^ Math.imul(slot, 0x9e3779b1) ^ Math.imul(ch + 1, 0x85ebca77), 0xc2b2ae3d);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/** Where a cursor is now, and which step it is on (null once it has played every step). */
export function cursorAt(c: AgentCursor, now: number): { pos: Pt; step: TrailStep | null; index: number; arrived: boolean; landed: number } {
  const per = stepMs(c.steps.length);
  const t = now - c.start;
  const i = Math.floor(t / per);
  if (i >= c.steps.length) return { pos: center(c.steps.at(-1)!), step: null, index: c.steps.length, arrived: true, landed: t - (c.steps.length - 1 + TRAVEL) * per };
  const step = c.steps[i]!;
  const target = center(step);
  const prev = i === 0 ? c.from ?? target : center(c.steps[i - 1]!);
  const u = (t - i * per) / (per * TRAVEL);
  const k = reach(u);
  // A wrist swings in an arc, not a ruler line: bow sideways by 6-14% of the distance, side per stroke.
  const dx = target.x - prev.x, dy = target.y - prev.y;
  const seed = hash(c.id);
  const bow = Math.sin(Math.PI * Math.min(1, u)) * (0.06 + 0.08 * rand(seed, i, 7)) * (rand(seed, i, 8) < 0.5 ? 1 : -1);
  return { pos: { x: prev.x + dx * k - dy * bow, y: prev.y + dy * k + dx * bow }, step, index: i, arrived: u >= 1, landed: u >= 1 ? (u - 1) * per * TRAVEL : -1 };
}

/**
 * How strongly the cursor drifts now (0-1): fades in after it arrives, fades out before the next step
 * leaves, and eases out of the previous drift while the first new step travels.
 */
function driftAt(c: AgentCursor, now: number): number {
  const per = stepMs(c.steps.length);
  const t = now - c.start;
  const n = c.steps.length;
  const i = Math.min(n - 1, Math.floor(t / per));
  const local = t - i * per;
  const travel = per * TRAVEL;
  if (local < travel) return i === 0 ? c.drift0 * (1 - ease(local / travel)) : 0;
  const dwell = local - travel;
  const fadeIn = smooth(dwell / DRIFT_IN_MS);
  return i === n - 1 ? fadeIn : Math.min(fadeIn, smooth((per - travel - dwell) / DRIFT_IN_MS));
}

/**
 * How a person's idle hand behaves, per mood: `work` = small fidgets over the element being changed,
 * `think` = wandering around while reading the canvas, `rest` = hand mostly off the mouse.
 * `reach` is screen pixels; `move` is the chance a slot holds a movement; slots are SLOT_MS long.
 */
type Mood = 'work' | 'think' | 'rest';
const MOODS: Record<Mood, { reach: number; move: number }> = { work: { reach: 22, move: 0.5 }, think: { reach: 46, move: 0.55 }, rest: { reach: 12, move: 0.2 } };
const SLOT_MS = 950;

/** Offset a mood puts the cursor at now: still most of the time, then a short ~0.2-0.5 s stroke to a new spot. */
function idleOffset(seed: number, now: number, mood: Mood, area: number): Pt {
  const m = MOODS[mood];
  const r = mood === 'work' ? Math.max(5, Math.min(m.reach, area * 0.45)) : m.reach;
  const spot = (slot: number): Pt => {
    const a = rand(seed, slot, 1) * Math.PI * 2;
    const d = r * Math.sqrt(rand(seed, slot, 2));
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8 };
  };
  const moves = (slot: number) => rand(seed, slot, 0) < m.move;
  // Where the hand rests: the spot of the latest slot that moved (nothing in a while → home).
  const held = (slot: number): Pt => { for (let k = slot; k > slot - 12; k--) if (moves(k)) return spot(k); return { x: 0, y: 0 }; };
  const slot = Math.floor(now / SLOT_MS);
  const before = held(slot - 1);
  if (!moves(slot)) return before;
  const startAt = slot * SLOT_MS + rand(seed, slot, 3) * SLOT_MS * 0.35;
  const dur = 200 + rand(seed, slot, 4) * 300;
  const k = reach((now - startAt) / dur);
  const to = spot(slot);
  return { x: before.x + (to.x - before.x) * k, y: before.y + (to.y - before.y) * k };
}

/** Mood switches glide from wherever the hand was instead of jumping (the only state the idle motion keeps). */
const moodOf = new Map<string, { mood: Mood; from: Pt; since: number }>();
function idle(c: AgentCursor, now: number, mood: Mood, area: number, strength: number): Pt {
  if (strength <= 0) return { x: 0, y: 0 };
  const seed = hash(c.id);
  const blended = (m: { mood: Mood; from: Pt; since: number }): Pt => {
    const cur = idleOffset(seed, now, m.mood, area);
    const w = smooth((now - m.since) / 800);
    return { x: m.from.x + (cur.x - m.from.x) * w, y: m.from.y + (cur.y - m.from.y) * w };
  };
  let m = moodOf.get(c.id);
  if (!m) moodOf.set(c.id, (m = { mood, from: idleOffset(seed, now, mood, area), since: now - 1e6 }));
  else if (m.mood !== mood) { m.from = blended(m); m.mood = mood; m.since = now; }
  const o = blended(m);
  return { x: o.x * strength, y: o.y * strength };
}

/** Appends a trail: steps not played yet keep playing first, from wherever the cursor is now. */
export function pushTrail(prev: AgentCursor | undefined, t: AgentTrail, now: number): AgentCursor {
  const name = t.author.name ?? t.author.id;
  if (!prev) return { id: t.author.id, name, steps: t.steps.slice(-MAX_STEPS), start: now, from: null, drift0: 0 };
  const at = cursorAt(prev, now);
  const steps = [...prev.steps.slice(at.index), ...t.steps].slice(-MAX_STEPS);
  return { id: prev.id, name, steps, start: now, from: at.pos, drift0: driftAt(prev, now) };
}

/** The cursor after its session called done(); a later trail (a new turn) brings it back. */
export const markDone = (c: AgentCursor): AgentCursor => ({ ...c, done: true });

/** True while a cursor is still on screen (playing, lingering or fading). */
export function cursorAlive(c: AgentCursor, now: number, working: boolean): boolean {
  const alive = now < fadeAt(c, now, working && !c.done) + FADE_MS;
  if (!alive) { moodOf.delete(c.id); lastWorking.delete(c.id); }
  return alive;
}

const endOf = (c: AgentCursor) => c.start + stepMs(c.steps.length) * c.steps.length;

/** When the session was last seen working: the fade starts after both that and its last step. */
const lastWorking = new Map<string, number>();
function fadeAt(c: AgentCursor, now: number, working: boolean): number {
  if (working) lastWorking.set(c.id, now);
  return Math.max(endOf(c), lastWorking.get(c.id) ?? 0) + LINGER_MS;
}

const VERB: Record<TrailAction, string> = {
  focus: 'Focusing', read: 'Reading', create: 'Creating', edit: 'Editing', copy: 'Copying', move: 'Moving', delete: 'Deleting', look: 'Checking',
};

/** Session colours come from the --color-persona-N tokens, read once per frame. */
export function personaPalette(): string[] {
  const css = getComputedStyle(document.documentElement);
  return Array.from({ length: 8 }, (_, i) => css.getPropertyValue(`--color-persona-${i}`).trim() || '#f97316');
}

/** Screen point of a cursor's tip right now (travel + idle motion), and click progress 0-1 (-1 = none). */
export function pose(c: AgentCursor, cam: Camera, now: number, live: boolean): { s: Pt; clicking: number } {
  const at = cursorAt(c, now);
  const step = at.step ?? c.steps.at(-1)!;
  const base = toScreen(cam, at.pos.x, at.pos.y);
  const mood: Mood = at.step ? 'work' : live ? 'think' : 'rest';
  const area = Math.min(step.bounds.width, step.bounds.height) * cam.zoom;
  const d = idle(c, now, mood, area, driftAt(c, now));
  // A click where it changes something: the arrow dips and a ring spreads from the tip.
  const clicking = at.step && CLICKS.has(at.step.action) && at.landed >= 0 && at.landed < CLICK_MS ? at.landed / CLICK_MS : -1;
  return { s: { x: base.x + d.x, y: base.y + d.y }, clicking };
}

/**
 * Draws every cursor. `working` names the sessions whose run is still going: their cursor never fades,
 * and once their steps are played it shows "Thinking" while the agent prepares its next call.
 */
export function drawCursors(ctx: CanvasRenderingContext2D, cam: Camera, cursors: AgentCursor[], working: Set<string>, now: number) {
  const palette = personaPalette();
  for (const c of cursors) {
    const live = working.has(c.name) && !c.done;
    const end = endOf(c);
    const alpha = Math.max(0, Math.min(1, 1 - (now - fadeAt(c, now, live)) / FADE_MS));
    if (alpha <= 0) continue;
    const color = palette[personaColor(c.name)]!;
    const at = cursorAt(c, now);
    ctx.save();
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

    const { s, clicking } = pose(c, cam, now, live);
    if (clicking >= 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = alpha * (1 - clicking) * 0.7;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3 + 13 * smooth(clicking), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    arrow(ctx, s.x, s.y, color, clicking >= 0 && clicking < 0.35 ? 0.86 : 1);
    const doing = at.step ? `${VERB[at.step.action]} ${at.step.name}` : live ? 'Thinking…' : '';
    label(ctx, s.x + 14, s.y + 16, c.name, doing, color, logoOf(c.id));
    ctx.restore();
  }
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);
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
  ctx.restore();
}

/*
 * The agent's logo leads its label: a small white chip with the brand mark, so you can tell which CLI a
 * cursor belongs to. The author id starts with the agent id (`claude:<thread>`, `codex:<client>`…).
 * Monochrome marks are tinted onto a bitmap once; the chip waits a frame or two while images load.
 */
type Logo = { src: string; tint?: string };
const LOGOS: Record<string, Logo> = { claude: { src: claudeLogo, tint: 'claude' }, codex: { src: openaiLogo, tint: 'fg' }, agy: { src: agyLogo } };
const LOGO_PX = 12;
const logoImages = new Map<string, HTMLCanvasElement | null>();

function logoOf(authorId: string): HTMLCanvasElement | null {
  const agent = authorId.split(':')[0]!.toLowerCase();
  const key = agent.startsWith('claude') ? 'claude' : agent.startsWith('codex') || agent.startsWith('openai') ? 'codex'
    : agent.startsWith('agy') || agent.startsWith('antigravity') || agent.startsWith('gemini') ? 'agy' : null;
  if (!key) return null;
  if (logoImages.has(key)) return logoImages.get(key)!;
  logoImages.set(key, null);
  const logo = LOGOS[key]!;
  const img = new Image();
  img.onload = () => {
    const px = LOGO_PX * 2; // drawn at 2x so it stays crisp on high-density screens
    const bmp = document.createElement('canvas');
    bmp.width = bmp.height = px;
    const g = bmp.getContext('2d')!;
    g.drawImage(img, 0, 0, px, px);
    if (logo.tint) {
      const css = getComputedStyle(document.documentElement);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = logo.tint === 'fg' ? '#111111' : css.getPropertyValue(`--color-${logo.tint}`).trim() || '#d97757';
      g.fillRect(0, 0, px, px);
    }
    logoImages.set(key, bmp);
  };
  img.src = logo.src;
  return null;
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, doing: string, color: string, logo: HTMLCanvasElement | null) {
  ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
  const nameW = ctx.measureText(name).width;
  ctx.font = '400 11px Inter, "Segoe UI", system-ui, sans-serif';
  const shown = doing.length > 40 ? `${doing.slice(0, 39)}…` : doing;
  const doingW = shown ? ctx.measureText(shown).width + 8 : 0;
  const logoW = logo ? 20 : 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, logoW + nameW + doingW + 14, 20, 6);
  ctx.fill();
  if (logo) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + 12, y + 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(logo, x + 12 - LOGO_PX / 2, y + 10 - LOGO_PX / 2, LOGO_PX, LOGO_PX);
  }
  const tx = x + 7 + logoW;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
  ctx.fillText(name, tx, y + 14);
  if (shown) {
    ctx.globalAlpha *= 0.85;
    ctx.font = '400 11px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(shown, tx + nameW + 8, y + 14);
  }
}
