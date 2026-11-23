/** Shape geometry shared by the renderer, the SVG exporter and hit testing. Pure math, no DOM. */

/** Regular polygon, point up, stretched so it touches all four sides of the w×h box. */
export function polygonPoints(sides: number, w: number, h: number): Array<{ x: number; y: number }> {
  const n = Math.max(3, Math.round(sides));
  const raw = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
  const minX = Math.min(...raw.map((p) => p.x)), maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y)), maxY = Math.max(...raw.map((p) => p.y));
  return raw.map((p) => ({ x: ((p.x - minX) / (maxX - minX || 1)) * w, y: ((p.y - minY) / (maxY - minY || 1)) * h }));
}

/** Matrix [a, b, c, d, e, f] mapping a path's viewBox onto a w×h node. A zero-size axis (a straight line) keeps scale 1. */
export function viewBoxMatrix(vb: { x: number; y: number; width: number; height: number }, w: number, h: number): [number, number, number, number, number, number] {
  const sx = vb.width > 0 ? w / vb.width : 1;
  const sy = vb.height > 0 ? h / vb.height : 1;
  return [sx, 0, 0, sy, -vb.x * sx, -vb.y * sy];
}

/**
 * Ends of a CSS linear gradient line in a w×h box: angle 0 points up, 90 right, and the line is as
 * long as the box is deep along that angle, so the canvas and an HTML export match.
 */
export function linearGradientLine(angle: number, w: number, h: number) {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a), dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return { x0: w / 2 - dx * half, y0: h / 2 - dy * half, x1: w / 2 + dx * half, y1: h / 2 + dy * half };
}
