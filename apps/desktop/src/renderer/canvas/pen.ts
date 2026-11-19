/** Pen tool geometry: points with optional bezier handles → SVG path data in page coordinates. */

type Pt = { x: number; y: number };
export type PenPoint = Pt & { in?: Pt; out?: Pt };

const r = (v: number) => Math.round(v * 100) / 100;

function segments(pts: PenPoint[], closed: boolean): Array<[PenPoint, PenPoint]> {
  const out: Array<[PenPoint, PenPoint]> = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1]!, pts[i]!]);
  if (closed && pts.length > 2) out.push([pts.at(-1)!, pts[0]!]);
  return out;
}

export function penPath(pts: PenPoint[], closed: boolean): string {
  if (!pts.length) return '';
  let d = `M${r(pts[0]!.x)} ${r(pts[0]!.y)}`;
  for (const [a, b] of segments(pts, closed)) {
    if (!a.out && !b.in) d += `L${r(b.x)} ${r(b.y)}`;
    else {
      const c1 = a.out ?? a, c2 = b.in ?? b;
      d += `C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(b.x)} ${r(b.y)}`;
    }
  }
  return closed ? `${d}Z` : d;
}

/** Tight bounds, sampling each curve (handles can stick out past the curve itself). */
export function penBounds(pts: PenPoint[], closed: boolean): { x: number; y: number; width: number; height: number } {
  const xs: number[] = pts.map((p) => p.x), ys: number[] = pts.map((p) => p.y);
  for (const [a, b] of segments(pts, closed)) {
    if (!a.out && !b.in) continue;
    const c1 = a.out ?? a, c2 = b.in ?? b;
    for (let i = 1; i < 24; i++) {
      const t = i / 24, u = 1 - t;
      xs.push(u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x);
      ys.push(u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y);
    }
  }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x: r(x), y: r(y), width: r(Math.max(...xs) - x), height: r(Math.max(...ys) - y) };
}
