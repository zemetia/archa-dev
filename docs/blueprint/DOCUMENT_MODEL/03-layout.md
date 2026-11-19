# Document Model — 03: Layout

← [DOCUMENT_MODEL.md](../DOCUMENT_MODEL.md) | [Blueprint INDEX](../INDEX.md) | [04 — Hashing →](./04-hashing.md)

**Phase:** 1. Code: `packages/core/src/layout/` (Yoga WASM).

---

## Vocabulary

A narrow layout vocabulary is a quality mechanism: it removes whole classes of bugs agents make. Do not widen it without a decision in `docs/plan/DECISIONS.md`.

| Property (on `frame`) | Values |
|---|---|
| `layout` | `none` \| `row` \| `column` |
| `gap` | number \| var |
| `padding` | `{ top, right, bottom, left }` numbers \| vars |
| `align` (cross axis) | `start` \| `center` \| `end` |
| `justify` (main axis) | `start` \| `center` \| `end` \| `space-between` \| `space-around` (half gaps at the ends; format 3) |
| `wrap` | boolean (row only) |
| `clip` | boolean |

| Property (on any child) | Values |
|---|---|
| `sizing.horizontal`, `sizing.vertical` | `fixed` \| `hug` \| `fill` |
| `minWidth` `maxWidth` `minHeight` `maxHeight` | number |
| `absolute` | boolean — opt out of parent layout, keep x/y |

Not supported, by design: percentages, margins, `stretch`/`baseline` alignment, grid. Grids are rows of frames.

---

## Yoga Mapping

| ArchaDev | Yoga |
|---|---|
| `layout: row/column` | `flexDirection` |
| `fixed` | `width`/`height` set |
| `hug` | `width`/`height` auto, no flexGrow |
| `fill` | `flexGrow: 1`, `flexBasis: 0` on main axis; `alignSelf: stretch` on cross axis |
| `absolute` | `positionType: absolute` |
| Text `auto-width` / `auto-height` | Yoga measure function → text shaper ([CACHE/01](../CACHE/01-layers-keys.md) L2) |

Layout runs **only** for auto-layout frames whose `subtreeHash` changed, bottom-up from dirty nodes to the nearest non-hug ancestor.

---

## Errors vs Issues

| Kind | Examples | Behaviour |
|---|---|---|
| Hard error (transaction rejected) | Percentage/string size, `margin`, unknown property, children on a primitive, `fill` on an axis with no possible parent size, `wrap` on column | `VALIDATION`, rollback |
| Soft issue (applied, reported) | x/y set on a child inside layout (ignored), hug/fill cycle collapsing to 0, text without fill, text overflowing fixed box, child clipped by parent | Returned in `issues[]` → [MCP/03](../MCP/03-response-contract-lint.md) |

Each issue has a stable `rule` id (e.g. `layout/xy-ignored`) so projects can disable rules.

---

## Arrange (built 0.5, `@archa/core` `arrange.ts`)

| Command | Behaviour |
|---|---|
| `alignOps(ids, edge, to?)` | One free layer → its parent frame; several → their bounds. Layers placed by auto layout change the parent's `align`/`justify` (`axisKey`). A lone top-level layer returns a note, no ops |
| `distributeOps(ids, axis, gap?)` | Equal spacing (3+), or packed with `gap`; auto-layout children set the parent's gap |
| `wrapOps(ids, frame)` | Siblings into a new frame at their place; `layout: row/column/auto` makes it hug auto layout in reading order |
| `placementOf` / `placementPatch` | 9-dot screen placement ↔ align/justify for the frame's direction |

Ops only; the panel, CLI and `execute` commit them.

---

## Geometry Reads

`get(id)` returns resolved `bounds` (world + local), `clipped: 'none' | 'partial' | 'full'`, and `overflow` flags — a cheap whole-screen clipping check for agents without a screenshot.
