import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, webContents, type WebContents } from 'electron';
import { z } from 'zod';

/*
 * JPG screenshots of a canvas web page (embed node, blueprint RENDERING/01 → Embeds). `object` captures
 * the page exactly as the node shows it; `wide` re-lays the page out at desktop width (1440 × 900) first.
 */

export const embedShotArgs = z.object({ webContentsId: z.number().int().positive(), mode: z.enum(['wide', 'object']) });

const WIDE = { width: 1440, height: 900 };
const TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), TIMEOUT_MS))]);
}

async function capture(guest: WebContents, mode: 'wide' | 'object'): Promise<Buffer> {
  const dbg = guest.debugger;
  // DevTools may already hold the debugger; then reuse it and leave it attached.
  const owned = !dbg.isAttached();
  if (owned) dbg.attach('1.3');
  try {
    if (mode === 'wide') {
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { ...WIDE, deviceScaleFactor: 1, mobile: false });
      await new Promise((r) => setTimeout(r, 500)); // let responsive layouts settle at the new width
    }
    const shot = await withTimeout(dbg.sendCommand('Page.captureScreenshot', { format: 'jpeg', quality: 92 }) as Promise<{ data: string }>, 'Screenshot');
    return Buffer.from(shot.data, 'base64');
  } finally {
    if (mode === 'wide') await dbg.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => {});
    if (owned) dbg.detach();
  }
}

/** Captures, asks where to save, writes the file. Resolves to the saved path, null if cancelled, or throws. */
export async function saveEmbedShot(sender: WebContents, args: z.infer<typeof embedShotArgs>): Promise<string | null> {
  const guest = webContents.fromId(args.webContentsId);
  // Only a <webview> hosted by the asking window may be captured.
  if (!guest || guest.getType() !== 'webview' || guest.hostWebContents !== sender) throw new Error('Web page not found');
  const jpg = await capture(guest, args.mode);
  let host = 'page';
  try { host = new URL(guest.getURL()).hostname.replace(/^www\./, '') || host; } catch { /* keep default */ }
  const win = BrowserWindow.fromWebContents(sender)!;
  const r = await dialog.showSaveDialog(win, {
    defaultPath: join(app.getPath('pictures'), `${host}-${args.mode === 'wide' ? 'desktop' : 'object'}.jpg`),
    filters: [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }],
  });
  if (r.canceled || !r.filePath) return null;
  await writeFile(r.filePath, jpg);
  return r.filePath;
}
