# 01 — The `.archa` format

← [FILES_AND_PROJECTS](../FILES_AND_PROJECTS.md) · [Plan INDEX](../INDEX.md)

One logical format, two encodings.

## Packed: `name.archa` (zip)

```
name.archa
├── manifest.json        { format: "archa", formatVersion: 1, id, name, createdWith, pages: [...], assets: [...] }
├── document.json        meta, variables, styles, components index
├── pages/
│   └── <pageId>.json    nodes of one page (flat map)
├── components/
│   └── <componentId>.json
├── assets/
│   └── <sha256>.<ext>   images, fonts (if embedding allowed), svg
├── comments.json
├── thumbnail.png        first frame, for OS previews and recent-files list
└── plugins.json         plugin ids + versions whose custom nodes appear in the file
```

- Zip with **stored (no compression) for assets**, deflate for JSON, written with fflate.
- Pages split into separate entries so a large file loads the visible page first and the rest lazily.
- Mime type registered as `application/vnd.archadev.archa+zip`.

## Unpacked: a design inside `.archadev/designs/<name>/`

Same entries as files on disk, JSON pretty-printed with **stable key order and one node per line block**, so git diffs show which node changed. Assets go to the project's content-addressed store (`.archadev/assets/`) instead of being duplicated per design.

`archa pack <design>` → `.archa`, `archa unpack file.archa` → project design. Round-trip is lossless and tested.

## Versioning and migration

- `formatVersion` integer. Every bump ships a migration `vN → vN+1` in `packages/formats/migrations/`, with fixture files from every previous version in tests.
- A file newer than the app opens read-only with a message, never silently downgraded.
- Unknown plugin node types are kept verbatim and drawn with their fallback.

## Validation

Loading runs the zod schema from `@archa/schema`. Invalid parts are reported per node and quarantined (kept in the file, hidden from the canvas) rather than failing the whole open.

## Saving

- Atomic: write `name.archa.tmp`, fsync, rename. Previous version kept as `name.archa.bak` (one generation).
- Autosave debounce 2 s after the last op; explicit save is immediate.
- Standalone files also get the op journal under `~/.archadev/journal/<fileId>/` for crash recovery.
