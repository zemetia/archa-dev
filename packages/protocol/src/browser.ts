import { z } from 'zod';

/* ----------------------------------------------------------------------------
 * In-app browser the agent drives (blueprint BROWSER). One MCP tool, `browser`,
 * with an `action`; the main process owns the pages and drives them over CDP.
 * ------------------------------------------------------------------------- */

export const BROWSER_ACTIONS = [
  'open', 'search', 'back', 'forward', 'reload',
  'snapshot', 'screenshot', 'images', 'element', 'console', 'download',
  'click', 'hover', 'type', 'press', 'scroll', 'select', 'drag', 'upload',
  'wait', 'evaluate', 'resize', 'tabs', 'cdp',
] as const;
export type BrowserAction = (typeof BROWSER_ACTIONS)[number];

/** Flat shape so MCP clients get one simple input object; each action reads the fields it needs. */
export const browserInputShape = {
  action: z.enum(BROWSER_ACTIONS),
  url: z.string().max(8_000_000).optional().describe('open, tabs(op:new): URL, "localhost:3000", a domain, or a file path. download: image URL, data: URL or file path'),
  query: z.string().max(500).optional().describe('search: what to search for'),
  kind: z.enum(['web', 'images']).optional().describe('search: web results (default) or Google Images'),
  ref: z.string().max(32).optional().describe('Target element ref from snapshot or images, e.g. "e12"'),
  selector: z.string().max(1000).optional().describe('Target CSS selector (searches open shadow roots too)'),
  text: z.string().max(20_000).optional().describe('type: the text to type. click/hover/scroll/element: target by visible text. wait: text to appear'),
  x: z.number().optional().describe('Target viewport x in CSS px (as in a 1:1 screenshot)'),
  y: z.number().optional().describe('Target viewport y in CSS px'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('click: mouse button (default left)'),
  clickCount: z.number().int().min(1).max(3).optional().describe('click: 2 = double-click'),
  key: z.string().max(64).optional().describe('press: "Enter", "Tab", "Escape", "ArrowDown", "a", "Control+a", "Shift+Tab", "Meta+k"'),
  clear: z.boolean().optional().describe('type: clear the field first. console: empty the log after reading'),
  submit: z.boolean().optional().describe('type: press Enter afterwards'),
  dx: z.number().optional().describe('scroll: horizontal wheel delta in px'),
  dy: z.number().optional().describe('scroll: vertical wheel delta in px (positive = down)'),
  edge: z.enum(['top', 'bottom', 'left', 'right']).optional().describe('scroll: jump to an edge of the page or target'),
  value: z.string().max(2000).optional().describe('select: option value or visible label'),
  toRef: z.string().max(32).optional().describe('drag: drop target ref'),
  toSelector: z.string().max(1000).optional().describe('drag: drop target selector'),
  toX: z.number().optional().describe('drag: drop viewport x'),
  toY: z.number().optional().describe('drag: drop viewport y'),
  files: z.array(z.string().max(4096)).max(20).optional().describe('upload: absolute file paths for an <input type=file>'),
  ms: z.number().int().min(0).max(60_000).optional().describe('wait: sleep this long when no condition is given'),
  timeout: z.number().int().min(100).max(60_000).optional().describe('wait: give up after this many ms (default 10000)'),
  gone: z.boolean().optional().describe('wait: wait for selector/text to disappear instead'),
  expression: z.string().max(100_000).optional().describe('evaluate: JS expression run in the page; promises are awaited; result returned as JSON'),
  minSize: z.number().int().min(0).max(4000).optional().describe('images: skip images smaller than this on screen, in CSS px (default 48)'),
  path: z.string().max(4096).optional().describe('download: absolute file or folder to save to (default ARCHA_HOME/downloads)'),
  capture: z.boolean().optional().describe('download: save a screenshot of the target element instead of its file (CSS backgrounds, canvas, formats that will not decode)'),
  fullPage: z.boolean().optional().describe('screenshot: whole scrollable page instead of the viewport'),
  labels: z.boolean().optional().describe('screenshot: draw element refs on the image (set-of-marks)'),
  interactiveOnly: z.boolean().optional().describe('snapshot: only interactive elements'),
  viewportOnly: z.boolean().optional().describe('snapshot: only elements currently in the viewport'),
  all: z.boolean().optional().describe('console: whole log, not just entries since the last read'),
  width: z.number().int().min(200).max(4000).optional().describe('resize: emulated viewport width'),
  height: z.number().int().min(200).max(4000).optional().describe('resize: emulated viewport height'),
  mobile: z.boolean().optional().describe('resize: emulate a touch phone'),
  reset: z.boolean().optional().describe('resize: back to the panel size'),
  op: z.enum(['list', 'new', 'switch', 'close']).optional().describe('tabs: what to do (default list)'),
  tabId: z.string().max(32).optional().describe('tabs: tab to switch to or close'),
  method: z.string().max(200).optional().describe('cdp: Chrome DevTools Protocol method, e.g. "Network.getCookies"'),
  params: z.record(z.string(), z.unknown()).optional().describe('cdp: method params'),
};

export const browserCommandSchema = z.object(browserInputShape);
export type BrowserCommand = z.infer<typeof browserCommandSchema>;

/** `place_image`: a picture from the web, a file, or the browser page, onto the canvas. */
export const placeImageInputShape = {
  url: z.string().max(8_000_000).optional().describe('http(s) image URL, data: URL, or absolute file path (e.g. one download saved)'),
  ref: z.string().max(32).optional().describe('Or: an image on the open browser page, by ref from browser images/snapshot'),
  selector: z.string().max(1000).optional().describe('Or: an image on the open browser page, by CSS selector'),
  capture: z.boolean().optional().describe('With ref/selector: place a screenshot of the element instead of its file'),
  parent: z.string().max(200).optional().describe('Frame id or unique name to place it in; default the page (an empty spot)'),
  x: z.number().optional(), y: z.number().optional(),
  width: z.number().positive().max(20_000).optional().describe('Size on the canvas; one side alone keeps the aspect ratio'),
  height: z.number().positive().max(20_000).optional(),
  fit: z.enum(['crop', 'fit', 'fill']).optional().describe('How the picture fills the box (default crop)'),
  cornerRadius: z.number().min(0).max(10_000).optional(),
  name: z.string().max(200).optional().describe('Layer name'),
  path: z.string().max(4096).optional().describe('Also save the file here (absolute file or folder; default ARCHA_HOME/downloads)'),
};
export const placeImageSchema = z.object({ docId: z.string().optional(), ...placeImageInputShape });
export type PlaceImageParams = z.infer<typeof placeImageSchema>;

export const PLACE_IMAGE_DOC = 'Put a real picture (photo, logo, screenshot) on the canvas as an image layer: from an http(s) URL, a data: URL, a local file, or an image on the open browser page (ref/selector; capture:true for a screenshot of the element). ArchaDev downloads it with the browser\'s session, saves the file, and replies like execute (id, screenshot, issues). Use the original, large file — not a search thumbnail.';

/** A downloaded image (blueprint BROWSER, "Images"): where it was saved, and a canvas-ready copy. */
export type BrowserImage = {
  path: string;
  mime: string;
  /** Pixel size of the file (0 when it could not be decoded). */
  width: number;
  height: number;
  bytes: number;
  /** Where it came from: a URL, or "screenshot of …". */
  source: string;
  /** data: URL for an image node, longest side ≤ 2048 px; absent when the format cannot be shown. */
  embed?: string;
};

/** What the agent gets back: text that steers the next step, plus an optional PNG. */
export type BrowserReply = { text: string; png?: string; image?: BrowserImage };

export type BrowserTabInfo = { id: string; title: string; url: string; loading: boolean; canGoBack: boolean; canGoForward: boolean };
export type BrowserState = {
  tabs: BrowserTabInfo[];
  activeId: string | null;
  /** Last agent command, for the "agent is controlling" indicator. */
  agent: { name: string; action: string; ts: number } | null;
  emulated: { width: number; height: number; mobile: boolean } | null;
};

/** core host ↔ main messages over parentPort (blueprint BROWSER, "Process path"). */
export type MainBridgeRequest = { type: 'browser'; id: number; agent: string; cmd: BrowserCommand };
export type MainBridgeResponse = { type: 'browser-result'; id: number; ok: true; reply: BrowserReply } | { type: 'browser-result'; id: number; ok: false; error: string };

export const BROWSER_TOOL_DOC = `Drive ArchaDev's built-in web browser (a real Chromium tab the person watches live next to the canvas). Use it to study reference sites, check a running web app (localhost), or compare a build with the design.

Loop: open → snapshot (or screenshot) → act on a ref → check the reply → snapshot/screenshot again to verify.

Actions:
  open {url}                         load a page (opens the panel and a tab if needed). back / forward / reload
  search {query, kind?: "web"|"images"}   Google search; lists the top results (web) or the images on the page (images)
  snapshot {ref?|selector?, interactiveOnly?, viewportOnly?}
                                     text tree of the page; interactive elements carry [ref=eN] for targeting. Refs reset when the page changes.
  screenshot {fullPage?, labels?, ref?|selector?}
                                     PNG of the viewport, the whole page, or one element. labels:true draws the refs on the image.
  click {target, button?, clickCount?}   hover {target}   drag {target → toRef|toSelector|toX,toY}
  type {text, ref?|selector?, clear?, submit?}   types into the target (or the focused element)
  press {key}                        "Enter", "Escape", "Tab", "ArrowDown", "Control+a", "Shift+Tab"…
  scroll {dy?, dx?, edge?, target?}  wheel-scroll the page or the element under the target; edge jumps to top/bottom
  select {target, value}   upload {target, files}
  wait {selector?|text?, gone?, timeout?} or {ms}
  evaluate {expression}              run JS in the page, get JSON back
  element {target}                   outerHTML + computed styles + box of one element
  images {minSize?, viewportOnly?}   pictures on the page: ref, file size in px, size on screen, alt, URL
  download {url | target, path?, capture?}
                                     save an image (http(s), data: URL, or an <img>/background by ref) to disk and see it.
                                     capture:true saves a screenshot of the target instead. To put it on the canvas use place_image.
  console {all?, clear?}             page console messages and errors
  resize {width, height, mobile?} | {reset:true}   emulate a device viewport
  tabs {op: list|new|switch|close, url?, tabId?}
  cdp {method, params}               raw Chrome DevTools Protocol command (escape hatch)
Images: search {kind:"images"} → screenshot to look → click a thumbnail for the large preview → images → download or place_image the big one. Thumbnails are small; prefer the preview's original URL.
Target = ref (best, from snapshot or images) | selector | text (visible text) | x+y (viewport CSS px from a 1:1 screenshot).
Every reply reports URL changes and new console errors. Input is real (trusted) mouse and keyboard events.`;
