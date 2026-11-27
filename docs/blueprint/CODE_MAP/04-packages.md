# Code Map — 04: Packages

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [← 03](./03-renderer.md) | [05 — Interfaces →](./05-interfaces.md)

Five packages exist today; dependency direction `schema ← protocol ← core ← render / formats ← apps` ([STRUCTURE/02](../STRUCTURE/02-packages.md)). Public API = each `src/index.ts`.

---

## `@archa/schema` — `packages/schema/src/`

| File | Does | Governed by |
|---|---|---|
| [`nodes.ts`](../../../packages/schema/src/nodes.ts) | zod schemas for every node type, paints, strokes, effects; `NodeInput` | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`ops.ts`](../../../packages/schema/src/ops.ts) | `insert` / `update` / `move` / `delete`, `setVariable` / `deleteVariable`, `setComment` / `deleteComment`, `Transaction` | [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md) |
| [`document.ts`](../../../packages/schema/src/document.ts) | `FORMAT_VERSION` (4), page refs, document meta, `.archa` manifest | [FILE_FORMATS/01](../FILE_FORMATS/01-archa.md), [FILE_FORMATS/03](../FILE_FORMATS/03-migrations-validation.md) |
| [`variables.ts`](../../../packages/schema/src/variables.ts) | Document variables (single theme) and review comments | [DESIGN_SYSTEM/01](../DESIGN_SYSTEM/01-variables-themes.md), [AGENT_BRIDGE/04](../AGENT_BRIDGE/04-review-loop.md) |
| [`color.ts`](../../../packages/schema/src/color.ts) | oklch colour storage, hex ↔ oklch, CSS output, contrast ratio | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`ids.ts`](../../../packages/schema/src/ids.ts), [`index.ts`](../../../packages/schema/src/index.ts) | `newId()`; re-exports | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |

## `@archa/protocol` — `packages/protocol/src/`

| File | Does | Governed by |
|---|---|---|
| [`index.ts`](../../../packages/protocol/src/index.ts) | `CoreMethods` (every RPC), `CoreEvents`, message framing (`req` / `res` / `evt`), `RpcClient`, `jsonLines`, shared types (`AgentTrail`, `ExecuteResult`, chat, accounts) | [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md), [CODE_MAP/05](./05-interfaces.md) |
| [`storage.ts`](../../../packages/protocol/src/storage.ts) | Node-only, **every path**: `paths.*` (ARCHA_HOME: runtime, threads, runtime data, screenshots, libraries, icons, memory, skills, mcp.json, chat sessions, profiles, accounts, downloads, models), `dataDirFor` / `assetDirFor` / `legacyAssetDirFor` / `isRuntimeDataDir`, `docPaths(dataDir).*` (assets, chats, attachments, skills, memory, reference), `hostToolPaths.*` (~/.claude, ~/.codex, ~/.gemini, ~/.agents, ~/.cursor); file primitives `readJson` (zod + fallback, optional quarantine), `writeJsonAtomic` / `writeFileAtomic`, `appendJsonl` / `readJsonl`, `ensureDir`, `listDir` | [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md) |
| [`node.ts`](../../../packages/protocol/src/node.ts) | `@archa/protocol/node` entry: re-exports `storage.ts`; `runtimeFile()`, `socketPath()` (custom `ARCHA_HOME` → own pipe) | [STRUCTURE/03](../STRUCTURE/03-runtime-dirs.md), [ARCHITECTURE/02](../ARCHITECTURE/02-protocol-ipc.md) |
| [`agent-docs.ts`](../../../packages/protocol/src/agent-docs.ts) | `EXECUTE_API_DOC` (tool description) and `DESIGNER_PROMPT` (chat-run system prompt) — our own text | [MCP/02](../MCP/02-execute-api.md), [MCP/04](../MCP/04-local-skill.md) |
| [`design-guides.ts`](../../../packages/protocol/src/design-guides.ts) | Compiled-in design guides for `read_guide`; `guidesFor(request)` picks guides for a chat turn | [MCP/04](../MCP/04-local-skill.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`fonts.ts`](../../../packages/protocol/src/fonts.ts) | Generated `BUNDLED_FONTS` list (agent docs, font picker) | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) |
| [`browser.ts`](../../../packages/protocol/src/browser.ts) | `browser` tool: actions, zod command schema, replies, main ↔ core bridge messages, tool doc | [BROWSER](../BROWSER.md) |
| [`gemini-schema.ts`](../../../packages/protocol/src/gemini-schema.ts) | `sanitizeGeminiSchema` (JSON Schema → Gemini's function-declaration subset) and `geminiSchemaIssues` (what Gemini would refuse, in Gemini's path spelling) | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md), [MCP/01](../MCP/01-transports-tools.md) |
| [`settings.ts`](../../../packages/protocol/src/settings.ts) | Skills and MCP-server types (secrets never cross — only keys) | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |

## `@archa/core` — `packages/core/src/` (no Electron, React or DOM)

| File | Does | Governed by |
|---|---|---|
| [`document.ts`](../../../packages/core/src/document.ts) | `ArchaDocument`: flat node map + parent/children, revision, `DocumentError` codes | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`apply.ts`](../../../packages/core/src/apply.ts) | `applyOps`: atomic apply, inverse ops, layout once at the end | [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md) |
| [`session.ts`](../../../packages/core/src/session.ts) | `DocumentSession`: revisions, `baseRevision` check, per-author undo / redo, listeners | [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md), [ARCHITECTURE/04](../ARCHITECTURE/04-single-writer-sync.md) |
| [`factory.ts`](../../../packages/core/src/factory.ts) | `insertOpsFor` (friendly input → ordered inserts), `normaliseInput` (CSS / Figma spellings) | [MCP/02](../MCP/02-execute-api.md), [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md) |
| [`layout.ts`](../../../packages/core/src/layout.ts) | Auto layout (own flexbox subset, not Yoga yet), approximate text metrics, `setTextMeasure` | [DOCUMENT_MODEL/03](../DOCUMENT_MODEL/03-layout.md) |
| [`metrics.ts`](../../../packages/core/src/metrics.ts) | Real advance widths of the bundled fonts (`charWidth`, `textWidth`, `bundledFamily`); the layout measure and the renderer's text both use it | [DOCUMENT_MODEL/03](../DOCUMENT_MODEL/03-layout.md) |
| [`text-metrics-data.ts`](../../../packages/core/src/text-metrics-data.ts) | Generated by `scripts/gen-fonts.mjs` (fontkit instances of the bundled woff2 faces, weights 300–800) | [DOCUMENT_MODEL/03](../DOCUMENT_MODEL/03-layout.md) |
| [`text.ts`](../../../packages/core/src/text.ts) | `displayParagraphs` (case + list markers; curve = one line), `applyCase`, `curveAngle`, `curveBox`, rich text `styledParagraphs` / `remapSpans` — shared by layout, renderer and exporters |
| [`bindings.ts`](../../../packages/core/src/bindings.ts) | Token bindings: `resolveBindings`, `brokenBindings`, `boundTo`, `bindTokens` (`"$name"` values → bindings), `findVariable`; used by `apply.ts` | [DESIGN_SYSTEM/01](../DESIGN_SYSTEM/01-variables-themes.md) | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`layers.ts`](../../../packages/core/src/layers.ts) | Layers panel order (paint order vs flow order) and drag & drop → `move` ops | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`groups.ts`](../../../packages/core/src/groups.ts) | Group / ungroup ops (top-most parent rule, z-slot, folding transform / opacity / lock), `canUngroup`, `emptiedGroups` | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`fit.ts`](../../../packages/core/src/fit.ts) | Group bounds = union of children, run by `applyOps` with recorded inverses | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md), [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md) |
| [`transform.ts`](../../../packages/core/src/transform.ts) | Page matrices (rotation + translation), `placementIn` to reparent without moving | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`arrange.ts`](../../../packages/core/src/arrange.ts) | Align / distribute / wrap ops; auto-layout children move the parent's align / justify | [DOCUMENT_MODEL/03](../DOCUMENT_MODEL/03-layout.md), [APP_UI/04](../APP_UI/04-design-panel.md) |
| [`connectors.ts`](../../../packages/core/src/connectors.ts) | Connector routing (elbow / straight, run at the end of `runLayout`) and the shared line + cap geometry for render and export | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`components.ts`](../../../packages/core/src/components.ts) | Components v2 via `meta.component` / `meta.instanceOf` / `meta.sourceId`: make (props, variant sets), instance, override tracking, sync keeping overrides, reset, `setPropsOps`, detach, library refs | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md) |
| [`hash.ts`](../../../packages/core/src/hash.ts) | FNV-1a `selfHash`, `contentHash`, `subtreeHash` | [DOCUMENT_MODEL/04](../DOCUMENT_MODEL/04-hashing.md), [CACHE/01](../CACHE/01-layers-keys.md) |
| [`lint.ts`](../../../packages/core/src/lint.ts) | Structural checks returned in every agent reply | [MCP/03](../MCP/03-response-contract-lint.md) |
| [`outline.ts`](../../../packages/core/src/outline.ts) | Compact text tree of a node (`inspect`), `meta.context` notes | [MCP/01](../MCP/01-transports-tools.md), [APP_UI/04](../APP_UI/04-design-panel.md) |
| [`shapes.ts`](../../../packages/core/src/shapes.ts) | Polygon points, viewBox matrix — shared by render, SVG export, hit testing | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) |
| [`space.ts`](../../../packages/core/src/space.ts) | `findEmptySpace` for new top-level frames | [MCP/02](../MCP/02-execute-api.md) |
| [`index.ts`](../../../packages/core/src/index.ts) | Re-exports | [STRUCTURE/02](../STRUCTURE/02-packages.md) |

## `@archa/icons` — `packages/icons/` (no DOM)

| File | Purpose | Docs |
|---|---|---|
| [`src/index.ts`](../../../packages/icons/src/index.ts) | Set index, lazy `loadIconSet`, `parseIconRef`, cross-set `searchIcons`, `iconNode` / `customIconNode` / `scaleInput` / `recolorInput`, `iconSvg` | [DESIGN_SYSTEM/05](../DESIGN_SYSTEM/05-icons-assets.md), [MCP/02](../MCP/02-execute-api.md) |
| `data/*.json` (generated) | One JSON chunk per set (lucide, Tabler, Phosphor, Heroicons, logos) + `index.json` | [DESIGN_SYSTEM/05](../DESIGN_SYSTEM/05-icons-assets.md) |

## `@archa/render` — `packages/render/src/` (Canvas2D backend)

| File | Does | Governed by |
|---|---|---|
| [`draw.ts`](../../../packages/render/src/draw.ts) | `drawNode` per type, text wrapping, sticky layout, per-node animation transform | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) |
| [`text.ts`](../../../packages/render/src/text.ts) | `drawText`: rich-text lines or curved letters, underline/strike per run, the 9 text effects; `fontString`, `layoutLines` |
| [`paint.ts`](../../../packages/render/src/paint.ts) | Paints → canvas: `canvasPaint`, `fillPaint` (elliptical radial), image placement, `paintImageSources` | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) |
| [`fonts.ts`](../../../packages/render/src/fonts.ts) | `requestFont` / `preloadFonts` / `onFontLoaded`: web fonts for canvas and one-shot renders | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md) | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`scene.ts`](../../../packages/render/src/scene.ts) | `drawPage` (top-level frames from cache, animating ones live), `renderNodePng` / `renderNodeImage` | [RENDERING/01](../RENDERING/01-canvaskit-pipeline.md), [RENDERING/03](../RENDERING/03-export.md) |
| [`cache.ts`](../../../packages/render/src/cache.ts) | `FrameBitmapCache` keyed by subtree hash + zoom bucket (L4) | [CACHE/01](../CACHE/01-layers-keys.md), [CACHE/02](../CACHE/02-render-tiles.md) |
| [`images.ts`](../../../packages/render/src/images.ts) | Decoded image cache; placeholder until loaded | [CACHE/01](../CACHE/01-layers-keys.md) |
| [`index.ts`](../../../packages/render/src/index.ts) | Re-exports | [STRUCTURE/02](../STRUCTURE/02-packages.md) |

## `@archa/formats` — `packages/formats/src/`

| File | Does | Governed by |
|---|---|---|
| [`archa.ts`](../../../packages/formats/src/archa.ts) | `encodeArcha` / `decodeArcha` (fflate zip), migrations on open, `FormatError` | [FILE_FORMATS/01](../FILE_FORMATS/01-archa.md) |
| [`migrations/archa/index.ts`](../../../packages/formats/src/migrations/archa/index.ts), [`v1-to-v2.ts`](../../../packages/formats/src/migrations/archa/v1-to-v2.ts), [`v2-to-v3.ts`](../../../packages/formats/src/migrations/archa/v2-to-v3.ts), [`v3-to-v4.ts`](../../../packages/formats/src/migrations/archa/v3-to-v4.ts), [`v4-to-v5.ts`](../../../packages/formats/src/migrations/archa/v4-to-v5.ts) | Pure JSON migrations per `formatVersion` step | [FILE_FORMATS/03](../FILE_FORMATS/03-migrations-validation.md) |
| [`svg.ts`](../../../packages/formats/src/svg.ts) | `exportSvg` of a node subtree (text stays text) | [RENDERING/03](../RENDERING/03-export.md) |
| [`import/svg.ts`](../../../packages/formats/src/import/svg.ts) | `importSvg` (SVG markup → vector frame or image node, DOM-free), `svgDataUrl`, `isSvgMarkup`, `extractSvg` | [FILE_FORMATS/04](../FILE_FORMATS/04-importers.md), [MCP/02](../MCP/02-execute-api.md) |
| [`export/html.ts`](../../../packages/formats/src/export/html.ts) | Node → HTML + CSS or Tailwind; standalone page for PDF | [DESIGN_SYSTEM/04](../DESIGN_SYSTEM/04-code-export.md) |
| [`export/tailwind.ts`](../../../packages/formats/src/export/tailwind.ts) | CSS declarations → Tailwind v4 classes | [DESIGN_SYSTEM/04](../DESIGN_SYSTEM/04-code-export.md) |
| [`index.ts`](../../../packages/formats/src/index.ts) | Re-exports | [STRUCTURE/02](../STRUCTURE/02-packages.md) |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [DESIGN_SYSTEM](../DESIGN_SYSTEM.md) · [FILE_FORMATS](../FILE_FORMATS.md)
<!-- backlinks:end -->
