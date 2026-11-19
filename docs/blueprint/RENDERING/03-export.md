# Rendering — 03: Export

← [RENDERING.md](../RENDERING.md) | [Blueprint INDEX](../INDEX.md)

**Phase:** 1 (PNG/SVG headless), 9 (full set). Code: `packages/render/src/export/`, code exporters in `packages/formats/src/export/`.

---

## Formats

| Format | Engine | Options |
|---|---|---|
| PNG / JPEG / WebP | CanvasKit raster | `scale` (0.25–4), `background`, `quality` |
| SVG | Scene walk → SVG elements (vector, no raster) | `outlineText`, `embedImages` |
| PDF | Skia PDF backend (target). **Now:** the node's self-contained HTML page printed by Chromium in a hidden window (`apps/desktop/src/main/pdf.ts`), one page sized to the node | Multi-frame → multi-page |
| HTML/CSS, React+Tailwind, tokens | Code generators (not renderers) → [DESIGN_SYSTEM/04](../DESIGN_SYSTEM/04-code-export.md) | |

---

## API

```ts
exportImage(doc, { nodeId, format: 'png', scale: 2 }): Promise<Uint8Array>
exportSvg(doc, { nodeId, outlineText: false }): Promise<string>
exportPdf(doc, { nodeIds }): Promise<Uint8Array>
```

Same API from the app (via RPC `export.*`), CLI (`archa export`) and MCP (`export`, `screenshot`).

**App flow now:** PNG/JPEG render in the renderer (`renderNodeImage`, JPEG drawn on white) and go to `export.save` as base64; SVG and HTML/Tailwind are written by the core from `export.save`; PDF takes `export.page` (HTML) from the core and is printed by main over `export:pdf`. Formats: `ExportFormat` in `@archa/protocol`.

---

## Screenshots for Agents

| Rule | Detail |
|---|---|
| Default | PNG, scale chosen so the longest side ≤ 1568 px |
| Smallest node | Agents are told to screenshot the smallest meaningful node, not the page |
| Dedup | If `subtreeHash` equals the last one sent to that client → reply `unchanged since your last screenshot` with no image (L7) |
| Placeholders | Nodes with pending generated images draw a labelled placeholder; reply notes they are pending |

---

## Export Cache

Key `exportKey = xxh64(nodeId.subtreeHash, format, options)` → `~/.archadev/cache/export/`. Re-exporting an unchanged frame is a file copy.

---

## Tests

- Golden PNG per node type fixture.
- SVG export re-imported through the SVG importer → render → pixel diff ≤ 0.5%.
- PDF: page count and text extractable.
