import { basename } from 'node:path';
import { DocumentError } from '@archa/core';
import { browserCommandSchema, placeImageSchema, type BrowserCommand, type BrowserReply } from '@archa/protocol';
import type { AgentExecutor } from '@archa/mcp';
import type { Connection, HostContext } from '../context';
import { validated, type Routes } from '../router';

/**
 * The agent browser's pages live in the app's main process; the host reaches them through this
 * bridge (blueprint BROWSER, "Process path"). A headless host has none.
 */
export type BrowserBridge = (cmd: BrowserCommand, agent: string) => Promise<BrowserReply>;

const noBrowser: BrowserBridge = () => Promise.reject(new Error('The browser needs the ArchaDev app (no main process in headless mode).'));

export function browserRoutes(ctx: HostContext, executor: (conn: Connection) => AgentExecutor, bridge: BrowserBridge = noBrowser): Routes {
  return {
    'agent.browser': async (params, conn) => {
      const parsed = browserCommandSchema.safeParse(params);
      if (!parsed.success) throw new DocumentError('VALIDATION', `Invalid browser input: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      const cmd = parsed.data;
      const { text, png } = await bridge(cmd, conn.author.name ?? conn.author.id);
      const detail = (cmd.url ?? cmd.query ?? cmd.ref ?? cmd.selector ?? cmd.key ?? (cmd.text !== undefined ? `"${cmd.text.slice(0, 40)}"` : '')).slice(0, 120);
      ctx.log(ctx.session().id, conn.author, 'browser', `Browser · ${cmd.action}${detail ? ` ${detail}` : ''}`, [], conn.client.runId);
      // The canvas-ready copy of a download stays here; the agent gets the text and the preview.
      return { text, png };
    },
    'agent.placeImage': validated(placeImageSchema, async ({ docId, url, ref, selector, capture, path, ...place }, conn) => {
      if (!url && !ref && !selector) throw new DocumentError('VALIDATION', 'place_image needs url (web address, data: URL or file path), or ref/selector of an image on the open browser page.');
      const s = ctx.session(docId);
      const { image } = await bridge({ action: 'download', url, ref, selector, capture, path }, conn.author.name ?? conn.author.id);
      if (!image?.embed) throw new DocumentError('VALIDATION', `ArchaDev cannot show ${image?.mime ?? 'that file'} on the canvas. Saved to ${image?.path ?? '?'} — use capture: true with the element on the browser page for a PNG.`);
      const r = await executor(conn).placeImage(s, image.embed, { ...place, name: place.name ?? basename(image.path).replace(/(-\d+)?\.[^.]+$/, ''), naturalWidth: image.width || undefined, naturalHeight: image.height || undefined });
      if (r.ok) r.output.push(`Saved file: ${image.path} (${image.mime}, from ${image.source.slice(0, 200)})`);
      return r;
    }),
  };
}
