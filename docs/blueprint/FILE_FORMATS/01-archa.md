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

`formatVersion` 2 (current): `document.json` = `{ meta, variables, comments }`; v1 files migrate on open (`packages/formats/src/migrations/archa/`, fixture `test/fixtures/archa-v1/`). Images live inline as data URLs in v2 — `assets/` arrives with the asset store.

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
