import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { archaHome } from '@archa/protocol/node';

/*
 * Agent screenshots are temporary files (blueprint RENDERING/03 → Screenshots for Agents): full size, no cap,
 * written to ARCHA_HOME/runtime/screenshots and swept after a day. They never enter a document.
 */

const KEEP_MS = 24 * 60 * 60 * 1000;
const KEEP_FILES = 300;

/** Largest side an inline image may have; vision APIs reject anything bigger, so a preview goes inline instead. */
export const INLINE_MAX_SIDE = 7680;
/** Tall shots (taller than SLICE_MIN_HEIGHT and SLICE_RATIO × their width) go inline as full-width slices. */
export const SLICE_MIN_HEIGHT = 2000;
export const SLICE_RATIO = 1.8;
export const SLICE_HEIGHT = 1400;
export const MAX_SLICES = 12;
/**
 * Base64 bytes one reply may carry inline. MCP stdio clients drop a message over 10 MB (the SDK default),
 * which closes the connection — so replies stay well under it and point at the full file for the rest.
 */
export const INLINE_BUDGET = 6_000_000;

/** The slices that fit the inline budget, top first; how many were left out. */
export function fitBudget<T extends { data: string }>(slices: T[], budget = INLINE_BUDGET): { kept: T[]; omitted: number } {
  const kept: T[] = [];
  let used = 0;
  for (const s of slices) {
    if (used + s.data.length > budget) break;
    used += s.data.length;
    kept.push(s);
  }
  return { kept, omitted: slices.length - kept.length };
}

/** What a Chromium canvas can hold at all — a technical ceiling, not a policy one. */
export const CANVAS_MAX_SIDE = 32000;
export const CANVAS_MAX_AREA = 200_000_000;

export const shotsDir = () => join(archaHome(), 'runtime', 'screenshots');

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'node';

export function saveShot(pngBase64: string, docId: string, nodeId: string): string {
  const dir = shotsDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${safe(docId)}-${safe(nodeId)}-${Date.now().toString(36)}.png`);
  writeFileSync(path, Buffer.from(pngBase64, 'base64'));
  return path;
}

/** Removes screenshots older than a day, and the oldest beyond KEEP_FILES. */
export function sweepShots(now = Date.now()): void {
  const dir = shotsDir();
  let files: Array<{ path: string; mtime: number }>;
  try {
    files = readdirSync(dir).map((f) => join(dir, f)).map((path) => ({ path, mtime: statSync(path).mtimeMs }));
  } catch {
    return;
  }
  files.sort((a, b) => b.mtime - a.mtime);
  files.forEach((f, i) => {
    if (i >= KEEP_FILES || now - f.mtime > KEEP_MS) rmSync(f.path, { force: true });
  });
}

/** The render scale that fits a node of `w`×`h` (at `scale`) inside the canvas ceiling. */
export function canvasFit(w: number, h: number, scale: number): number {
  let fit = scale;
  const side = Math.max(w, h) * fit;
  if (side > CANVAS_MAX_SIDE) fit *= CANVAS_MAX_SIDE / side;
  const area = w * h * fit * fit;
  if (area > CANVAS_MAX_AREA) fit *= Math.sqrt(CANVAS_MAX_AREA / area);
  return fit;
}
