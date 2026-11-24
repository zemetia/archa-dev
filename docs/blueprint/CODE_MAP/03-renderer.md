# Code Map — 03: Renderer

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [← 02](./02-core-host.md) | [04 — Packages →](./04-packages.md)

`apps/desktop/src/renderer/` — React 19 + Zustand + Tailwind v4. Holds a **read copy** of the document (snapshot + `doc.applied` events); every change goes to the core as ops. Paths below are relative to `renderer/`.

---

## Shell

| File | Does | Governed by |
|---|---|---|
| [`main.tsx`](../../../apps/desktop/src/renderer/main.tsx), [`index.html`](../../../apps/desktop/src/renderer/index.html) | React root | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`App.tsx`](../../../apps/desktop/src/renderer/App.tsx) | Layout (title bar, tool rail, left / canvas / right), global shortcuts, connecting screen, `ErrorBoundary` | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`styles.css`](../../../apps/desktop/src/renderer/styles.css) | Tailwind v4 `@theme` tokens (light/dark, accent, persona colours) | [APP_UI/02](../APP_UI/02-components-tokens.md) |
| [`ui/ErrorBoundary.tsx`](../../../apps/desktop/src/renderer/ui/ErrorBoundary.tsx) | Shows the error + reload instead of a blank window | [APP_UI/03](../APP_UI/03-state.md), [BEST_PRACTICE/04](../BEST_PRACTICE/04-antipatterns-perf.md) |

## Canvas — `canvas/`

| File | Does | Governed by |
|---|---|---|
| [`canvas/Canvas.tsx`](../../../apps/desktop/src/renderer/canvas/Canvas.tsx) | Canvas element, camera, every tool's pointer handling → ops, selection, drag/resize, paste / drop, render loop (`drawPage` + overlay + cursors + change animations) | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md), [RENDERING/02](../RENDERING/02-layers-hit-testing.md), [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`canvas/overlay.ts`](../../../apps/desktop/src/renderer/canvas/overlay.ts) | Selection boxes, handles, hover, marquee, labels and guides, pen preview (screen space) | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`canvas/cursors.ts`](../../../apps/desktop/src/renderer/canvas/cursors.ts) | Agent session cursors from `agent.trail`: human-like strokes, clicks, pauses, name tags | [RENDERING/02](../RENDERING/02-layers-hit-testing.md), [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`canvas/changes.ts`](../../../apps/desktop/src/renderer/canvas/changes.ts) | Change animations: pop in, fade out, glide, dissolve | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`canvas/TextEditor.tsx`](../../../apps/desktop/src/renderer/canvas/TextEditor.tsx) | DOM text editing over text / sticky nodes; one transaction on blur | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) |
| [`canvas/EmbedLayer.tsx`](../../../apps/desktop/src/renderer/canvas/EmbedLayer.tsx) | Live `<webview>` for `embed` (Web page) nodes when large enough on screen | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md), [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`canvas/CommentsLayer.tsx`](../../../apps/desktop/src/renderer/canvas/CommentsLayer.tsx) | Comment pins, open thread card, new-comment composer | [AGENT_BRIDGE/04](../AGENT_BRIDGE/04-review-loop.md) |
| [`canvas/pen.ts`](../../../apps/desktop/src/renderer/canvas/pen.ts) | Pen tool: points + bezier handles → SVG path data | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`canvas/scale.ts`](../../../apps/desktop/src/renderer/canvas/scale.ts) | Scale tool: resize a node and everything inside proportionally | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |

## Shared logic — `lib/`

| File | Does | Governed by |
|---|---|---|
| [`lib/store.ts`](../../../apps/desktop/src/renderer/lib/store.ts) | Zustand view store (doc copy, selection, tool, panels, chat, browser pane, toasts), `init()` connects to the core and answers `render.request` (agent screenshots are rendered here) | [APP_UI/03](../APP_UI/03-state.md) |
| [`lib/asset-urls.ts`](../../../apps/desktop/src/renderer/lib/asset-urls.ts) | Image resolver: `asset:` → `archa-asset://file/…` in the document's asset folder, web URLs → the host proxy; `assetUrl` for chat thumbnails | [FILE_FORMATS/01](../FILE_FORMATS/01-archa.md) |
| [`lib/reference.ts`](../../../apps/desktop/src/renderer/lib/reference.ts) | pdf.js in the window: rasterise reference pages (cached), sample text ink colours, pixel diff + heat map for `compare` | [MCP/05](../MCP/05-reference-compare.md) |
| [`lib/commands.ts`](../../../apps/desktop/src/renderer/lib/commands.ts) | Editing commands for shortcuts and menus: delete, duplicate, copy/paste, nudge, wrap in frame, reorder, select parent/children | [APP_UI/01](../APP_UI/01-shell-tools-panels.md), [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md) |
| [`lib/geometry.ts`](../../../apps/desktop/src/renderer/lib/geometry.ts) | World ↔ screen, hit path, deep pick, container at point, handles, `fitCamera` | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`lib/groupTransform.ts`](../../../apps/desktop/src/renderer/lib/groupTransform.ts) | Multi-selection scale / rotate as one unit: scale-about-anchor and rotate-about-pivot maps, per-layer placement through world matrices (mixed parents, flips), pivots, shared-box handles, patches for one transaction | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`lib/livePatch.ts`](../../../apps/desktop/src/renderer/lib/livePatch.ts) | `previewPatch` (slider drags update the view model + canvas, no undo step) and `commitPatch` (one transaction on release) | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`lib/assets.ts`](../../../apps/desktop/src/renderer/lib/assets.ts) | Insert an icon / logo / uploaded icon (click or drop), upload and remove My icons, current asset style | [DESIGN_SYSTEM/05](../DESIGN_SYSTEM/05-icons-assets.md) |
| [`lib/fonts.ts`](../../../apps/desktop/src/renderer/lib/fonts.ts), [`lib/bundled-fonts.ts`](../../../apps/desktop/src/renderer/lib/bundled-fonts.ts) | Font picker list (built-in first, then installed via Local Font Access); generated `registerBundledFonts` | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) |
| [`ui/inspector/FontPicker.tsx`](../../../apps/desktop/src/renderer/ui/inspector/FontPicker.tsx) | Searchable font combobox, each font previewed in its face, "Built-in" tag | [APP_UI/04](../APP_UI/04-design-panel.md) |
| [`lib/importers.ts`](../../../apps/desktop/src/renderer/lib/importers.ts) | Image / SVG import, files dropped on the canvas (`dropFiles`), `svgInput` (shared `importSvg`), `place` (emits insert ops) | [FILE_FORMATS/04](../FILE_FORMATS/04-importers.md) |
| [`lib/comments.ts`](../../../apps/desktop/src/renderer/lib/comments.ts) | Add / reply / resolve / delete comments, **Apply** to the chat agent, auto-resolve when the run ends | [AGENT_BRIDGE/04](../AGENT_BRIDGE/04-review-loop.md) |
| [`lib/thumbs.ts`](../../../apps/desktop/src/renderer/lib/thumbs.ts) | Node thumbnails keyed by subtree hash (Slides, Components) | [CACHE/01](../CACHE/01-layers-keys.md), [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`lib/removeBackground.ts`](../../../apps/desktop/src/renderer/lib/removeBackground.ts) | Background removal: image → 1024² RGB, mask from main, alpha-composited PNG, one `update` op | [RENDERING/04](../RENDERING/04-background-removal.md) |
| [`lib/chatImages.ts`](../../../apps/desktop/src/renderer/lib/chatImages.ts) | Images pasted into the composer: re-encoded, size-capped | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |

## Panels and chrome — `ui/`

| File | Does | Governed by |
|---|---|---|
| [`ui/ArchaLogo.tsx`](../../../apps/desktop/src/renderer/ui/ArchaLogo.tsx) | The ArchaDev mark (`assets/archa-logo.svg`) in the title bar and chat welcome; app/installer icon is `apps/desktop/build/icon.ico` | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/TitleBar.tsx`](../../../apps/desktop/src/renderer/ui/TitleBar.tsx) | Document tabs (unsaved dot, close), New / Open / Save, Browser toggle, Settings | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/ToolRail.tsx`](../../../apps/desktop/src/renderer/ui/ToolRail.tsx) | Tool families, `TOOL_KEYS` shortcuts | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/AssetsPanel.tsx`](../../../apps/desktop/src/renderer/ui/AssetsPanel.tsx) | Assets panel: collections, styles, search, size / colour, logos, My icons upload | [DESIGN_SYSTEM/05](../DESIGN_SYSTEM/05-icons-assets.md), [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/RailPanels.tsx`](../../../apps/desktop/src/renderer/ui/RailPanels.tsx) | Floating Variables table, Find layer and the Assets panel slot | [APP_UI/01](../APP_UI/01-shell-tools-panels.md), [DESIGN_SYSTEM/01](../DESIGN_SYSTEM/01-variables-themes.md) |
| [`ui/ZoomBar.tsx`](../../../apps/desktop/src/renderer/ui/ZoomBar.tsx) | Zoom controls | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/TextToolbar.tsx`](../../../apps/desktop/src/renderer/ui/TextToolbar.tsx) | Canva-like text toolbar over the canvas: font, size −/+, colour, B/I/U/S, case, align, list, spacing, transparency, Effects | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/TextEffectsPanel.tsx`](../../../apps/desktop/src/renderer/ui/TextEffectsPanel.tsx) | Effects panel: live “Ag” previews of the 9 text effects, their sliders + colour, Shape → Curve; shared `Slider` | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/LeftPanel.tsx`](../../../apps/desktop/src/renderer/ui/LeftPanel.tsx) | Left card: tab header, collapse | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/ChatPanel.tsx`](../../../apps/desktop/src/renderer/ui/ChatPanel.tsx) | Chat thread + composer (agent / model / account picker, queue, Send now, selection chip, images) | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md), [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/HistoryPanel.tsx`](../../../apps/desktop/src/renderer/ui/HistoryPanel.tsx) | Past conversations; open = resume | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`ui/OrchestraView.tsx`](../../../apps/desktop/src/renderer/ui/OrchestraView.tsx) | Team view of an Orchestrate thread: lead + worker circles, live status, zoom into a worker's chat | [AGENT_BRIDGE/06](../AGENT_BRIDGE/06-orchestrate.md) |
| [`ui/Markdown.tsx`](../../../apps/desktop/src/renderer/ui/Markdown.tsx) | Safe Markdown subset for agent replies (React elements, no raw HTML); finished SVG renders as `SvgBlock` | [APP_UI/02](../APP_UI/02-components-tokens.md) |
| [`ui/SvgBlock.tsx`](../../../apps/desktop/src/renderer/ui/SvgBlock.tsx) | SVG in chat (fence, bare markup, `place_svg` step): preview `<img>`, Place on canvas, Copy, source | [FILE_FORMATS/04](../FILE_FORMATS/04-importers.md), [APP_UI/02](../APP_UI/02-components-tokens.md) |
| [`ui/LayersPanel.tsx`](../../../apps/desktop/src/renderer/ui/LayersPanel.tsx) | Layer tree | [RENDERING/02](../RENDERING/02-layers-hit-testing.md), [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/ContextMenu.tsx`](../../../apps/desktop/src/renderer/ui/ContextMenu.tsx) | Canvas right-click menu: paste here, arrange, group / ungroup, auto layout, component, pixel grid | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/ComponentsPanel.tsx`](../../../apps/desktop/src/renderer/ui/ComponentsPanel.tsx) | Make / insert / sync / publish components | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md) |
| [`ui/SlidesPanel.tsx`](../../../apps/desktop/src/renderer/ui/SlidesPanel.tsx) | Top-level frames as thumbnails | [APP_UI/01](../APP_UI/01-shell-tools-panels.md) |
| [`ui/LibraryPanel.tsx`](../../../apps/desktop/src/renderer/ui/LibraryPanel.tsx) | Global library browser + insert | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md) |
| [`ui/RightPanel.tsx`](../../../apps/desktop/src/renderer/ui/RightPanel.tsx) | Right sidebar: Design panel or Comments panel | [APP_UI/04](../APP_UI/04-design-panel.md) |
| [`ui/inspector/ArrangeSections.tsx`](../../../apps/desktop/src/renderer/ui/inspector/ArrangeSections.tsx), [`StyleSections.tsx`](../../../apps/desktop/src/renderer/ui/inspector/StyleSections.tsx), [`OutputSections.tsx`](../../../apps/desktop/src/renderer/ui/inspector/OutputSections.tsx), [`shared.ts`](../../../apps/desktop/src/renderer/ui/inspector/shared.ts) | Design panel sections | [APP_UI/04](../APP_UI/04-design-panel.md) |
| [`ui/CommentsPanel.tsx`](../../../apps/desktop/src/renderer/ui/CommentsPanel.tsx) | Open / Resolved threads, Apply, Apply all | [AGENT_BRIDGE/04](../AGENT_BRIDGE/04-review-loop.md) |
| [`ui/BrowserPanel.tsx`](../../../apps/desktop/src/renderer/ui/BrowserPanel.tsx) | Browser pane placeholder + tab bar; page is a main-process view | [BROWSER](../BROWSER.md) |
| [`ui/controls.tsx`](../../../apps/desktop/src/renderer/ui/controls.tsx), [`ui/Dropdown.tsx`](../../../apps/desktop/src/renderer/ui/Dropdown.tsx), [`ui/persona.ts`](../../../apps/desktop/src/renderer/ui/persona.ts) | Field kit, themed dropdown, persona colour classes | [APP_UI/02](../APP_UI/02-components-tokens.md) |

## Settings — `ui/settings/`

| File | Does | Governed by |
|---|---|---|
| [`ui/SettingsDialog.tsx`](../../../apps/desktop/src/renderer/ui/SettingsDialog.tsx) | Grouped dialog (Ctrl+,), page routing | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`ui/settings/ProvidersPage.tsx`](../../../apps/desktop/src/renderer/ui/settings/ProvidersPage.tsx) | AI providers: accounts, sign in, default, enable | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`ui/settings/SkillsPage.tsx`](../../../apps/desktop/src/renderer/ui/settings/SkillsPage.tsx), [`McpPage.tsx`](../../../apps/desktop/src/renderer/ui/settings/McpPage.tsx) | Skills; external MCP servers (add, test, import) | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`ui/settings/OtherPages.tsx`](../../../apps/desktop/src/renderer/ui/settings/OtherPages.tsx) | Connect (Listen mode), GitHub / Integrations placeholders, About | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`ui/settings/kit.tsx`](../../../apps/desktop/src/renderer/ui/settings/kit.tsx), [`Logo.tsx`](../../../apps/desktop/src/renderer/ui/settings/Logo.tsx) | Page building blocks; brand marks | [APP_UI/02](../APP_UI/02-components-tokens.md) |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [APP_UI](../APP_UI.md)
<!-- backlinks:end -->
