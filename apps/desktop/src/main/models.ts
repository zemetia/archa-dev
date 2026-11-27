import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { net, utilityProcess, type UtilityProcess, type WebContents } from 'electron';
import { z } from 'zod';
import { paths } from '@archa/protocol/node';

/*
 * On-device background removal (blueprint RENDERING/04). The model is BiRefNet lite (MIT licence,
 * ONNX export by onnx-community), downloaded once on first use into ARCHA_HOME/cache/models — a
 * derivable cache: deleting it only means downloading again. It runs on the CPU in the ML host
 * (ml-host.ts), a utility process started on demand and closed when idle.
 */

const MODEL = { file: 'birefnet-lite.onnx', url: 'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx', bytes: 224_000_000 };
const SIZE = 1024;
/** The ML host holds ~1 GB while loaded: close it after this long without a request. */
const IDLE_MS = 3 * 60_000;

export const segmentArgs = z.object({ rgb: z.instanceof(Uint8Array).refine((b) => b.length === SIZE * SIZE * 3, 'Expected 1024×1024 RGB') });

const modelsDir = paths.models;
let downloading: Promise<string> | null = null;

/** Path of the model, downloading it first when missing. Progress goes to `sender` as `model:progress`. */
function ensureModel(sender: WebContents): Promise<string> {
  const file = join(modelsDir(), MODEL.file);
  if (existsSync(file) && statSync(file).size > 1_000_000) return Promise.resolve(file);
  downloading ??= download(file, (received, total) => {
    if (!sender.isDestroyed()) sender.send('model:progress', { received, total });
  }).finally(() => { downloading = null; });
  return downloading;
}

async function download(file: string, progress: (received: number, total: number) => void): Promise<string> {
  mkdirSync(modelsDir(), { recursive: true });
  const part = `${file}.part`;
  const res = await net.fetch(MODEL.url);
  if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || MODEL.bytes;
  const out = createWriteStream(part);
  let received = 0, last = 0;
  progress(0, total);
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      if (received - last > 2_000_000) { last = received; progress(received, total); }
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
  } catch (e) {
    out.destroy();
    rmSync(part, { force: true });
    throw new Error(`Model download failed: ${(e as Error).message}`);
  }
  if (received < total * 0.98) { rmSync(part, { force: true }); throw new Error('Model download was cut off — try again'); }
  renameSync(part, file);
  // 100%: the UI switches from "downloading" to "removing".
  progress(total, total);
  return file;
}

/* --------------------------------- ML host -------------------------------- */

let host: UtilityProcess | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (m: Uint8Array) => void; reject: (e: Error) => void }>();

function mlHost(): UtilityProcess {
  if (host) return host;
  const child = utilityProcess.fork(join(__dirname, 'ml-host.js'), [], { serviceName: 'ArchaDev ML', stdio: 'inherit' });
  child.on('message', (msg: { type?: string; id?: number; mask?: Uint8Array; error?: string }) => {
    if (msg?.type !== 'segment-result' || typeof msg.id !== 'number') return;
    const w = waiting.get(msg.id);
    waiting.delete(msg.id);
    if (!w) return;
    if (msg.mask) w.resolve(new Uint8Array(msg.mask));
    else w.reject(new Error(msg.error ?? 'Background removal failed'));
  });
  child.on('exit', () => {
    if (host === child) host = null;
    for (const w of waiting.values()) w.reject(new Error('The background removal process stopped — try again'));
    waiting.clear();
  });
  host = child;
  return child;
}

/** Foreground mask (1024×1024, 0-255) of a 1024×1024 RGB image. */
export async function segment(rgb: Uint8Array, sender: WebContents): Promise<Uint8Array> {
  const model = await ensureModel(sender);
  clearTimeout(idle);
  const id = nextId++;
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      mlHost().postMessage({ type: 'segment', id, model, rgb });
    });
  } finally {
    if (!waiting.size) idle = setTimeout(stopMlHost, IDLE_MS);
  }
}

export function stopMlHost() {
  clearTimeout(idle);
  host?.kill();
  host = null;
}
