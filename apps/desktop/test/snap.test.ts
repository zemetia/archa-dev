import { describe, expect, it } from 'vitest';
import { snapMove } from '../src/renderer/lib/snap';

/* Smart guides: the dragged box's edges and centre snap to nearby boxes, and the lined-up edges draw guides. */

const box = (x: number, y: number, width = 100, height = 50) => ({ x, y, width, height });

describe('snapMove', () => {
  it('pulls a left edge onto a neighbour within the threshold', () => {
    const s = snapMove(box(203, 300), [box(200, 0)], 6);
    expect(s.dx).toBe(-3);
    expect(s.dy).toBe(0);
    expect(s.guides).toContainEqual({ axis: 'x', at: 200, from: 0, to: 350 });
  });

  it('lines up centres and picks the nearest candidate', () => {
    // Moving centre x = 154; target centre = 150 (4 away), target right = 300 (far).
    const s = snapMove(box(104, 200), [box(100, 0), box(260, 0, 40)], 6);
    expect(s.dx).toBe(-4);
    expect(s.guides.some((g) => g.axis === 'x' && g.at === 150)).toBe(true);
  });

  it('snaps both axes at once', () => {
    const s = snapMove(box(98, 52), [box(0, 0)], 6);
    expect(s).toMatchObject({ dx: 2, dy: -2 });
    expect(s.guides.map((g) => g.axis).sort()).toEqual(['x', 'y']);
  });

  it('leaves the box alone when nothing is near', () => {
    expect(snapMove(box(500, 500), [box(0, 0)], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('merges guides at the same position into one line spanning every box', () => {
    const s = snapMove(box(1, 200), [box(0, 0), box(0, 400)], 6);
    const xs = s.guides.filter((g) => g.axis === 'x' && g.at === 0);
    expect(xs).toEqual([{ axis: 'x', at: 0, from: 0, to: 450 }]);
  });
});
