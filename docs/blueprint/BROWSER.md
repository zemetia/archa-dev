# Browser

← [Blueprint INDEX](./INDEX.md)

**Phase:** 11 (pulled forward). Code: `apps/desktop/src/main/browser.ts` (engine), `main/browser-page.ts` (in-page library), `main/browser-url.ts`, `core-host/main-bridge.ts`, `renderer/ui/BrowserPanel.tsx`, `packages/protocol/src/browser.ts` (schema + agent doc).

An in-app Chromium browser that agents drive and the person watches live, beside the canvas. Agents use it to study reference sites, check a running app (`localhost`), and compare a build with the design.

---

## Process Path

```
agent ─MCP browser─► archa mcp ─socket─► core host  'agent.browser'  (zod, activity log)
                                            │ parentPort {type:'browser', id, agent, cmd}
                                            ▼
                                   main  BrowserManager ── CDP (webContents.debugger) ──► WebContentsView tabs
                                            │ 'browser:state' / 'browser:reveal'          ▲ setBounds
                                            ▼                                            │
                                   renderer BrowserPanel ── 'browser:bounds' ────────────┘
```

| Rule | Why |
|---|---|
| Pages live in **main**, not the core host or renderer | Only main can own `WebContentsView`s; the core host stays Electron-UI free |
| Main validates bridge requests with `browserCommandSchema`; renderer IPC with small zod schemas | Hard constraint 4 |
| Every agent action goes through CDP (`Input.*`, `Page.captureScreenshot`, `Runtime.evaluate`) | Trusted input events, exact screenshots, one code path |
| Pages run in session `persist:archa-browser`, `sandbox`, no preload, no node | Browsed sites are untrusted; sign-ins persist between runs |
| Permissions denied except clipboard write + fullscreen; `window.open` → new tab | No surprise prompts or pop-up windows |
| UA drops the `Electron/x` and app tokens | Some sites block unknown browsers |
| Bridge timeout 90 s; page load 30 s; `wait` max 60 s; screenshot 15 s | A stuck page never hangs the agent |

---

## Visibility

- The view is a native layer **over** the DOM. The renderer reports the pane's placeholder rect; main positions the active tab there. `null` bounds hide it (pane closed, Settings dialog open).
- An agent call while the pane is closed sends `browser:reveal`; the renderer opens the pane and main waits up to 4 s for bounds (hidden views do not paint, so screenshots would hang).
- Nothing DOM-based can be drawn over the page. Agent status is shown in the toolbar (pill) and as a 2 px agent-colour ring (the view shrinks by 2 px).
- Click ripples are drawn **inside** the page by the page library.

---

## Agent Tool — `browser`

One tool, `action` enum, flat input (`browserInputShape`). Doc text: `BROWSER_TOOL_DOC`.

| Action | Does |
|---|---|
| `open` `back` `forward` `reload` | Navigate; `open` creates a tab if none |
| `snapshot` | Text tree (landmarks, headings, text, interactive elements with `[ref=eN]`); scoped by target; `interactiveOnly`, `viewportOnly`; capped at 700 lines / 30k chars |
| `screenshot` | Viewport, `fullPage` (≤ 8000 px tall), or one element; `labels` draws refs (set-of-marks) and lists them |
| `click` `hover` `drag` | CDP mouse at the target centre (scrolled into view); warns when another element covers the point |
| `type` `press` | `Input.insertText` / `dispatchKeyEvent`; `clear`, `submit`; combos like `Control+a`, `Mod+k` |
| `scroll` | Wheel at a point (`dx`/`dy`), `edge`, or target into view; reports scroll before → after |
| `select` `upload` | `<select>` by value or label; `DOM.setFileInputFiles` (absolute paths) |
| `wait` | Selector/text appears (or `gone`), or `ms` |
| `evaluate` | `Runtime.evaluate` (`replMode`, promises awaited) → JSON |
| `element` | Computed styles, box, `outerHTML` (refs stripped) |
| `console` | Console, exceptions, failed loads, dialogs; since last read or `all` |
| `resize` | `Emulation.setDeviceMetricsOverride` (+ touch for `mobile`); `reset` |
| `tabs` | `list` / `new` / `switch` / `close` |
| `cdp` | Raw CDP command — escape hatch |

**Targets:** `ref` (from snapshot, stored in a page-side map, attr `data-archa-ref`) › `selector` (searches open shadow roots) › `text` (visible text, interactive elements first) › `x`,`y` viewport CSS px.

**Interactive detection:** ARIA/implicit roles, `contenteditable`, `onclick`, `tabindex ≥ 0`, and the topmost `cursor: pointer` element (catches framework click handlers on `div`s).

## Reply Contract

Every reply steers the next step, like `execute` ([MCP/03](./MCP/03-response-contract-lint.md)):

- What happened, with the target described as `role "name" [ref]`.
- `Navigated → url · "title"` when the URL changed.
- `New page errors/dialogs (N)` since the last reply (max 5 shown).
- Screenshots: size in CSS px and the image→page scale, so coordinates map back to `click {x, y}`.
- Errors say what to do: stale ref → "call snapshot again"; timeout → "snapshot or screenshot".
- JS dialogs are auto-accepted (a native dialog would block the agent) and reported.

---

## Person UI

Title bar globe button / `Ctrl+Shift+B` toggles the pane (right of the canvas, resizable 360 px → window − 640). Tab strip, back/forward/reload-stop, address bar (non-addresses become a web search), emulated-viewport badge, DevTools (detached).

## Surfaces

| Surface | Entry |
|---|---|
| MCP | `browser` tool in `apps/cli/src/mcp.ts`; allowed in launched runs (`MCP_TOOLS`) |
| CLI | `archa browser <action> '<json>' [--out shot.png]` → [CLI](./CLI.md) parity |
| Activity | `Browser · <action> <detail>` with the agent as author |

## Limits

- Needs the app window: no headless browser (`archa mcp` already needs the app).
- Cross-origin iframes are listed, not traversed — use `cdp`.
- Native HTML5 drag-and-drop needs `cdp Input.dispatchDragEvent`; `drag` is pointer-based.
- One browser per app (attached to the first window).

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [CLAUDE.md](../../CLAUDE.md) · [MCP/01](./MCP/01-transports-tools.md)

**Code:** [`apps/desktop/src/core-host/main-bridge.ts`](../../apps/desktop/src/core-host/main-bridge.ts) · [`apps/desktop/src/main/browser-page.ts`](../../apps/desktop/src/main/browser-page.ts) · [`apps/desktop/src/main/browser-url.ts`](../../apps/desktop/src/main/browser-url.ts) · [`apps/desktop/src/main/browser.ts`](../../apps/desktop/src/main/browser.ts) · [`apps/desktop/src/main/index.ts`](../../apps/desktop/src/main/index.ts) · [`apps/desktop/src/preload/index.ts`](../../apps/desktop/src/preload/index.ts) · [`apps/desktop/src/renderer/lib/store.ts`](../../apps/desktop/src/renderer/lib/store.ts) · [`apps/desktop/src/renderer/ui/BrowserPanel.tsx`](../../apps/desktop/src/renderer/ui/BrowserPanel.tsx) · [`apps/desktop/test/browser.test.ts`](../../apps/desktop/test/browser.test.ts) · [`packages/protocol/src/browser.ts`](../../packages/protocol/src/browser.ts) · [`packages/protocol/src/index.ts`](../../packages/protocol/src/index.ts)
<!-- backlinks:end -->
