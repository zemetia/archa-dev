# Code Map — 06: Tests

← [CODE_MAP.md](../CODE_MAP.md) | [Blueprint INDEX](../INDEX.md) | [← 05](./05-interfaces.md)

One Vitest run (`vitest.config.ts`: `packages/*/test/**`, `apps/*/test/**`, Node environment). Run with `corepack pnpm@9.15.0 test`; one file with `corepack pnpm@9.15.0 exec vitest run <path>`. Rules → [BEST_PRACTICE/02](../BEST_PRACTICE/02-testing.md). Every test that touches disk sets `ARCHA_HOME` to a temp dir.

---

## packages

| Test | Covers | Code under test | Governed by |
|---|---|---|---|
| [`core/test/core.test.ts`](../../../packages/core/test/core.test.ts) | Friendly insert + column layout, fill-width text wrap before hug, bad property rejected atomically, no children on primitives, per-author undo restores hashes, lint | `session.ts`, `apply.ts`, `factory.ts`, `layout.ts`, `hash.ts`, `lint.ts` | [DOCUMENT_MODEL/02](../DOCUMENT_MODEL/02-ops-transactions-undo.md), [DOCUMENT_MODEL/03](../DOCUMENT_MODEL/03-layout.md), [MCP/03](../MCP/03-response-contract-lint.md) |
| [`core/test/arrange.test.ts`](../../../packages/core/test/arrange.test.ts) | Align (free, multi, lone top-level explains), auto-layout child sets parent, distribute, wrap in reading order, 9-dot grid | `arrange.ts` | [DOCUMENT_MODEL/03](../DOCUMENT_MODEL/03-layout.md), [APP_UI/04](../APP_UI/04-design-panel.md) |
| [`core/test/connectors.test.ts`](../../../packages/core/test/connectors.test.ts) | Elbow from facing sides (90° only), straight edge to edge, follows a moved node and stays when it is deleted, free end + explicit side, rounded corners and caps | `connectors.ts`, `factory.ts` | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`core/test/components.test.ts`](../../../packages/core/test/components.test.ts) | Make component, instance copy, sync keeps position, unmake detaches, refusals, library insert main-then-instances | `components.ts` | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md) |
| [`core/test/grid.test.ts`](../../../packages/core/test/grid.test.ts) | Grid frames: wrap to a new line, equal / hugging tracks, column grids, CSS grid spellings, outline; blur shorthands and `effect/blur-hidden` | `layout.ts`, `factory.ts`, `lint.ts` | [DOCUMENT_MODEL/03](../DOCUMENT_MODEL/03-layout.md) |
| [`core/test/fidelity.test.ts`](../../../packages/core/test/fidelity.test.ts) | Gradient / image paints and input shorthands, rich-text pieces and span remapping, token bindings (insert, setVariable, undo, unbind by hand, `$name`), components v2 overrides / props / variants | `bindings.ts`, `text.ts`, `components.ts`, `apply.ts`, `factory.ts` | [DESIGN_SYSTEM/01](../DESIGN_SYSTEM/01-variables-themes.md), [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md) |
| [`formats/test/fidelity.test.ts`](../../../packages/formats/test/fidelity.test.ts) | v4 fixture, HTML backgrounds / spans / `var(--token)`, SVG gradients, patterns and tspans | `export/html.ts`, `svg.ts` | [DESIGN_SYSTEM/04](../DESIGN_SYSTEM/04-code-export.md) |
| [`formats/test/archa.test.ts`](../../../packages/formats/test/archa.test.ts) | Lossless round trip, variables / comments / new node types, v1 and v2 fixtures migrate, garbage rejected | `archa.ts`, `migrations/archa/*` | [FILE_FORMATS/01](../FILE_FORMATS/01-archa.md), [FILE_FORMATS/03](../FILE_FORMATS/03-migrations-validation.md) |
| [`formats/test/html.test.ts`](../../../packages/formats/test/html.test.ts) | HTML + CSS (flex, hug, fill, absolute), Tailwind single file, standalone PDF page, Tailwind mapping | `export/html.ts`, `export/tailwind.ts` | [DESIGN_SYSTEM/04](../DESIGN_SYSTEM/04-code-export.md) |
| [`formats/test/text.test.ts`](../../../packages/formats/test/text.test.ts) | Letter case, list markers, curve box and layout, effect validation, outline, CSS / SVG export of effects and curves | `core/src/text.ts`, `formats/src/export/html.ts`, `formats/src/svg.ts` | [DOCUMENT_MODEL/01](../DOCUMENT_MODEL/01-nodes-properties.md) |
| [`formats/test/svg-import.test.ts`](../../../packages/formats/test/svg-import.test.ts) | SVG → vectors (paint, bounds, viewBox), baked transforms and arcs, `<style>` rules, image fallback + reason, script stripping, SVG detection in text | `import/svg.ts` | [FILE_FORMATS/04](../FILE_FORMATS/04-importers.md) |

Fixtures: `packages/formats/test/fixtures/archa-v1/`, `archa-v2/` — every `formatVersion` bump adds one.

## apps/desktop

| Test | Covers | Code under test | Governed by |
|---|---|---|---|
| [`test/accounts.test.ts`](../../../apps/desktop/test/accounts.test.ts) | Claude / Codex / agy identity without exposing tokens, managed profiles under `ARCHA_HOME`, Codex API key, param validation | `core-host/accounts.ts` | [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`test/agent-adapters.test.ts`](../../../apps/desktop/test/agent-adapters.test.ts) | argv / stdin per agent (no shell, user hooks kept out), argv length trim, image attachments, Codex `-c` MCP overrides, stream parsers | `core-host/agent-adapters.ts` | [AGENT_BRIDGE/01](../AGENT_BRIDGE/01-adapter-interface.md), [AGENT_BRIDGE/02](../AGENT_BRIDGE/02-roster-profiles.md) |
| [`test/agents-live.test.ts`](../../../apps/desktop/test/agents-live.test.ts) | Real agent CLI runs; skipped unless `ARCHA_AGENT_IT=1` (`ARCHA_AGENT_IT_AGENTS` picks agents) | `core-host/agents.ts` | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md), [BEST_PRACTICE/02](../BEST_PRACTICE/02-testing.md) |
| [`test/orchestra.test.ts`](../../../apps/desktop/test/orchestra.test.ts) | Team tools refused outside orchestrate mode, parallel delegate + wait + tell, stop cascade, auto report to the lead | `core-host/agents.ts`, `core-host/workspace.ts` | [AGENT_BRIDGE/06](../AGENT_BRIDGE/06-orchestrate.md) |
| [`test/warm.test.ts`](../../../apps/desktop/test/warm.test.ts) | Warm process per thread, queue, interrupt; design-guide picking; `icon()` + auto-fix + screenshot; `svg()` vectors / image fallback / SVG-in-text redirect; forgiving `execute` input | `core-host/agents.ts`, `execute.ts`, `protocol/design-guides.ts` | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md), [MCP/02](../MCP/02-execute-api.md), [MCP/04](../MCP/04-local-skill.md) |
| [`test/sessions.test.ts`](../../../apps/desktop/test/sessions.test.ts) | Unique session names + colours, terminal agent gets a name, `execute` trail order + `copy()`, two parallel threads on one doc | `core-host/personas.ts`, `execute.ts`, `agents.ts` | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| [`test/chat-details.test.ts`](../../../apps/desktop/test/chat-details.test.ts) | Tool rows keep their input and get the result under the same id (live + history file); `/skill` and `/guide` mentions reach the prompt, unknown names do not | `core-host/agents.ts`, `skills.ts` | [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md), [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`test/export-pages.test.ts`](../../../apps/desktop/test/export-pages.test.ts) | Multi-page PDF: page order follows the canvas (rows, then left to right), nested selected layers are not duplicated | `renderer/lib/geometry.ts` | [RENDERING/03](../RENDERING/03-export.md) |
| [`test/settings.test.ts`](../../../apps/desktop/test/settings.test.ts) | Skill frontmatter, `SkillManager` create / toggle / delete / import, MCP secrets stay in the core, validation | `core-host/skills.ts`, `mcp-servers.ts` | [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| [`test/library.test.ts`](../../../apps/desktop/test/library.test.ts) | Publish with manifest + thumbnail, cross-document round trip, re-publish updates, unsafe names rejected | `core-host/library.ts` | [DESIGN_SYSTEM/02](../DESIGN_SYSTEM/02-components-libraries.md) |
| [`test/browser.test.ts`](../../../apps/desktop/test/browser.test.ts) | URL normalising, refusing script schemes, address vs search | `main/browser-url.ts` | [BROWSER](../BROWSER.md) |
| [`test/browser-images.test.ts`](../../../apps/desktop/test/browser-images.test.ts) | Search URLs, type sniffing, file names, saving without overwrite, `place_image` sizing and parent | `main/browser-image.ts`, `core-host/workspace.ts` | [BROWSER](../BROWSER.md#images) |
| [`test/rotation.test.ts`](../../../apps/desktop/test/rotation.test.ts) | Turned corners, hit testing, rotate knob, resize keeps the opposite corner, SVG/HTML rotate export, `done` event and cursor fade | `renderer/lib/geometry.ts`, `canvas/cursors.ts`, `core-host/workspace.ts` | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`test/changes.test.ts`](../../../apps/desktop/test/changes.test.ts) | Which changes animate, pop-in + sibling glide, delete closes gap, interrupted glide | `renderer/canvas/changes.ts` | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| [`test/cursors.test.ts`](../../../apps/desktop/test/cursors.test.ts) | Cursor never teleports, clicks only on change, hides after the session ends | `renderer/canvas/cursors.ts` | [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |

---

## Gaps (no test yet)

`packages/render` (no golden images), `core-host/workspace.ts` RPC handlers end to end, renderer UI (no Playwright `_electron` suite), `apps/cli`. Targets → [BEST_PRACTICE/02](../BEST_PRACTICE/02-testing.md).

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** — (only its hub and the indexes)
<!-- backlinks:end -->
