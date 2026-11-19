import { describe, expect, it } from 'vitest';
import type { AgentTrail, TrailStep } from '@archa/protocol';
import { cursorAlive, pose, pushTrail } from '../src/renderer/canvas/cursors';

const cam = { x: 0, y: 0, zoom: 1 };
const step = (x: number, y: number, action: TrailStep['action'] = 'edit'): TrailStep => ({ action, id: `n${x}`, name: 'Card', bounds: { x, y, width: 200, height: 120 } }) as TrailStep;
const trail = (steps: TrailStep[]): AgentTrail => ({ author: { id: 'a1', name: 'Swift Heron' }, steps }) as AgentTrail;

/** Largest jump between consecutive 60 fps frames over [from, to). */
function maxJump(get: (t: number) => { x: number; y: number }, from: number, to: number) {
  let prev = get(from);
  let max = 0;
  for (let t = from + 16; t < to; t += 16) {
    const p = get(t);
    max = Math.max(max, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  return max;
}

describe('agent cursor motion', () => {
  it('never teleports: travel, idle fidgets, a new trail mid-idle, thinking → resting', () => {
    let c = pushTrail(undefined, trail([step(0, 0, 'read'), step(600, 300), step(100, 500, 'create')]), 0);
    const at = (t: number, live = true) => pose(c, cam, t, live).s;
    // Travel strokes are fast (a hand crosses 600 px in ~0.35 s), idle moves are small.
    expect(maxJump((t) => at(t), 0, 20_000)).toBeLessThan(80);
    const idleMax = maxJump((t) => at(t), 3_000, 20_000);
    expect(idleMax).toBeGreaterThan(0.3); // it does move while waiting
    expect(idleMax).toBeLessThan(12);
    // A new call arrives while the cursor fidgets: it leaves from where it is, no snap.
    const before = at(9_000);
    c = pushTrail(c, trail([step(900, 900)]), 9_000);
    const after = pose(c, cam, 9_000, true).s;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
    // The run ends (thinking → resting): the mood change crossfades.
    const live = pose(c, cam, 15_000, true).s;
    const rest = pose(c, cam, 15_016, false).s;
    expect(Math.hypot(rest.x - live.x, rest.y - live.y)).toBeLessThan(6);
  });

  it('clicks when it changes something, not when it only reads', () => {
    const c = pushTrail(undefined, trail([step(0, 0, 'read'), step(400, 0, 'create')]), 0);
    const clicks = (from: number, to: number) => { for (let t = from; t < to; t += 16) if (pose(c, cam, t, true).clicking >= 0) return true; return false; };
    expect(clicks(0, 650)).toBe(false);
    expect(clicks(650, 1300)).toBe(true);
  });

  it('hides about a second after the session finishes, never while it still works', () => {
    const c = pushTrail(undefined, trail([step(0, 0), step(300, 0)]), 0); // steps played by 1.3 s
    expect(cursorAlive(c, 30_000, true)).toBe(true); // still running (thinking) long after its steps
    expect(cursorAlive(c, 30_500, false)).toBe(true); // run just ended: brief linger + fade
    expect(cursorAlive(c, 31_300, false)).toBe(false);
  });
});
