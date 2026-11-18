# 03 — Cache system

← [ARCHITECTURE](../ARCHITECTURE.md) · [Plan INDEX](../INDEX.md)

The cache is what keeps a 20k-node file at 60 fps and keeps agent loops cheap. Rule: **every cache is derivable**. Deleting any cache directory costs time, never data.

## Content hashing (the key to everything)

Every node has two hashes, maintained incrementally by the core when ops apply:

| Hash | Covers | Used for |
|---|---|---|
| `selfHash` | The node's own resolved properties (after variable resolution for the active theme) | Per-node raster cache |
| `subtreeHash` | `selfHash` + children's `subtreeHash` in order (Merkle) | Frame thumbnails, screenshots, export cache, "did this frame change?" for agents |

An op dirties one node; the hash change walks up to the root only. Theme switch or variable edit dirties exactly the nodes that reference those variables (reverse index variable → nodes).

## Layers of cache

| Layer | Lives in | Key | Contents | Eviction |
|---|---|---|---|---|
| L0 Scene indexes | Core host memory | — | Node map, parent/child, variable reverse index, name index, **R-tree (rbush)** of world bounds per page | Rebuilt on load |
| L1 Layout cache | Core memory | `subtreeHash` of auto-layout frame + constraints | Computed Yoga boxes | Dropped with the node |
| L2 Text shaping | Core memory + disk | font + size + text + width | Line breaks, glyph runs, measured size | LRU 64 MB |
| L3 Raster tiles | Renderer GPU/CPU memory | page + zoom bucket + tile x/y + covered nodes' hashes | 512 px tiles | LRU by GPU budget (default 512 MB) |
| L4 Node bitmaps | Renderer memory | `selfHash` / `subtreeHash` + scale | Cached rasters for complex nodes (blurs, shadows, big paths) | LRU |
| L5 Thumbnails | Disk `.archadev/cache/thumbs/` | `subtreeHash` | PNG of each top-level frame | Size cap 200 MB |
| L6 Asset store | Disk, content-addressed `sha256` | hash | Images, fonts, SVGs, imported files; decoded-image mip levels | Ref-counted; unreferenced after 30 days |
| L7 Agent cache | Core memory + disk | `subtreeHash` + viewport + scale | Screenshots and exports already sent to an agent; `get_state` digests | LRU |

Locations:

- Per project: `.archadev/cache/` (gitignored by the generated `.gitignore`).
- Global: `~/.archadev/cache/` for fonts, plugin bundles, the asset store of standalone files.
- An index (`cache/index.sqlite`, better-sqlite3) records sizes and last use so eviction does not have to stat the disk.

## Rendering pipeline using the cache

1. Viewport change → R-tree query gives visible nodes.
2. For each visible tile, compute tile key from the hashes of nodes intersecting it.
3. Hit → blit. Miss → enqueue to the render worker; draw the lower-zoom tile scaled meanwhile (no blank tiles).
4. During pan/zoom gestures render only cached tiles + low-res; full quality when the gesture ends.

## What agents get from the cache

- `screenshot(nodeId)` returns the cached image if `subtreeHash` matches the last one sent — and says "unchanged since your last screenshot" instead of sending the image again. Accent's cost data showed screenshots dominate token cost.
- `get_state` is pre-computed and incrementally updated, so it can be pre-injected into an agent's first turn (pen's trick that saves a round trip).

## Performance targets (checked by benchmarks in CI)

| Scenario | Target |
|---|---|
| Open 20k-node `.archa` (cold) | < 1.5 s to first paint |
| Open same file (warm cache) | < 400 ms |
| Pan/zoom on 20k nodes | 60 fps, no frame > 32 ms |
| Single property edit → repaint | < 16 ms |
| Theme switch on 5k themed nodes | < 100 ms |
| Agent `execute` creating 200 nodes + screenshot | < 500 ms excluding model time |

Benchmarks live in `packages/core/bench` and run against generated fixture documents.
