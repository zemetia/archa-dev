import type { BrowserCommand, BrowserReply, MainBridgeResponse } from '@archa/protocol';

/*
 * The browser's pages live in the main process; the core host forwards agent calls there
 * over parentPort and waits for the answer (blueprint BROWSER, "Process path").
 */

const pending = new Map<number, { resolve: (r: BrowserReply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
let seq = 0;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  process.parentPort.on('message', (e) => {
    const m = e.data as MainBridgeResponse;
    if (m?.type !== 'browser-result') return;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.reply);
    else p.reject(new Error(m.error));
  });
}

/** Longest action is `wait` (60 s) or a slow page load (30 s); allow headroom. */
export function callBrowser(cmd: BrowserCommand, agent: string): Promise<BrowserReply> {
  if (!process.parentPort) return Promise.reject(new Error('The browser needs the ArchaDev app (no main process in headless mode).'));
  listen();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser did not answer within 90 s.')); }, 90_000);
    pending.set(id, { resolve, reject, timer });
    process.parentPort.postMessage({ type: 'browser', id, agent, cmd });
  });
}
