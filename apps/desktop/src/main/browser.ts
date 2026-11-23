import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { nativeImage, session, WebContentsView, type BrowserWindow, type Rectangle } from 'electron';
import type { BrowserCommand, BrowserReply, BrowserState } from '@archa/protocol';
import { PAGE_LIB } from './browser-page';
import { addressToUrl, normalizeUrl } from './browser-url';
import { INLINE_BUDGET, INLINE_MAX_SIDE, saveShot } from '../core-host/shots';

/*
 * In-app browser the agent drives (blueprint BROWSER). Pages live in WebContentsViews on the
 * main window, in their own session, sandboxed and without a preload. Every agent action goes
 * through the Chrome DevTools Protocol, so input is trusted and screenshots are exact.
 */

const PARTITION = 'persist:archa-browser';
// Screenshots are not capped (the full PNG goes to a temporary file); only the inline copy shrinks past what vision models accept.
const MAX_FULL_PAGE_HEIGHT = 32_000; // what Chromium can capture in one surface

type ConsoleEntry = { seq: number; ts: number; level: string; text: string };
type Tab = { id: string; view: WebContentsView; log: ConsoleEntry[]; readSeq: number; reportedSeq: number };
type Point = { x: number; y: number; desc: string; covered?: string | null };
type Target = { ref?: string; selector?: string; text?: string };
type PageInfo = { url: string; title: string; vw: number; vh: number; sx: number; sy: number; pw: number; ph: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MODIFIERS: Record<string, number> = { alt: 1, option: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, shift: 8 };
const KEYS: Record<string, { code: string; keyCode: number; text?: string }> = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' }, Tab: { code: 'Tab', keyCode: 9 }, Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 }, Delete: { code: 'Delete', keyCode: 46 }, Space: { code: 'Space', keyCode: 32, text: ' ' },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 }, ArrowUp: { code: 'ArrowUp', keyCode: 38 }, ArrowRight: { code: 'ArrowRight', keyCode: 39 }, ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  Home: { code: 'Home', keyCode: 36 }, End: { code: 'End', keyCode: 35 }, PageUp: { code: 'PageUp', keyCode: 33 }, PageDown: { code: 'PageDown', keyCode: 34 }, Insert: { code: 'Insert', keyCode: 45 },
};
for (let i = 1; i <= 12; i++) KEYS[`F${i}`] = { code: `F${i}`, keyCode: 111 + i };

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e as Error); });
  });
}

export class BrowserManager {
  private tabs = new Map<string, Tab>();
  private activeId: string | null = null;
  private host: BrowserWindow | null = null;
  private bounds: Rectangle | null = null;
  private boundsWaiters: Array<() => void> = [];
  private seq = 0;
  private logSeq = 0;
  private agent: BrowserState['agent'] = null;
  private emulated: BrowserState['emulated'] = null;
  private sessionReady = false;

  /* ------------------------------- host + UI ------------------------------- */

  setHost(win: BrowserWindow) {
    if (this.host === win) return;
    for (const t of this.tabs.values()) {
      if (this.host && !this.host.isDestroyed()) this.host.contentView.removeChildView(t.view);
      win.contentView.addChildView(t.view);
    }
    this.host = win;
    this.bounds = null;
    this.layout();
  }

  hostClosed(win: BrowserWindow) {
    if (this.host === win) { this.host = null; this.bounds = null; }
  }

  /** The renderer reports where the browser pane is (null = pane hidden). */
  setBounds(r: Rectangle | null) {
    this.bounds = r && r.width > 0 && r.height > 0 ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
    this.layout();
    if (this.bounds) for (const w of this.boundsWaiters.splice(0)) w();
  }

  state(): BrowserState {
    return {
      tabs: [...this.tabs.values()].map((t) => {
        const wc = t.view.webContents;
        return { id: t.id, title: wc.getTitle() || 'New tab', url: wc.getURL(), loading: wc.isLoading(), canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() };
      }),
      activeId: this.activeId,
      agent: this.agent,
      emulated: this.emulated,
    };
  }

  private pushState() {
    if (this.host && !this.host.isDestroyed()) this.host.webContents.send('browser:state', this.state());
  }

  private layout() {
    for (const t of this.tabs.values()) {
      const show = !!this.bounds && t.id === this.activeId;
      if (show) t.view.setBounds(this.bounds!);
      t.view.setVisible(show);
    }
  }

  /** Opens the pane in the window (as the person would) and waits until it has a size, so pages paint. */
  private async reveal() {
    if (this.bounds) return;
    if (!this.host || this.host.isDestroyed()) throw new Error('No ArchaDev window is open to show the browser in.');
    if (this.host.isMinimized()) this.host.restore();
    this.host.webContents.send('browser:reveal');
    await withTimeout(new Promise<void>((r) => this.boundsWaiters.push(r)), 4000, 'The browser panel did not open — is the ArchaDev window visible?');
  }

  /** UI actions from the person (toolbar, tab strip). */
  async ui(action: string, arg?: string) {
    const tab = this.active();
    switch (action) {
      case 'navigate': {
        const t = tab ?? this.createTab();
        this.activate(t.id);
        void t.view.webContents.loadURL(addressToUrl(arg ?? '')).catch(() => { /* shown as an error page */ });
        break;
      }
      case 'back': tab?.view.webContents.navigationHistory.goBack(); break;
      case 'forward': tab?.view.webContents.navigationHistory.goForward(); break;
      case 'reload': tab?.view.webContents.reload(); break;
      case 'stop': tab?.view.webContents.stop(); break;
      case 'devtools': tab?.view.webContents.openDevTools({ mode: 'detach' }); break;
      case 'new': this.activate(this.createTab('about:blank').id); break;
      case 'switch': if (arg && this.tabs.has(arg)) this.activate(arg); break;
      case 'close': this.closeTab(arg ?? this.activeId ?? ''); break;
    }
    this.pushState();
  }

  /* --------------------------------- tabs ---------------------------------- */

  private setupSession() {
    if (this.sessionReady) return;
    this.sessionReady = true;
    const ses = session.fromPartition(PARTITION);
    // Sites see a normal Chrome, not "Electron/x ArchaDev/x" (some block unknown browsers).
    ses.setUserAgent(ses.getUserAgent().split(' ').filter((t) => !/^(Electron|@?archa)/i.test(t)).join(' '));
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write' || permission === 'fullscreen'));
  }

  private createTab(url?: string): Tab {
    if (!this.host || this.host.isDestroyed()) throw new Error('No ArchaDev window is open to show the browser in.');
    this.setupSession();
    const view = new WebContentsView({ webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    view.setBackgroundColor('#ffffff');
    view.setVisible(false);
    this.host.contentView.addChildView(view);
    const tab: Tab = { id: `t${++this.seq}`, view, log: [], readSeq: 0, reportedSeq: 0 };
    this.tabs.set(tab.id, tab);
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url: u }) => {
      try { this.activate(this.createTab(normalizeUrl(u)).id); } catch { /* refused scheme */ }
      return { action: 'deny' };
    });
    const push = () => this.pushState();
    for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'] as const) wc.on(ev as 'did-stop-loading', push);
    wc.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
      if (isMainFrame && code !== -3) this.record(tab, 'error', `[load] ${desc} (${code}) ${failedUrl}`);
    });
    wc.on('render-process-gone', (_e, d) => this.record(tab, 'error', `[crash] page process gone: ${d.reason}`));
    // Keys typed into a page never reach the app UI, so the pane shortcut is caught here.
    wc.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && (input.control || input.meta) && input.shift && input.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.host?.webContents.send('browser:toggle');
      }
    });
    this.attachDebugger(tab);
    if (url) void wc.loadURL(url).catch(() => { /* reported via did-fail-load */ });
    this.pushState();
    return tab;
  }

  private attachDebugger(tab: Tab) {
    const dbg = tab.view.webContents.debugger;
    if (dbg.isAttached()) return;
    dbg.attach('1.3');
    dbg.on('message', (_e, method: string, params: Record<string, unknown>) => this.onCdpEvent(tab, method, params));
    for (const domain of ['Page.enable', 'Runtime.enable', 'Log.enable']) void dbg.sendCommand(domain).catch(() => { /* page not ready yet */ });
  }

  private onCdpEvent(tab: Tab, method: string, p: Record<string, unknown>) {
    if (method === 'Runtime.consoleAPICalled') {
      const args = (p.args as Array<{ value?: unknown; description?: string; unserializableValue?: string }>) ?? [];
      const text = args.map((a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description ?? a.unserializableValue ?? '')).join(' ');
      this.record(tab, String(p.type), text);
    } else if (method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails as { text?: string; exception?: { description?: string }; url?: string; lineNumber?: number };
      this.record(tab, 'error', `[exception] ${(d.exception?.description ?? d.text ?? '').split('\n').slice(0, 3).join(' | ')}${d.url ? ` (${d.url}:${(d.lineNumber ?? 0) + 1})` : ''}`);
    } else if (method === 'Log.entryAdded') {
      const e = p.entry as { level: string; text: string; url?: string };
      this.record(tab, e.level, `${e.text}${e.url ? ` (${e.url})` : ''}`);
    } else if (method === 'Page.javascriptDialogOpening') {
      // A native dialog would block the page and the agent; accept it and say so.
      this.record(tab, 'warning', `[dialog] ${String(p.type)}: "${String(p.message)}" — auto-accepted`);
      void tab.view.webContents.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true, promptText: String(p.defaultPrompt ?? '') }).catch(() => {});
    }
  }

  private record(tab: Tab, level: string, text: string) {
    if (text.startsWith('Electron Security Warning')) return; // dev-only noise about our shell, not the page
    tab.log.push({ seq: ++this.logSeq, ts: Date.now(), level: level === 'warn' ? 'warning' : level, text: text.slice(0, 2000) });
    if (tab.log.length > 500) tab.log.shift();
  }

  private activate(id: string) {
    this.activeId = id;
    this.layout();
    this.pushState();
  }

  private closeTab(id: string) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.tabs.delete(id);
    if (this.host && !this.host.isDestroyed()) this.host.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    if (this.activeId === id) this.activeId = [...this.tabs.keys()].at(-1) ?? null;
    if (!this.activeId) this.emulated = null;
    this.layout();
    this.pushState();
  }

  private active(): Tab | null {
    return this.activeId ? this.tabs.get(this.activeId) ?? null : null;
  }

  /* ------------------------------ CDP helpers ------------------------------ */

  private async cdp<T = Record<string, unknown>>(tab: Tab, method: string, params?: Record<string, unknown>): Promise<T> {
    this.attachDebugger(tab);
    return (await tab.view.webContents.debugger.sendCommand(method, params)) as T;
  }

  /** Runs `body` (an expression using `A`, the page library) in the page and returns its JSON value. */
  private async page<T>(tab: Tab, body: string): Promise<T> {
    const r = await this.cdp<{ result: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>(tab, 'Runtime.evaluate', {
      expression: `${PAGE_LIB};((A) => (${body}))(window.__archa)`, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(exceptionText(r.exceptionDetails));
    return r.result.value as T;
  }

  private info(tab: Tab) {
    return this.page<PageInfo>(tab, 'A.info()');
  }

  private async locate(tab: Tab, t: Target, x?: number, y?: number): Promise<Point> {
    if (t.ref || t.selector || t.text) return this.page<Point>(tab, `A.point(${JSON.stringify(t)})`);
    if (x !== undefined && y !== undefined) return { x, y, desc: `point (${x}, ${y})` };
    throw new Error('Give a target: ref (from snapshot), selector, text, or x + y (viewport CSS px).');
  }

  private mouse(tab: Tab, type: string, p: { x: number; y: number }, extra: Record<string, unknown> = {}) {
    return this.cdp(tab, 'Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...extra });
  }

  private async click(tab: Tab, p: Point, button = 'left', clickCount = 1) {
    await this.mouse(tab, 'mouseMoved', p);
    const mask = button === 'left' ? 1 : button === 'right' ? 2 : 4;
    for (let i = 1; i <= clickCount; i++) {
      await this.mouse(tab, 'mousePressed', p, { button, buttons: mask, clickCount: i });
      await this.mouse(tab, 'mouseReleased', p, { button, buttons: 0, clickCount: i });
    }
    void this.page(tab, `A.ripple(${p.x}, ${p.y})`).catch(() => {});
  }

  private async press(tab: Tab, combo: string) {
    const parts = combo.split('+').filter(Boolean);
    const keyName = combo.endsWith('++') ? '+' : parts.pop() ?? '';
    let modifiers = 0;
    for (const m of parts) {
      const bit = m.toLowerCase() === 'mod' ? (process.platform === 'darwin' ? 4 : 2) : MODIFIERS[m.toLowerCase()];
      if (bit === undefined) throw new Error(`Unknown modifier "${m}" in "${combo}". Use Control, Shift, Alt, Meta or Mod.`);
      modifiers |= bit;
    }
    const alias: Record<string, string> = { esc: 'Escape', return: 'Enter', del: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ' ': 'Space' };
    const name = alias[keyName.toLowerCase()] ?? Object.keys(KEYS).find((k) => k.toLowerCase() === keyName.toLowerCase());
    let def: { key: string; code: string; keyCode: number; text?: string };
    if (name) def = { key: name === 'Space' ? ' ' : name, ...KEYS[name]! };
    else if ([...keyName].length === 1) {
      const ch = modifiers & 8 && /[a-z]/.test(keyName) ? keyName.toUpperCase() : keyName;
      const up = keyName.toUpperCase();
      def = { key: ch, code: /[a-z]/i.test(keyName) ? `Key${up}` : /\d/.test(keyName) ? `Digit${keyName}` : '', keyCode: /[a-z\d]/i.test(keyName) ? up.charCodeAt(0) : keyName.charCodeAt(0), text: ch };
    } else throw new Error(`Unknown key "${keyName}". Use a single character or a name like Enter, Tab, Escape, Backspace, ArrowDown, PageDown, F5.`);
    // With Control/Alt/Meta held a key is a shortcut, not text.
    const text = modifiers & 7 ? undefined : def.text;
    const base = { key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode, modifiers };
    await this.cdp(tab, 'Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) });
    await this.cdp(tab, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  /** After input: give the page a moment, and wait out any navigation it started. */
  private async settle(tab: Tab, ms = 150) {
    await sleep(ms);
    const wc = tab.view.webContents;
    if (wc.isLoading()) await withTimeout(new Promise<void>((r) => wc.once('did-stop-loading', () => r())), 15_000, '').catch(() => {});
    await sleep(80);
  }

  private async load(tab: Tab, url: string): Promise<string> {
    const wc = tab.view.webContents;
    try {
      await withTimeout(wc.loadURL(url), 30_000, 'timeout');
      return '';
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'timeout') return 'Still loading after 30 s — the page may be usable; snapshot to check.';
      if (/ERR_ABORTED/.test(msg)) return ''; // redirect or client-side navigation replaced the load
      return `Load failed: ${msg.replace(/^.*?(ERR_[A-Z_]+).*$/s, '$1')}. Check the URL or that the server is running.`;
    }
  }

  private async capture(tab: Tab, opts: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } }) {
    const i = await this.info(tab);
    let clip = opts.clip;
    if (!clip && opts.fullPage) clip = { x: 0, y: 0, width: i.vw, height: Math.min(i.ph, MAX_FULL_PAGE_HEIGHT) };
    const r = await withTimeout(
      this.cdp<{ data: string }>(tab, 'Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { captureBeyondViewport: true, clip: { ...clip, scale: 1 } } : {}) }),
      15_000, 'Screenshot timed out — the page did not paint. Make sure the ArchaDev window is not minimised.',
    );
    const path = saveShot(r.data, 'browser', tab.id);
    let img = nativeImage.createFromBuffer(Buffer.from(r.data, 'base64'));
    const cssW = clip ? clip.width : i.vw;
    const cssH = clip ? clip.height : i.vh;
    // Normalise to CSS pixels so image coordinates = page coordinates; shrink only past the vision-model limit.
    let factor = Math.min(1, INLINE_MAX_SIDE / Math.max(cssW, cssH));
    const w = Math.max(1, Math.round(cssW * factor));
    if (img.getSize().width !== w) img = img.resize({ width: w, quality: 'best' });
    let png = img.toPNG().toString('base64');
    // Keep the reply under the MCP message limit; the full-size file is on disk either way.
    for (let i = 0; i < 4 && png.length > INLINE_BUDGET; i++) {
      factor *= Math.sqrt(INLINE_BUDGET / png.length) * 0.9;
      img = img.resize({ width: Math.max(1, Math.round(cssW * factor)), quality: 'best' });
      png = img.toPNG().toString('base64');
    }
    return { png, path, factor, cssW: Math.round(cssW), cssH: Math.round(cssH), info: i, cut: !opts.clip && opts.fullPage && i.ph > MAX_FULL_PAGE_HEIGHT };
  }

  /** Footer every reply carries: where the page is now, and errors since the last reply. */
  private async footer(tab: Tab, beforeUrl?: string) {
    const lines: string[] = [];
    const wc = tab.view.webContents;
    const url = wc.getURL();
    if (beforeUrl !== undefined && url !== beforeUrl) lines.push(`Navigated → ${url} · "${wc.getTitle()}"`);
    const fresh = tab.log.filter((e) => e.seq > tab.reportedSeq && (e.level === 'error' || e.level === 'warning' && e.text.startsWith('[dialog]')));
    tab.reportedSeq = this.logSeq;
    if (fresh.length) {
      lines.push(`New page errors/dialogs (${fresh.length}):`, ...fresh.slice(-5).map((e) => `  ${e.text.slice(0, 300)}`));
      if (fresh.length > 5) lines.push('  … use console for the rest');
    }
    return lines;
  }

  /* ------------------------------ agent entry ------------------------------ */

  async run(cmd: BrowserCommand, agentName: string): Promise<BrowserReply> {
    this.agent = { name: agentName, action: cmd.action, ts: Date.now() };
    await this.reveal();
    this.pushState();
    try {
      return await this.dispatch(cmd);
    } finally {
      this.agent = { name: agentName, action: cmd.action, ts: Date.now() };
      this.pushState();
    }
  }

  private requireTab(): Tab {
    const tab = this.active();
    if (!tab) throw new Error('No browser tab is open. Start with browser({ action: "open", url }).');
    return tab;
  }

  private async dispatch(cmd: BrowserCommand): Promise<BrowserReply> {
    const target: Target = { ref: cmd.ref, selector: cmd.selector, text: cmd.text };
    const hasTarget = !!(cmd.ref || cmd.selector || cmd.text);

    if (cmd.action === 'tabs') return this.tabsCommand(cmd);
    if (cmd.action === 'open') {
      if (!cmd.url) throw new Error('open needs url.');
      const url = normalizeUrl(cmd.url);
      const tab = this.active() ?? this.createTab();
      this.activate(tab.id);
      const note = await this.load(tab, url);
      await this.settle(tab, 50);
      const i = await this.info(tab).catch(() => null);
      return { text: [
        `Opened ${tab.view.webContents.getURL()} · "${tab.view.webContents.getTitle()}" (tab ${tab.id})`,
        ...(i ? [`Viewport ${i.vw}×${i.vh}, page height ${i.ph}.`] : []),
        ...(note ? [note] : []),
        ...(await this.footer(tab)),
        'Next: snapshot for refs, or screenshot to look at it.',
      ].join('\n') };
    }

    const tab = this.requireTab();
    const wc = tab.view.webContents;
    const before = wc.getURL();
    const out: string[] = [];
    let png: string | undefined;

    switch (cmd.action) {
      case 'back':
      case 'forward': {
        const h = wc.navigationHistory;
        if (cmd.action === 'back' ? !h.canGoBack() : !h.canGoForward()) throw new Error(`Nothing to go ${cmd.action} to.`);
        if (cmd.action === 'back') h.goBack(); else h.goForward();
        await this.settle(tab, 300);
        out.push(`Went ${cmd.action}.`);
        break;
      }
      case 'reload':
        wc.reload();
        await this.settle(tab, 300);
        out.push('Reloaded.');
        break;
      case 'snapshot':
        out.push(await this.page<string>(tab, `A.snapshot(${JSON.stringify({ target: hasTarget ? target : undefined, interactiveOnly: cmd.interactiveOnly, viewportOnly: cmd.viewportOnly })})`));
        break;
      case 'screenshot': {
        let legend: string[] = [];
        let clip: { x: number; y: number; width: number; height: number } | undefined;
        let what = cmd.fullPage ? 'full page' : 'viewport';
        if (hasTarget) {
          const r = await this.page<{ x: number; y: number; width: number; height: number; desc: string }>(tab, `A.rectOf(${JSON.stringify(target)})`);
          if (r.width < 1 || r.height < 1) throw new Error(`${r.desc} has no size to capture.`);
          clip = { x: r.x, y: r.y, width: r.width, height: r.height };
          what = r.desc;
        }
        if (cmd.labels) {
          await this.page(tab, `A.snapshot({ interactiveOnly: true, viewportOnly: ${!cmd.fullPage} })`);
          legend = await this.page<string[]>(tab, 'A.showLabels()');
        }
        try {
          const shot = await this.capture(tab, { fullPage: cmd.fullPage, clip });
          png = shot.png;
          const i = shot.info;
          out.push(`Screenshot of ${what}: ${shot.cssW}×${shot.cssH} CSS px${shot.cut ? ` (cut at ${MAX_FULL_PAGE_HEIGHT} of ${i.ph})` : ''}. URL ${i.url}`);
          if (shot.factor === 1) out.push(clip || cmd.fullPage ? 'Image is 1:1 with page px.' : 'Image is 1:1: an image pixel (x, y) is a click target {x, y}.');
          else out.push(`Image scaled ×${shot.factor.toFixed(3)}: divide image pixels by ${shot.factor.toFixed(3)} to get page px.`);
          if (cmd.fullPage) out.push(`Full-page y is document y; viewport y = document y − scrollY (now ${i.sy}).`);
          out.push(`Full-size PNG (device px, temporary): ${shot.path}`);
          if (legend.length) out.push(`Labelled refs (${legend.length}):`, ...legend.slice(0, 120).map((l) => `  ${l}`));
        } finally {
          if (cmd.labels) await this.page(tab, 'A.hideLabels()').catch(() => {});
        }
        break;
      }
      case 'element': {
        if (!hasTarget) throw new Error('element needs a target: ref, selector or text.');
        const d = await this.page<{ desc: string; box: Rectangle; styles: Record<string, string>; html: string }>(tab, `A.details(${JSON.stringify(target)})`);
        out.push(`${d.desc} · box ${d.box.x},${d.box.y} ${d.box.width}×${d.box.height} (viewport px)`, 'Computed styles:', ...Object.entries(d.styles).map(([k, v]) => `  ${k}: ${v}`), 'outerHTML:', d.html);
        break;
      }
      case 'console': {
        const entries = cmd.all ? tab.log : tab.log.filter((e) => e.seq > tab.readSeq);
        tab.readSeq = this.logSeq;
        tab.reportedSeq = Math.max(tab.reportedSeq, this.logSeq);
        out.push(entries.length ? `${entries.length} console entr${entries.length === 1 ? 'y' : 'ies'}${cmd.all ? '' : ' since last read'}:` : 'Console is quiet.');
        for (const e of entries.slice(-150)) out.push(`  [${e.level}] ${e.text}`);
        if (cmd.clear) tab.log.length = 0;
        break;
      }
      case 'click': {
        const p = await this.locate(tab, target, cmd.x, cmd.y);
        await this.click(tab, p, cmd.button ?? 'left', cmd.clickCount ?? 1);
        await this.settle(tab);
        out.push(`${cmd.clickCount === 2 ? 'Double-clicked' : cmd.button === 'right' ? 'Right-clicked' : 'Clicked'} ${p.desc} at (${p.x}, ${p.y}).`);
        if (p.covered) out.push(`Warning: ${p.covered} was on top at that point and got the click. Close the overlay first, or target it.`);
        break;
      }
      case 'hover': {
        const p = await this.locate(tab, target, cmd.x, cmd.y);
        await this.mouse(tab, 'mouseMoved', p);
        await sleep(200);
        out.push(`Hovering ${p.desc} at (${p.x}, ${p.y}).`);
        break;
      }
      case 'type': {
        if (cmd.text === undefined && !cmd.clear) throw new Error('type needs text (or clear: true).');
        const into: Target = { ref: cmd.ref, selector: cmd.selector };
        const targeted = !!(into.ref || into.selector);
        if (targeted) await this.click(tab, await this.locate(tab, into));
        if (cmd.clear) {
          if (await this.page<boolean>(tab, `A.prepareClear(${targeted ? JSON.stringify(into) : 'null'})`)) await this.press(tab, 'Backspace');
        }
        if (cmd.text) await this.cdp(tab, 'Input.insertText', { text: cmd.text });
        // Read the field before Enter: a submit can navigate, and then the focus is the new page's body.
        const field = await this.page<string>(tab, 'A.focused()').catch(() => 'the focused element');
        if (cmd.submit) await this.press(tab, 'Enter');
        await this.settle(tab);
        const value = await this.page<string | null>(tab, `A.valueOf(${targeted && !cmd.submit ? JSON.stringify(into) : 'null'})`).catch(() => null);
        out.push(`Typed ${cmd.text?.length ?? 0} chars into ${field}${cmd.clear ? ' (cleared first)' : ''}${cmd.submit ? ', then pressed Enter' : ''}.`);
        if (value !== null && !cmd.submit) out.push(`Value now: "${value}"`);
        break;
      }
      case 'press': {
        if (!cmd.key) throw new Error('press needs key, e.g. "Enter" or "Control+a".');
        await this.press(tab, cmd.key);
        await this.settle(tab);
        out.push(`Pressed ${cmd.key}. Focus: ${await this.page<string>(tab, 'A.focused()').catch(() => '?')}`);
        break;
      }
      case 'scroll': {
        const i0 = await this.info(tab);
        if (cmd.edge) {
          await this.page(tab, `A.scrollEdge(${hasTarget ? JSON.stringify(target) : 'null'}, ${JSON.stringify(cmd.edge)})`);
        } else if (cmd.dx === undefined && cmd.dy === undefined) {
          if (!hasTarget) throw new Error('scroll needs dy/dx, edge, or a target to scroll into view.');
          out.push(`Scrolled ${await this.page<string>(tab, `A.scrollIntoView(${JSON.stringify(target)})`)} into view.`);
        } else {
          const p = hasTarget || cmd.x !== undefined ? await this.locate(tab, target, cmd.x, cmd.y) : { x: Math.round(i0.vw / 2), y: Math.round(i0.vh / 2), desc: 'page' };
          await this.mouse(tab, 'mouseWheel', p, { deltaX: cmd.dx ?? 0, deltaY: cmd.dy ?? 0 });
        }
        await sleep(350);
        const i1 = await this.info(tab);
        const moved = i1.sx !== i0.sx || i1.sy !== i0.sy;
        out.push(`Page scroll ${i0.sx},${i0.sy} → ${i1.sx},${i1.sy} (page ${i1.pw}×${i1.ph}, viewport ${i1.vw}×${i1.vh}).${moved || hasTarget ? '' : ' The page did not move: at the edge, or the area under the pointer scrolls on its own — target it.'}`);
        break;
      }
      case 'select': {
        if (!hasTarget || cmd.value === undefined) throw new Error('select needs a target and value.');
        out.push(`Selected "${await this.page<string>(tab, `A.selectOption(${JSON.stringify(target)}, ${JSON.stringify(cmd.value)})`)}".`);
        await this.settle(tab);
        break;
      }
      case 'drag': {
        const from = await this.locate(tab, target, cmd.x, cmd.y);
        const to = await this.locate(tab, { ref: cmd.toRef, selector: cmd.toSelector }, cmd.toX, cmd.toY);
        await this.mouse(tab, 'mouseMoved', from);
        await this.mouse(tab, 'mousePressed', from, { button: 'left', buttons: 1, clickCount: 1 });
        for (let s = 1; s <= 12; s++) {
          await this.mouse(tab, 'mouseMoved', { x: from.x + ((to.x - from.x) * s) / 12, y: from.y + ((to.y - from.y) * s) / 12 }, { button: 'left', buttons: 1 });
          await sleep(16);
        }
        await this.mouse(tab, 'mouseReleased', to, { button: 'left', buttons: 0, clickCount: 1 });
        await this.settle(tab);
        out.push(`Dragged ${from.desc} (${from.x}, ${from.y}) → ${to.desc} (${Math.round(to.x)}, ${Math.round(to.y)}).`, 'Pointer-based drag; native HTML5 draggable needs cdp Input.dispatchDragEvent.');
        break;
      }
      case 'upload': {
        if (!hasTarget || !cmd.files?.length) throw new Error('upload needs a target (the <input type=file>) and files.');
        const missing = cmd.files.filter((f) => !isAbsolute(f) || !existsSync(f));
        if (missing.length) throw new Error(`Files must be absolute paths that exist: ${missing.join(', ')}`);
        const r = await this.cdp<{ result: { objectId?: string }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>(tab, 'Runtime.evaluate', {
          expression: `${PAGE_LIB};window.__archa.resolve(${JSON.stringify(target)})`, returnByValue: false,
        });
        if (r.exceptionDetails || !r.result.objectId) throw new Error(r.exceptionDetails ? exceptionText(r.exceptionDetails) : 'Target not found.');
        await this.cdp(tab, 'DOM.setFileInputFiles', { files: cmd.files, objectId: r.result.objectId });
        await this.settle(tab);
        out.push(`Attached ${cmd.files.length} file(s).`);
        break;
      }
      case 'wait': {
        const cond = { selector: cmd.selector, text: cmd.text };
        if (!cond.selector && !cond.text) {
          await sleep(cmd.ms ?? 1000);
          out.push(`Waited ${cmd.ms ?? 1000} ms.`);
          break;
        }
        const limit = cmd.timeout ?? 10_000;
        const start = Date.now();
        let met = false;
        while (Date.now() - start < limit) {
          const here = await this.page<boolean>(tab, `A.present(${JSON.stringify(cond)})`).catch(() => false);
          if (here !== !!cmd.gone) { met = true; break; }
          await sleep(200);
        }
        const what = cond.selector ? `selector "${cond.selector}"` : `text "${cond.text}"`;
        if (!met) throw new Error(`Timed out after ${limit} ms waiting for ${what} to ${cmd.gone ? 'disappear' : 'appear'}. Snapshot or screenshot to see the page.`);
        out.push(`${what} ${cmd.gone ? 'is gone' : 'is there'} after ${Date.now() - start} ms.`);
        break;
      }
      case 'evaluate': {
        if (!cmd.expression) throw new Error('evaluate needs expression.');
        const r = await this.cdp<{ result: { type: string; value?: unknown; description?: string }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>(tab, 'Runtime.evaluate', {
          expression: cmd.expression, returnByValue: true, awaitPromise: true, userGesture: true, replMode: true,
        });
        if (r.exceptionDetails) throw new Error(`Page threw: ${exceptionText(r.exceptionDetails)}`);
        const v = r.result.type === 'undefined' ? 'undefined' : r.result.value !== undefined ? JSON.stringify(r.result.value, null, 2) : r.result.description ?? String(r.result.type);
        out.push(v.length > 20_000 ? `${v.slice(0, 20_000)}\n… (${v.length - 20_000} more chars)` : v);
        await this.settle(tab, 50);
        break;
      }
      case 'resize': {
        if (cmd.reset) {
          await this.cdp(tab, 'Emulation.clearDeviceMetricsOverride');
          await this.cdp(tab, 'Emulation.setTouchEmulationEnabled', { enabled: false });
          this.emulated = null;
        } else {
          if (!cmd.width || !cmd.height) throw new Error('resize needs width and height (or reset: true).');
          await this.cdp(tab, 'Emulation.setDeviceMetricsOverride', { width: cmd.width, height: cmd.height, deviceScaleFactor: 0, mobile: !!cmd.mobile });
          await this.cdp(tab, 'Emulation.setTouchEmulationEnabled', { enabled: !!cmd.mobile, maxTouchPoints: cmd.mobile ? 5 : 1 });
          this.emulated = { width: cmd.width, height: cmd.height, mobile: !!cmd.mobile };
        }
        await sleep(250);
        const i = await this.info(tab);
        out.push(`Viewport now ${i.vw}×${i.vh}${this.emulated?.mobile ? ' (mobile, touch)' : ''}. Page height ${i.ph}.`);
        if (this.emulated?.mobile && i.vw !== this.emulated.width) out.push(`Layout is ${i.vw} px wide on a ${this.emulated.width} px screen: the page has no <meta name="viewport">, so phones render it zoomed out like this too.`);
        break;
      }
      case 'cdp': {
        if (!cmd.method) throw new Error('cdp needs method.');
        const r = await this.cdp<Record<string, unknown>>(tab, cmd.method, cmd.params);
        if (cmd.method === 'Page.captureScreenshot' && typeof r.data === 'string') { png = r.data; out.push('Screenshot (device pixels).'); break; }
        const json = JSON.stringify(r, null, 2) ?? 'null';
        out.push(json.length > 20_000 ? `${json.slice(0, 20_000)}\n… (${json.length - 20_000} more chars)` : json);
        break;
      }
    }

    out.push(...(await this.footer(tab, before)));
    return { text: out.join('\n'), png };
  }

  private tabsCommand(cmd: BrowserCommand): BrowserReply {
    const op = cmd.op ?? 'list';
    if (op === 'new') this.activate(this.createTab(cmd.url ? normalizeUrl(cmd.url) : 'about:blank').id);
    else if (op === 'switch' || op === 'close') {
      if (!cmd.tabId || !this.tabs.has(cmd.tabId)) throw new Error(`No tab "${cmd.tabId ?? ''}". Tabs: ${[...this.tabs.keys()].join(', ') || 'none'}`);
      if (op === 'switch') this.activate(cmd.tabId); else this.closeTab(cmd.tabId);
    }
    const s = this.state();
    return { text: [`${s.tabs.length} tab(s):`, ...s.tabs.map((t) => `  ${t.id === s.activeId ? '*' : ' '} ${t.id}  ${t.title}  ${t.url}`), ...(op === 'new' && cmd.url ? ['New tab is loading; wait or snapshot next.'] : [])].join('\n') };
  }
}

function exceptionText(d: { exception?: { description?: string }; text?: string }) {
  return (d.exception?.description ?? d.text ?? 'Unknown page error').split('\n')[0]!.replace(/^(Uncaught )?Error: /, '');
}

