import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserCommandSchema, placeImageSchema, type BrowserCommand, type Channel, type Message } from '@archa/protocol';

/* Search, image listing, download and place_image (blueprint BROWSER, "Images"). */

vi.mock('electron', () => ({ nativeImage: {}, WebContentsView: class {} }));
const bridge = vi.hoisted(() => ({ calls: [] as BrowserCommand[] }));
vi.mock('../src/core-host/main-bridge', () => ({
  callBrowser: async (cmd: BrowserCommand) => {
    bridge.calls.push(cmd);
    return {
      text: 'Saved', png: 'PREVIEW',
      image: { path: 'C:\\dl\\sunset-beach.jpg', mime: 'image/jpeg', width: 1600, height: 1000, bytes: 1234, source: cmd.url ?? 'ref', embed: 'data:image/jpeg;base64,/9j/AAAA' },
    };
  },
}));

const { fetchImage, fileNameFor, saveImage, sniffMime } = await import('../src/main/browser-image');
const { searchUrl } = await import('../src/main/browser-url');
const { Workspace } = await import('../src/core-host/workspace');

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-browser-images-'));
  process.env.ARCHA_HOME = home;
  bridge.calls.length = 0;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const noSession = {} as never;

describe('search', () => {
  it('builds Google web and image URLs', () => {
    expect(searchUrl('modern villa bali')).toBe('https://www.google.com/search?q=modern%20villa%20bali');
    expect(searchUrl(' coffee logo ', true)).toBe('https://www.google.com/search?q=coffee%20logo&udm=2');
  });
});

describe('image files', () => {
  it('trusts the bytes over the declared type', () => {
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(Buffer.from('ffd8ffe000104a46', 'hex'))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(Buffer.from('<?xml version="1.0"?><svg viewBox="0 0 1 1"/>'))).toBe('image/svg+xml');
    expect(sniffMime(Buffer.from('<!doctype html><html>'))).toBeNull();
  });

  it('names files after the URL', () => {
    expect(fileNameFor('https://cdn.x.com/img/Sunset%20Beach.webp?w=800', 'image/jpeg')).toBe('Sunset-Beach.jpg');
    expect(fileNameFor('data:image/png;base64,AAAA', 'image/png')).toBe('image.png');
  });

  it('reads data: URLs and refuses web pages', async () => {
    const f = await fetchImage(`data:image/png;base64,${PNG.toString('base64')}`, noSession);
    expect(f.mime).toBe('image/png');
    await expect(fetchImage('data:text/html,<html></html>', noSession)).rejects.toThrow(/not an image/);
    await expect(fetchImage('javascript:alert(1)', noSession)).rejects.toThrow(/not an image address/);
  });

  it('saves to ARCHA_HOME/downloads without overwriting', async () => {
    const f = { buf: PNG, mime: 'image/png', name: 'logo.png', source: 'x' };
    const a = await saveImage(f);
    const b = await saveImage(f);
    expect(a).toBe(join(home, 'downloads', 'logo.png'));
    expect(b).toBe(join(home, 'downloads', 'logo-2.png'));
    expect(readFileSync(b)).toEqual(PNG);
    const custom = await saveImage(f, join(home, 'refs', 'hero.png'));
    expect(existsSync(custom)).toBe(true);
    await expect(saveImage(f, 'relative/dir')).rejects.toThrow(/absolute/);
  });
});

describe('schemas', () => {
  it('accept the new browser actions and place_image', () => {
    for (const cmd of [
      { action: 'search', query: 'villa', kind: 'images' },
      { action: 'images', minSize: 100, viewportOnly: true },
      { action: 'download', url: 'https://x.com/a.jpg', path: 'C:\\refs' },
      { action: 'download', ref: 'e4', capture: true },
    ]) expect(browserCommandSchema.safeParse(cmd).success).toBe(true);
    expect(placeImageSchema.safeParse({ url: 'https://x.com/a.jpg', width: 400, fit: 'crop' }).success).toBe(true);
    expect(placeImageSchema.safeParse({ ref: 'e4', fit: 'stretch' }).success).toBe(false);
  });
});

describe('place_image', () => {
  function setup() {
    const ws = new Workspace();
    const ui: Channel = { send: (_m: Message) => {}, onMessage: () => {} };
    ws.attach(ui, { kind: 'renderer', name: 'window' });
    const agent = ws.attach({ send: () => {}, onMessage: () => {} }, { kind: 'mcp', name: 'claude', agentId: 'claude' });
    ws.requestRender = async () => ({ png: 'AAAA' });
    return { ws, agent, docId: ws.summaries()[0]!.id };
  }

  it('downloads through the browser and places an image layer at a comfortable size', async () => {
    const { ws, agent, docId } = setup();
    const r = await ws.handlers['agent.placeImage']({ docId, url: 'https://x.com/sunset.jpg' }, agent);
    expect(r.ok).toBe(true);
    expect(bridge.calls[0]).toMatchObject({ action: 'download', url: 'https://x.com/sunset.jpg' });
    const node = ws.session(docId).doc.findByName('sunset-beach')[0]!;
    expect(node).toMatchObject({ type: 'image', width: 800, height: 500, fit: 'crop' });
    expect((node as { src: string }).src).toBe('data:image/jpeg;base64,/9j/AAAA');
    if (r.ok) expect(r.output.join('\n')).toMatch(/file 1600×1000 px[\s\S]*Saved file: C:\\dl\\sunset-beach\.jpg/);
  });

  it('keeps the aspect ratio when one side is given, inside a frame', async () => {
    const { ws, agent, docId } = setup();
    await ws.handlers['agent.execute']({ docId, code: `insert(null, { type: 'frame', name: 'Hero', width: 1200, height: 600 })` }, agent);
    const r = await ws.handlers['agent.placeImage']({ docId, ref: 'e7', parent: 'Hero', width: 320, name: 'Photo', cornerRadius: 12 }, agent);
    expect(r.ok).toBe(true);
    const doc = ws.session(docId).doc;
    const photo = doc.findByName('Photo')[0]!;
    expect(photo).toMatchObject({ width: 320, height: 200, cornerRadius: 12 });
    expect(photo.parentId).toBe(doc.findByName('Hero')[0]!.id);
  });

  it('needs a source', async () => {
    const { ws, agent, docId } = setup();
    await expect(Promise.resolve().then(() => ws.handlers['agent.placeImage']({ docId }, agent))).rejects.toThrow(/needs url/);
  });
});
