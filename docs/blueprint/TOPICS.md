# Topic Index — Find Anything Fast

← [Blueprint INDEX](./INDEX.md)

A–Z keyword → the doc that owns the rules → the code that implements it today. Code paths are repo-relative (`core-host/` = `apps/desktop/src/core-host/`, `renderer/` = `apps/desktop/src/renderer/`, `main/` = `apps/desktop/src/main/`). File-by-file detail → [CODE_MAP](./CODE_MAP.md). Intent and history → [plan/INDEX](../plan/INDEX.md). Past mistakes → [knowledge/LEARN](../knowledge/LEARN.md).

| Topic | Rules | Code today |
|---|---|---|
| Accounts / login profiles (Claude, Codex, agy) | [AGENT_BRIDGE/02](./AGENT_BRIDGE/02-roster-profiles.md) | `core-host/accounts.ts`, `core-host/keyring.ts`, `renderer/ui/settings/ProvidersPage.tsx` |
| Activity log | [AGENT_BRIDGE/04](./AGENT_BRIDGE/04-review-loop.md) | `core-host/workspace.ts` (`log`, `activity.list`) |
| Adapters (agent CLIs, argv, stream parsers) | [AGENT_BRIDGE/01](./AGENT_BRIDGE/01-adapter-interface.md) | `core-host/agent-adapters.ts` |
| Agent cursors / presence | [RENDERING/02](./RENDERING/02-layers-hit-testing.md) | `renderer/canvas/cursors.ts`, `agent.trail` event |
| Align / distribute / wrap | [DOCUMENT_MODEL/03](./DOCUMENT_MODEL/03-layout.md), [APP_UI/04](./APP_UI/04-design-panel.md) | `packages/core/src/arrange.ts` |
| Animations (canvas changes) | [RENDERING/02](./RENDERING/02-layers-hit-testing.md) | `renderer/canvas/changes.ts`, `packages/render/src/scene.ts` |
| `.archa` file format | [FILE_FORMATS/01](./FILE_FORMATS/01-archa.md) | `packages/formats/src/archa.ts`, `packages/schema/src/document.ts` |
| `.archadev/` project folder | [FILE_FORMATS/02](./FILE_FORMATS/02-archadev-project.md), [STRUCTURE/03](./STRUCTURE/03-runtime-dirs.md) | Not built |
| `ARCHA_HOME` / runtime dirs | [STRUCTURE/03](./STRUCTURE/03-runtime-dirs.md), [CODE_MAP/05](./CODE_MAP/05-interfaces.md) | `packages/protocol/src/node.ts` |
| Auto layout (hug / fill / gap / padding) | [DOCUMENT_MODEL/03](./DOCUMENT_MODEL/03-layout.md) | `packages/core/src/layout.ts` |
| Background removal (on-device) | [RENDERING/04](./RENDERING/04-background-removal.md) | `main/models.ts`, `main/ml-host.ts`, `renderer/lib/removeBackground.ts` |
| Browser (agent-driven, in-app) | [BROWSER](./BROWSER.md) | `main/browser.ts`, `main/browser-page.ts`, `main/browser-image.ts`, `packages/protocol/src/browser.ts`, `renderer/ui/BrowserPanel.tsx` |
| Images from the web (search, download, place_image) | [BROWSER](./BROWSER.md#images) | `main/browser-image.ts`, `core-host/workspace.ts` `agent.placeImage` |
| Cache (bitmap, thumbnails, hashing) | [CACHE](./CACHE.md), [DOCUMENT_MODEL/04](./DOCUMENT_MODEL/04-hashing.md) | `packages/render/src/cache.ts`, `renderer/lib/thumbs.ts`, `packages/core/src/hash.ts` |
| Canvas drawing | [RENDERING/01](./RENDERING/01-canvaskit-pipeline.md) | `packages/render/src/draw.ts`, `scene.ts`, `renderer/canvas/Canvas.tsx` |
| Changelog / release / branches | [BEST_PRACTICE/03](./BEST_PRACTICE/03-git-changelog-release.md) | `CHANGELOG.md`, `apps/desktop/electron-builder.yml` |
| Chat (composer, threads, history) | [AGENT_BRIDGE/03](./AGENT_BRIDGE/03-runs-steering.md), [plan/CHAT_AGENT](../plan/CHAT_AGENT.md) | `core-host/agents.ts`, `renderer/ui/ChatPanel.tsx`, `HistoryPanel.tsx` |
| Chat tool rows (expand: input + result) | [AGENT_BRIDGE/03](./AGENT_BRIDGE/03-runs-steering.md) | `core-host/agent-adapters.ts` (`toolDetail`, `result` events), `renderer/ui/ChatPanel.tsx` (`ToolRow`) |
| CLI (`archa`) | [CLI](./CLI.md), [CODE_MAP/05](./CODE_MAP/05-interfaces.md) | `apps/cli/src/index.ts`, `connect.ts` |
| Code export (HTML, CSS, Tailwind) | [DESIGN_SYSTEM/04](./DESIGN_SYSTEM/04-code-export.md) | `packages/formats/src/export/html.ts`, `tailwind.ts` |
| Colours (oklch) | [DOCUMENT_MODEL/01](./DOCUMENT_MODEL/01-nodes-properties.md) | `packages/schema/src/color.ts` |
| Comments / review | [AGENT_BRIDGE/04](./AGENT_BRIDGE/04-review-loop.md) | `renderer/lib/comments.ts`, `renderer/canvas/CommentsLayer.tsx`, `renderer/ui/CommentsPanel.tsx` |
| Components / instances | [DESIGN_SYSTEM/02](./DESIGN_SYSTEM/02-components-libraries.md) | `packages/core/src/components.ts`, `renderer/ui/ComponentsPanel.tsx` |
| Context notes for agents (`meta.context`) | [APP_UI/04](./APP_UI/04-design-panel.md), [MCP/01](./MCP/01-transports-tools.md) | `packages/core/src/outline.ts`, `renderer/ui/inspector/OutputSections.tsx` |
| Core host (single writer) | [ARCHITECTURE/01](./ARCHITECTURE/01-processes.md), [ARCHITECTURE/04](./ARCHITECTURE/04-single-writer-sync.md) | `core-host/index.ts`, `core-host/workspace.ts` |
| Design guides (`read_guide`) | [MCP/04](./MCP/04-local-skill.md) | `packages/protocol/src/design-guides.ts` |
| Drag and drop files onto the canvas / composer | [FILE_FORMATS/04](./FILE_FORMATS/04-importers.md) | `renderer/lib/importers.ts` (`dropFiles`), `renderer/canvas/Canvas.tsx`, `renderer/ui/ChatPanel.tsx` |
| Drag layers in / out of frames | [RENDERING/02](./RENDERING/02-layers-hit-testing.md) | `renderer/canvas/Canvas.tsx` (move gesture, `layoutSlot`, `drawLifted`) |
| Design panel / inspector | [APP_UI/04](./APP_UI/04-design-panel.md) | `renderer/ui/RightPanel.tsx`, `renderer/ui/inspector/` |
| Embed / web page node | [DOCUMENT_MODEL/01](./DOCUMENT_MODEL/01-nodes-properties.md) | `renderer/canvas/EmbedLayer.tsx`, `main/index.ts` (`guardWebviews`), `main/embed-shot.ts` |
| Entry points (open, file association) | [ENTRY_POINTS](./ENTRY_POINTS.md) | `main/index.ts` (`parseArgv`), `apps/desktop/electron-builder.yml` |
| `execute` sandbox (QuickJS) | [MCP/02](./MCP/02-execute-api.md) | `core-host/execute.ts`, `packages/protocol/src/agent-docs.ts` |
| Export (PNG / JPG / SVG / PDF) | [RENDERING/03](./RENDERING/03-export.md) | `packages/render/src/scene.ts`, `packages/formats/src/svg.ts`, `main/pdf.ts` |
| Format version / migrations | [FILE_FORMATS/03](./FILE_FORMATS/03-migrations-validation.md) | `packages/formats/src/migrations/archa/`, fixtures in `packages/formats/test/fixtures/` |
| Multi-selection scale / rotate (shared box, pivot) | [RENDERING/02](./RENDERING/02-layers-hit-testing.md) | `renderer/lib/groupTransform.ts`, `renderer/canvas/Canvas.tsx` (`group` gesture), `renderer/canvas/overlay.ts` |
| Hit testing / selection | [RENDERING/02](./RENDERING/02-layers-hit-testing.md) | `renderer/lib/geometry.ts`, `renderer/canvas/overlay.ts` |
| Icons, logos, Assets panel, My icons | [DESIGN_SYSTEM/05](./DESIGN_SYSTEM/05-icons-assets.md), [MCP/02](./MCP/02-execute-api.md) | `packages/icons/`, `scripts/gen-icon-sets.mjs`, `ui/AssetsPanel.tsx`, `core-host/icons.ts` |
| Import (image, SVG, `.pen`) | [FILE_FORMATS/04](./FILE_FORMATS/04-importers.md) | `renderer/lib/importers.ts`, `packages/formats/src/import/svg.ts`; `.pen` not built |
| SVG written by agents (`svg()`, `place_svg`, chat preview) | [MCP/02](./MCP/02-execute-api.md), [FILE_FORMATS/04](./FILE_FORMATS/04-importers.md) | `core-host/execute.ts`, `packages/formats/src/import/svg.ts`, `renderer/ui/SvgBlock.tsx`, `skills/design-svg/` |
| IPC / RPC protocol | [ARCHITECTURE/02](./ARCHITECTURE/02-protocol-ipc.md), [CODE_MAP/05](./CODE_MAP/05-interfaces.md) | `packages/protocol/src/index.ts`, `apps/desktop/src/preload/index.ts` |
| Knowledge files (THIS / LEARN) | [KNOWLEDGE](./KNOWLEDGE.md) | `docs/knowledge/` |
| Layers panel | [RENDERING/02](./RENDERING/02-layers-hit-testing.md) | `renderer/ui/LayersPanel.tsx` |
| Library (global components) | [DESIGN_SYSTEM/02](./DESIGN_SYSTEM/02-components-libraries.md) | `core-host/library.ts`, `renderer/ui/LibraryPanel.tsx` |
| Lint (agent reply issues) | [MCP/03](./MCP/03-response-contract-lint.md) | `packages/core/src/lint.ts` |
| MCP server / tools | [MCP/01](./MCP/01-transports-tools.md), [CODE_MAP/05](./CODE_MAP/05-interfaces.md) | `apps/cli/src/mcp.ts` |
| MCP servers (external, for runs) | [AGENT_BRIDGE/05](./AGENT_BRIDGE/05-skills-mcp.md) | `core-host/mcp-servers.ts`, `renderer/ui/settings/McpPage.tsx` |
| Models list per agent | [AGENT_BRIDGE/02](./AGENT_BRIDGE/02-roster-profiles.md) | `core-host/agent-adapters.ts`, RPC `agents.models` |
| Nodes / properties / schemas | [DOCUMENT_MODEL/01](./DOCUMENT_MODEL/01-nodes-properties.md) | `packages/schema/src/nodes.ts` |
| Ops / transactions / undo | [DOCUMENT_MODEL/02](./DOCUMENT_MODEL/02-ops-transactions-undo.md) | `packages/schema/src/ops.ts`, `packages/core/src/apply.ts`, `session.ts` |
| Paste (layers, images) | [APP_UI/01](./APP_UI/01-shell-tools-panels.md) | `renderer/lib/commands.ts`, `renderer/lib/chatImages.ts` |
| `.pen` (clean-room rules) | [FILE_FORMATS/04](./FILE_FORMATS/04-importers.md), [REFERENCE](./REFERENCE.md) | Not built (see `docs/knowledge/THIS.md`) |
| Personas / session names | [AGENT_BRIDGE/03](./AGENT_BRIDGE/03-runs-steering.md) | `core-host/personas.ts`, `renderer/ui/persona.ts` |
| Plugins | [PLUGINS](./PLUGINS.md) | Not built |
| Process model (main / core host / renderer) | [ARCHITECTURE/01](./ARCHITECTURE/01-processes.md) | `main/index.ts`, `core-host/index.ts`, `renderer/main.tsx` |
| Screenshots for agents | [RENDERING/03](./RENDERING/03-export.md) | `core-host/workspace.ts` (`screenshot`), `renderer/lib/store.ts` (`render.request`) |
| Settings dialog | [AGENT_BRIDGE/05](./AGENT_BRIDGE/05-skills-mcp.md) | `renderer/ui/SettingsDialog.tsx`, `renderer/ui/settings/` |
| Shortcuts / tools / tool rail | [APP_UI/01](./APP_UI/01-shell-tools-panels.md) | `renderer/ui/ToolRail.tsx` (`TOOL_KEYS`), `renderer/App.tsx`, `renderer/lib/commands.ts` |
| Skills (for agent runs, `/name` mentions) | [AGENT_BRIDGE/05](./AGENT_BRIDGE/05-skills-mcp.md), [MCP/04](./MCP/04-local-skill.md) | `core-host/skills.ts` (`mention`), `core-host/agents.ts` (`mentions`), `renderer/ui/settings/SkillsPage.tsx`, `renderer/ui/ChatPanel.tsx` |
| Slides panel / thumbnails | [APP_UI/01](./APP_UI/01-shell-tools-panels.md) | `renderer/ui/SlidesPanel.tsx`, `renderer/lib/thumbs.ts` |
| State (Zustand store) | [APP_UI/03](./APP_UI/03-state.md) | `renderer/lib/store.ts` |
| Steering (queue, Send now, stop, warm) | [AGENT_BRIDGE/03](./AGENT_BRIDGE/03-runs-steering.md) | `core-host/agents.ts` |
| Tests | [BEST_PRACTICE/02](./BEST_PRACTICE/02-testing.md), [CODE_MAP/06](./CODE_MAP/06-tests.md) | `apps/desktop/test/`, `packages/*/test/` |
| Text editing / text metrics | [RENDERING/01](./RENDERING/01-canvaskit-pipeline.md), [DOCUMENT_MODEL/03](./DOCUMENT_MODEL/03-layout.md) | `renderer/canvas/TextEditor.tsx`, `packages/core/src/layout.ts` |
| Tokens (app UI colours) | [APP_UI/02](./APP_UI/02-components-tokens.md) | `renderer/styles.css` |
| Variables (document) | [DESIGN_SYSTEM/01](./DESIGN_SYSTEM/01-variables-themes.md) | `packages/schema/src/variables.ts`, `renderer/ui/RailPanels.tsx` |
| Vector / pen tool / paths | [APP_UI/01](./APP_UI/01-shell-tools-panels.md), [DOCUMENT_MODEL/01](./DOCUMENT_MODEL/01-nodes-properties.md) | `renderer/canvas/pen.ts`, `packages/core/src/shapes.ts` |
| Worktrees / parallel agents in this repo | [knowledge/THIS](../knowledge/THIS.md), [BEST_PRACTICE/03](./BEST_PRACTICE/03-git-changelog-release.md) | — |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [CLAUDE.md](../../CLAUDE.md)
<!-- backlinks:end -->
