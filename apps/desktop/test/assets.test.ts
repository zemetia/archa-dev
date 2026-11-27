import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { ArchaDocument, DocumentSession, insertOpsFor } from '@archa/core';
import { encodeArcha } from '@archa/formats';
import type { Channel, ChatMessage, Message } from '@archa/protocol';
import { newHost } from './host-helper';
import { assetDirFor, dataDirFor } from '@archa/protocol/node';
import { assetFile, externalizeSrc, inlineSrc, storeBytes } from '@archa/protocol/node';
import { ChatStore } from '@archa/agents';
import { canvasFit, CANVAS_MAX_SIDE, fitBudget, INLINE_BUDGET, INLINE_MAX_SIDE, shotsDir, sweepShots } from '@archa/protocol/node';
import { allowedAssetFile } from '../src/main/asset-paths';

/* Data folder, document refs and screenshots (blueprint FILE_FORMATS/01 → Data folder, MCP/01, RENDERING/03). */

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DATA = `data:image/png;base64,${PNG}`;
const user = { kind: 'user' as const, id: 'u' };

let home: string;
let work: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-assets-'));
  work = mkdtempSync(join(tmpdir(), 'archa-work-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const conn = { author: user } as never;
const call = <T>(ws: ReturnType<typeof newHost>, method: string, params: unknown): Promise<T> =>
  Promise.resolve((ws.handlers as unknown as Record<string, (p: unknown, c: unknown) => T>)[method]!(params, conn));

function addImage(ws: ReturnType<typeof newHost>, docId: string) {
  const s = ws.ctx.session(docId);
  const { ops, rootId } = insertOpsFor({ type: 'image', name: 'Photo', width: 10, height: 10, src: DATA } as never, s.doc.pages[0]!.rootId);
  s.apply({ author: user, label: 'paste', baseRevision: s.revision, ops });
  return rootId;
}

describe('data folder', () => {
  it('writes pasted base64 images to the folder and keeps only an asset: reference', () => {
    const ws = newHost();
    const docId = ws.ctx.summaries()[0]!.id;
    const id = addImage(ws, docId);
    const node = ws.ctx.session(docId).doc.get(id)!;
    expect(node.type === 'image' && node.src).toMatch(/^asset:images\/[0-9a-f]{24}\.png$/);
    const file = assetFile(ws.ctx.assetDir(docId), (node as { src: string }).src)!;
    expect(readFileSync(file).toString('base64')).toBe(PNG);
  });

  it('first save moves the folder next to the file as <name>-data, and the file has no base64', async () => {
    const ws = newHost();
    const docId = ws.ctx.summaries()[0]!.id;
    const id = addImage(ws, docId);
    const runtimeDir = ws.ctx.assetDir(docId);
    const path = join(work, 'landing.archa');
    await call(ws, 'doc.save', { docId, path });
    expect(ws.ctx.assetDir(docId)).toBe(join(work, 'landing-data', 'assets'));
    expect(existsSync(runtimeDir)).toBe(false);
    const src = (ws.ctx.session(docId).doc.get(id) as { src: string }).src;
    expect(existsSync(assetFile(join(work, 'landing-data', 'assets'), src)!)).toBe(true);
    const zip = unzipSync(new Uint8Array(readFileSync(path)));
    const page = Object.keys(zip).find((k) => k.startsWith('pages/'))!;
    expect(strFromU8(zip[page]!)).not.toContain('base64');
    expect(ws.ctx.summaries()[0]!.assetDir).toBe(join(work, 'landing-data', 'assets'));
    expect(ws.ctx.summaries()[0]!.dataDir).toBe(join(work, 'landing-data'));
  });

  it('opening an older file moves its base64 images out and marks it to save', async () => {
    const s = new DocumentSession(ArchaDocument.create('Old'));
    s.apply({ author: user, label: 'x', baseRevision: 0, ops: insertOpsFor({ type: 'image', name: 'Photo', src: DATA } as never, s.doc.pages[0]!.rootId).ops });
    const path = join(work, 'old.archa');
    writeFileSync(path, encodeArcha(s.doc.toData()));
    const ws = newHost();
    const { docId } = await call<{ docId: string }>(ws, 'doc.open', { path });
    const img = Object.values(ws.ctx.session(docId).doc.toData().nodes).find((n) => n.type === 'image') as { src: string };
    expect(img.src.startsWith('asset:images/')).toBe(true);
    expect(readdirSync(join(work, 'old-data', 'assets', 'images'))).toHaveLength(1);
    expect(ws.ctx.session(docId).dirty).toBe(true);
  });

  it('inlines asset: images for exports and refuses references outside the folder', () => {
    const dir = join(work, 'x-asset');
    const ref = externalizeSrc(dir, DATA);
    expect(inlineSrc(dir, ref)).toBe(DATA);
    expect(assetFile(dir, 'asset:../escape.png')).toBeNull();
    expect(assetFile(dir, 'asset:images/../../escape.png')).toBeNull();
    expect(externalizeSrc(dir, 'https://example.com/a.png')).toBe('https://example.com/a.png');
  });

  it('names the folder after the file, and serves only images inside data folders', () => {
    expect(dataDirFor(join(work, 'Sehati.archa'), 'd1')).toBe(join(work, 'Sehati-data'));
    expect(assetDirFor(join(work, 'Sehati.archa'), 'd1')).toBe(join(work, 'Sehati-data', 'assets'));
    expect(allowedAssetFile(join(work, 'Sehati-data', 'assets', 'images', 'a.png'), home)).toBe(true);
    expect(allowedAssetFile(join(work, 'Sehati-data', 'chats', 'attachments', 't', 'a.png'), home)).toBe(true);
    expect(allowedAssetFile(join(work, 'Sehati-asset', 'images', 'a.png'), home)).toBe(true);
    expect(allowedAssetFile(join(home, 'runtime', 'data', 'd1', 'assets', 'images', 'a.png'), home)).toBe(true);
    expect(allowedAssetFile(join(work, 'secrets', 'a.png'), home)).toBe(false);
    expect(allowedAssetFile(join(work, 'Sehati-asset', 'notes.txt'), home)).toBe(false);
    expect(allowedAssetFile('images/a.png', home)).toBe(false);
  });

  it('files assets by type: images, svg, videos, fonts', () => {
    const dir = join(work, 'k-data', 'assets');
    expect(storeBytes(dir, Buffer.from('<svg/>'), 'svg')).toMatch(/^asset:svg\/[0-9a-f]{24}\.svg$/);
    expect(storeBytes(dir, Buffer.from('x'), 'mp4')).toMatch(/^asset:videos\//);
    expect(storeBytes(dir, Buffer.from('x'), 'woff2')).toMatch(/^asset:fonts\//);
    expect(storeBytes(dir, Buffer.from('x'), 'png')).toMatch(/^asset:images\//);
  });

  it('opening a pre-1.7.3 file moves its <name>-asset folder into <name>-data with the same references', async () => {
    const s = new DocumentSession(ArchaDocument.create('Legacy'));
    const path = join(work, 'legacy.archa');
    const old = join(work, 'legacy-asset');
    const ref = externalizeSrc(old, DATA); // asset:images/<hash>.png at the old folder's root
    s.apply({ author: user, label: 'x', baseRevision: 0, ops: insertOpsFor({ type: 'image', name: 'Photo', src: ref } as never, s.doc.pages[0]!.rootId).ops });
    writeFileSync(path, encodeArcha(s.doc.toData()));
    mkdirSync(join(old, 'chats'), { recursive: true });
    writeFileSync(join(old, 'chats', 't1.json'), JSON.stringify({ version: 1, threadId: 't1', agent: 'claude', createdAt: 1, updatedAt: 1, messages: [] }));
    mkdirSync(join(old, 'reference'), { recursive: true });
    writeFileSync(join(old, 'reference', 'mock-p1.json'), '{}');

    const ws = newHost();
    const { docId } = await call<{ docId: string }>(ws, 'doc.open', { path });
    const data = join(work, 'legacy-data');
    expect(existsSync(old)).toBe(false);
    expect(existsSync(assetFile(ws.ctx.assetDir(docId), ref)!)).toBe(true);
    expect(existsSync(join(data, 'chats', 't1.json'))).toBe(true);
    expect(existsSync(join(data, 'reference', 'mock-p1.json'))).toBe(true);
    expect(existsSync(join(data, 'assets', 'chats'))).toBe(false);
    expect(ws.ctx.session(docId).dirty).toBe(false);
  });
});

describe('document refs', () => {
  it('finds a document by id, .archa path or unique name, and lists the open ones when it cannot', async () => {
    const ws = newHost();
    const docId = ws.ctx.summaries()[0]!.id;
    const path = join(work, 'Brand.archa');
    await call(ws, 'doc.save', { docId, path });
    expect(ws.ctx.session(docId).id).toBe(docId);
    expect(ws.ctx.session(path).id).toBe(docId);
    expect(ws.ctx.session('Brand').id).toBe(docId);
    expect(() => ws.ctx.session('Nope')).toThrow(/not open.*Brand/);
  });
});

describe('screenshots', () => {
  /** A fake window: answers render requests; `sliced` makes it cut tall renders like the real renderer. */
  function rendererWs(sliced = false) {
    const ws = newHost();
    const reqs: Array<{ scale: number; slice?: number }> = [];
    const channel: Channel = {
      send: (m: Message) => {
        if (m.t !== 'evt' || m.event !== 'render.request') return;
        const r = m.data as { requestId: string; scale: number; slice?: number };
        reqs.push({ scale: r.scale, slice: r.slice });
        const reply = r.slice && sliced ? { slices: [PNG, PNG, PNG, PNG, PNG, PNG, PNG] } : { png: PNG };
        setTimeout(() => void call(ws, 'render.respond', { requestId: r.requestId, ...reply }));
      },
      onMessage: () => {},
    };
    ws.attach(channel, { kind: 'renderer', name: 'window' });
    return { ws, reqs };
  }
  function longPage(ws: ReturnType<typeof newHost>, width = 1440, height = 9000) {
    const s = ws.ctx.session();
    const { ops, rootId } = insertOpsFor({ type: 'frame', name: 'Long page', width, height } as never, s.doc.pages[0]!.rootId);
    s.apply({ author: user, label: 'x', baseRevision: 0, ops });
    return { s, rootId };
  }

  it('renders full size with no cap and keeps the file; a tall page comes back as labelled full-width slices', async () => {
    const { ws, reqs } = rendererWs(true);
    const { s, rootId } = longPage(ws);
    const shot = await ws.ctx.screenshot({ id: 'c1' } as never, s.id, rootId, 1);
    expect(reqs[0]).toEqual({ scale: 1, slice: undefined });
    expect(shot.width).toBe(1440);
    expect(shot.height).toBe(9000);
    expect(existsSync(shot.path!)).toBe(true);
    expect(shot.path!.startsWith(shotsDir())).toBe(true);
    expect(reqs[1]!.slice).toBe(1400);
    expect(shot.slices).toHaveLength(7);
    expect(shot.slices![0]).toMatchObject({ y0: 0, y1: 1400 });
    expect(shot.slices![6]).toMatchObject({ y0: 8400, y1: 9000 });
    expect(shot.png).toBeUndefined();
  });

  it('falls back to a preview past the vision limit when slicing is off or unavailable', async () => {
    const { ws, reqs } = rendererWs(false);
    const { s, rootId } = longPage(ws, 9000, 1440);
    const shot = await ws.ctx.screenshot({ id: 'c1' } as never, s.id, rootId, 1);
    expect(shot.slices).toBeUndefined();
    expect(shot.preview).toBe(true);
    expect(reqs[1]!.scale).toBeCloseTo(INLINE_MAX_SIDE / 9000, 5);
  });

  it('keeps inline replies under the MCP message limit', () => {
    const big = (n: number) => ({ data: 'x'.repeat(n) });
    expect(fitBudget([big(2_000_000), big(2_000_000), big(2_000_000), big(2_000_000)])).toMatchObject({ omitted: 1 });
    expect(fitBudget([big(100), big(100)]).kept).toHaveLength(2);
    expect(INLINE_BUDGET).toBeLessThan(10 * 1024 * 1024);
  });

  it('fits only what a canvas can hold, and sweeps old files', () => {
    expect(canvasFit(100, 100, 2)).toBe(2);
    expect(Math.max(40_000, 100) * canvasFit(40_000, 100, 1)).toBeCloseTo(CANVAS_MAX_SIDE, 3);
    const { ws } = rendererWs();
    void ws;
    sweepShots(Date.now() + 2 * 24 * 3600 * 1000);
    expect(existsSync(shotsDir()) ? readdirSync(shotsDir()) : []).toHaveLength(0);
  });
});

describe('chat history in the asset folder', () => {
  const msg = (threadId: string, text: string, ts: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id: `m${ts}`, docId: 'd1', runId: 'r1', threadId, role: 'user', agent: 'claude', persona: 'Swift Heron', text, ts, ...extra });

  it('writes one JSON file per conversation and loads them back', () => {
    const dir = join(work, 'p-asset');
    const store = new ChatStore(() => dir);
    store.append('d1', msg('t1', 'hello', 1));
    store.append('d1', msg('t2', 'other', 2));
    store.append('d1', msg('t1', 'again', 3));
    expect(readdirSync(join(dir, 'chats')).sort()).toEqual(['t1.json', 't2.json']);
    const t1 = JSON.parse(readFileSync(join(dir, 'chats', 't1.json'), 'utf8'));
    expect(t1.messages.map((m: ChatMessage) => m.text)).toEqual(['hello', 'again']);
    const fresh = new ChatStore(() => dir);
    expect(fresh.list('dX').map((m) => m.text)).toEqual(['hello', 'other', 'again']);
    expect(fresh.list('dX')[0]!.docId).toBe('dX');
    fresh.deleteThread('dX', 't1');
    expect(readdirSync(join(dir, 'chats'))).toEqual(['t2.json']);
  });

  it('stores pasted images as attachment files, never base64', () => {
    const dir = join(work, 'p-asset');
    const store = new ChatStore(() => dir);
    const saved = store.saveImage('d1', 't1', 'image/png', PNG)!;
    expect(saved.ref).toMatch(/^asset:chats\/attachments\/t1\/[0-9a-f]{24}\.png$/);
    expect(readFileSync(saved.file).toString('base64')).toBe(PNG);
  });

  it('splits the old per-document .jsonl into thread files and moves its thumbnails out', () => {
    const legacy = join(home, 'chats');
    rmSync(legacy, { recursive: true, force: true });
    const dir = join(work, 'p-asset');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'd1.jsonl'), `${[msg('t1', 'a', 1, { images: [DATA] }), msg('t2', 'b', 2)].map((m) => JSON.stringify(m)).join('\n')}\n`);
    const store = new ChatStore(() => dir, () => legacy);
    const list = store.list('d1');
    expect(list.map((m) => m.text)).toEqual(['a', 'b']);
    expect(list[0]!.images![0]).toMatch(/^asset:chats\/attachments\/t1\//);
    expect(readdirSync(join(dir, 'chats')).filter((f) => f.endsWith('.json')).sort()).toEqual(['t1.json', 't2.json']);
    expect(existsSync(join(legacy, 'd1.jsonl.migrated'))).toBe(true);
  });
});

describe('image sources from agents', () => {
  it('copies a local image path or file:// URL into the folder', () => {
    const dir = join(work, 'y-asset');
    const photo = join(work, 'photo.png');
    writeFileSync(photo, Buffer.from(PNG, 'base64'));
    const a = externalizeSrc(dir, photo);
    expect(a).toMatch(/^asset:images\/[0-9a-f]{24}\.png$/);
    expect(externalizeSrc(dir, pathToFileURL(photo).href)).toBe(a);
    expect(externalizeSrc(dir, join(work, 'missing.png'))).toBe(join(work, 'missing.png'));
  });
});
