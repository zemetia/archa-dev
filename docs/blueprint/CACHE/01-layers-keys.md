# Cache — 01: Layers and Keys

← [CACHE.md](../CACHE.md) | [Blueprint INDEX](../INDEX.md) | [02 — Render tiles →](./02-render-tiles.md)

**Phase:** 3 (L0–L2 in phase 1). Code: `packages/core/src/cache/`, `packages/render/src/cache/`.

---

## Layer Table

| Layer | Lives in | Key | Value | Invalidated by | Budget / eviction |
|---|---|---|---|---|---|
| L0 Scene indexes | Core memory | — | Node map, parent/children, reverse indexes, R-tree per page | Op applier (in place) | Rebuilt on load |
| L1 Layout | Core memory | `subtreeHash` of auto-layout frame | Yoga boxes for its subtree | Hash change | Dropped with node |
| L2 Text shaping | Core memory + `cache/text/` | `font, size, features, text, width` | Line breaks, glyph runs, measured size | Font file change | LRU 64 MB mem, 128 MB disk |
| L3 Raster tiles | Renderer GPU/CPU | `page, zoomBucket, tx, ty, tileHash` | 512×512 bitmap | `tileHash` change | LRU, GPU budget 512 MB (setting) |
| L4 Node bitmaps | Renderer memory | `selfHash` or `subtreeHash` + scale | Raster of expensive nodes (blur, shadow, big paths, boolean) | Hash change | LRU 128 MB |
| L5 Thumbnails | `.archadev/cache/thumbs/` | top-level frame `subtreeHash` + size | PNG | Hash change | 200 MB per project |
| L6 Asset store | `.archadev/assets/`, `~/.archadev/cache/assets/` | sha256 | Original file + decoded mip levels in `cache/mips/` | Never (content-addressed) | Ref-count; unreferenced > 30 days |
| L7 Agent cache | Core memory + `cache/agent/` | `runId/clientId, subtreeHash, viewport, scale` | Last image/digest sent to that agent | Hash change | LRU 50 entries per client |

---

## Key Construction

```ts
// packages/core/src/cache/keys.ts
tileHash  = xxh64(sorted(nodesIntersectingTile.map(n => n.selfHash + n.worldTransformHash)))
thumbKey  = `${frame.subtreeHash}@${w}x${h}`
agentKey  = `${client}:${node.subtreeHash}:${scale}`
```

`zoomBucket` = nearest power of two of zoom (… 0.25, 0.5, 1, 2, 4 …) so small zoom changes reuse tiles scaled.

---

## Invalidation Flow

```
transaction applied
  → dirty node set (core)
  → hashes recomputed (DOCUMENT_MODEL/04)
  → event cache.invalidated { pageId, dirtyBounds[] }   (core → renderer)
  → renderer marks tiles intersecting dirtyBounds stale (not deleted: shown until replaced)
```

Stale tiles stay visible until the fresh tile is ready — no flashing.

---

## Rules

| # | Rule |
|---|---|
| 1 | A cache module exposes `get`, `set`, `stats()`, `clear()` and declares its budget |
| 2 | No cache stores anything that is not reproducible from the document + assets |
| 3 | Disk caches write via temp file + rename; corrupted entry = miss, then delete |
| 4 | Cache format changes bump the cache's own `version` folder (`cache/v2/…`) instead of migrating |
