# File Formats — 01: `.archa`

← [FILE_FORMATS.md](../FILE_FORMATS.md) | [Blueprint INDEX](../INDEX.md) | [02 — Project →](./02-archadev-project.md)

**Phase:** 1. Code: `packages/formats/src/archa/`.

---

## Packed — `name.archa` (zip)

| Entry | Content | Compression |
|---|---|---|
| `manifest.json` | `{ format: "archa", formatVersion, id, name, createdWith, pages: [{id, name, entry}], assets: [{hash, mime, bytes}], plugins: [{id, version}] }` | deflate |
| `document.json` | meta, variables, styles, components index | deflate |
| `pages/<pageId>.json` | Flat node map of one page | deflate |
| `components/<componentId>.json` | Component definition subtree | deflate |
| `assets/<sha256>.<ext>` | Images, SVG, fonts (if licence allows) | **stored** |
| `comments.json` | Threads | deflate |
| `thumbnail.png` | First frame, 512 px | stored |

- MIME: `application/vnd.archadev.archa+zip`.
- `manifest.json` is the first entry so it can be read without inflating the rest.
- Pages load lazily: visible page first, others on demand.

`formatVersion` 5 (current, `FORMAT_VERSION` in `packages/schema/src/document.ts`): `document.json` = `{ meta, variables, comments }`; v5 lets image sources (image nodes and image paints) be `asset:` references (below). Older files migrate on open (`packages/formats/src/migrations/archa/`, fixtures `test/fixtures/archa-v<N>/`). The `assets/` zip entry above is not built — images live in the data folder instead.

---

## Data Folder — `<name>-data/` (built, v5; `<name>-asset/` before 1.7.3)

| Path | Content |
|---|---|
| `landing.archa` | The document — no base64 anywhere |
| `landing-data/assets/<kind>/<sha256-24>.<ext>` | Asset files, content-addressed, by type: `images/`, `svg/`, `videos/`, `fonts/`, `files/` (`assetKind`). Nodes say `src: "asset:images/<file>"` — `asset:` resolves inside `assets/` |
| `landing-data/chats/<threadId>.json` | One conversation each → [AGENT_BRIDGE/03 → Chat History](../AGENT_BRIDGE/03-runs-steering.md) |
| `landing-data/chats/attachments/<threadId>/` | Images pasted into that conversation (`asset:chats/…`, resolved against the data folder) |
| `landing-data/skills/<name>/SKILL.md` | The document's own skills → [AGENT_BRIDGE/05](../AGENT_BRIDGE/05-skills-mcp.md) |
| `landing-data/memory/<slug>.md` | The document's agent memory → [AGENT_BRIDGE/07](../AGENT_BRIDGE/07-memory.md) |
| `landing-data/reference/<file>-p<N>.json` | `reference` output → [MCP/05](../MCP/05-reference-compare.md) |

| Rule | Detail |
|---|---|
| Arrival | Every transaction passes `DocumentSession.transformOps` (`core-host/assets.ts`): a data: URL, absolute image path or `file://` URL in an image node `src` or an image paint `src` is copied into `assets/images/` first. Listeners, undo and the file only ever see `asset:` |
| Other sources | `http(s)` URLs stay as they are (loaded through the host proxy) |
| Opening older files | Base64 images are written out on open; the document is marked dirty so the next save drops them |
| Unsaved | Folder lives in `ARCHA_HOME/runtime/data/<docId>/`; the first save moves it next to the file. Save As copies it to `<new name>-data/` |
| Pre-1.7.3 folder | `migrateDataDir` on open and on save: `<name>-asset/` → `<name>-data/`, its `chats/` and `reference/` keep their place, everything else moves under `assets/`. References are unchanged (no format bump). A file already in the new place is never overwritten |
| Exports, libraries | `inlineData` turns `asset:` back into data: URLs for HTML/SVG/PDF export and published library components (they must stand alone) |
| Loading | Renderer resolves `asset:` with `DocSummary.assetDir` (chat thumbnails: `DocSummary.dataDir`) → `archa-asset://file/<path>`; web images → `archa-asset://remote/<url>`. Main serves only image files inside a `*-data` (or pre-1.7.3 `*-asset`) folder or `ARCHA_HOME/runtime`, with CORS so canvases stay exportable |
| Cleanup | Files are never deleted automatically — an unreferenced image costs disk, a deleted one loses data |

---

## Unpacked — `.archadev/designs/<name>/`

Same entries as files, except `assets/` → the project's shared store `.archadev/assets/`.

| Rule | Why |
|---|---|
| JSON with 2-space indent, **stable key order** (schema order), LF | Meaningful git diffs |
| One node per object entry, nodes sorted by id | A changed node = a local diff hunk |
| No derived data (no hashes, no layout results) | Derivable → cache |
| `thumbnail.png` not written | Lives in `cache/thumbs/` |

---

## API

```ts
readArcha(path): Promise<Document>                 // packed
writeArcha(doc, path): Promise<void>               // atomic
readDesign(projectDir, name): Promise<Document>    // unpacked
writeDesign(doc, projectDir, name): Promise<void>
pack(projectDir, name, outPath) / unpack(path, projectDir, name)
```

Round-trip `pack ∘ unpack` and `unpack ∘ pack` are lossless — tested on every fixture.

---

## Saving

| Step | Rule |
|---|---|
| Write | `<path>.tmp` → fsync → rename over target |
| Backup | Previous file → `<path>.bak` (one generation) |
| Unpacked | Only changed page/component files rewritten; written to `.tmp` then renamed per file |
| Trigger | Autosave 2 s after last op; Ctrl+S immediate → [ARCHITECTURE/03](../ARCHITECTURE/03-startup-lifecycle.md) |
| External change | Watcher detects a git checkout/pull on unpacked files → reload with a notice; unsaved local ops are rebased or offered as a conflict |

<!-- backlinks:start — generated by `node scripts/gen-backlinks.mjs`; do not edit by hand -->

---

**Linked from:** [AGENT_BRIDGE/07](../AGENT_BRIDGE/07-memory.md) · [FILE_FORMATS/05](./05-design-folder-projects.md) · [REFERENCE](../REFERENCE.md)

**Code:** [`apps/desktop/src/core-host/assets.ts`](../../../apps/desktop/src/core-host/assets.ts) · [`apps/desktop/src/main/asset-paths.ts`](../../../apps/desktop/src/main/asset-paths.ts) · [`apps/desktop/src/main/assets-protocol.ts`](../../../apps/desktop/src/main/assets-protocol.ts) · [`apps/desktop/src/renderer/lib/asset-urls.ts`](../../../apps/desktop/src/renderer/lib/asset-urls.ts) · [`apps/desktop/test/assets.test.ts`](../../../apps/desktop/test/assets.test.ts) · [`packages/formats/src/archa.ts`](../../../packages/formats/src/archa.ts) · [`packages/formats/test/archa.test.ts`](../../../packages/formats/test/archa.test.ts) · [`packages/schema/src/document.ts`](../../../packages/schema/src/document.ts)
<!-- backlinks:end -->
