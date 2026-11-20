# ArchaDev tools for website design

Inside ArchaDev (chat runs, or any agent connected to the `archadev` MCP server) you design on the
live canvas first and write code second. The tools are named `mcp__archadev__<tool>`.

| Tool | Use it to | Notes |
|---|---|---|
| `get_state` | See the open document: page root, selection, top-level frames, components, variables | Call first unless the state was given to you |
| `read_guide` | Read a built-in guide: `process`, `layout`, `taste`, `type-color`, `components`, `icons`, `landing`, `web-app`, `mobile` | The core guides are usually pre-loaded; fetch only what you lack |
| `execute` | Build: one JS snippet = one transaction (insert, update, setVariable, makeComponent, instance, icon, align, wrap…) | One **section** per call, end with `screenshot()`. On failure, patch with `editId` + `edits` |
| `inspect` | Read an existing design cheaply (outline of a frame) | Cheaper than `get()`; use it before changing someone's design |
| `screenshot` | PNG of a node | Look after every section, and at the end of the whole page |
| `export_svg` | SVG markup of a node | For icons or logos you drew on the canvas |
| `say` | One-line progress note in the activity feed | Between sections; it is a separate tool, **not** a function inside `execute` |
| `browser` | Drive the in-app Chromium tab: `open`, `snapshot`, `screenshot`, `resize {width, mobile}`, `evaluate`… | Study reference sites, and check the coded page on localhost at 390 / 768 / 1440 |
| `delegate`, `wait_workers`, `tell_worker` | Orchestrate mode only: split a page into sections built by parallel workers | Build the tokens and empty section frames yourself first |

From the shell, `archa browser <action>` drives the same in-app browser, and `archa status` checks
that the app is running.

## The canvas workflow for a website

1. `get_state`. Reuse the existing variables and components; never restyle someone's design from scratch.
2. **Tokens**: `setVariable('color/bg' | 'color/surface' | 'color/text' | 'color/muted' | 'color/border' | 'color/accent', '#hex')` and `radius/md`.
3. **Skeleton**: one top-level frame per breakpoint at `findEmptySpace()`: `Landing / Desktop` (1440) and
   `Landing / Mobile` (390). Add the empty named section frames inside (column layout, fill width, hug height).
4. **Sections**: one `execute` call per section. Repeated pieces (button, card, nav item, pricing row) are
   built once, then `makeComponent(frame, 'purpose')`, then placed with `instance()`. Icons use
   `icon('arrow-right', parent, { size: 18, color })` (the Lucide set; find names with `icons('query')`).
5. **References**: `browser open <url>` + `screenshot`, or an `embed` node (`{ type: 'embed', url }`) on
   the canvas next to your frames, so the person sees what you are drawing from.
6. **Review**: `screenshot` each frame, read the `Issues` list in every reply, and fix with `update()`
   rather than deleting and rebuilding.
7. **Hand-off to code**: the person can export a frame from the Design panel as HTML + CSS or
   HTML + Tailwind (also PNG, JPG, SVG and PDF). Build the real site from the same tokens, then
   compare it with the design in `browser` (`resize { width: 390, mobile: true }`).

## execute gotchas (seen in real runs)

- `say` is not available inside `execute`; call the `say` tool separately.
- Strokes go round the whole box. A divider between rows is a 1px `rect` with `sizing.horizontal: 'fill'`.
- Inside auto layout, `x`/`y` are ignored; change the parent's `align`/`justify`/`gap` instead.
- `fill` sizing only works inside an auto-layout parent.
- Text needs `fills`, and wrapping text needs `textSizing: 'auto-height'` plus a fill or fixed width.
- Globals assigned without `const`/`let` persist between calls (`page`, `C`, component ids).
- Empty skeleton frames report `layout/collapsed` until you fill them, which is expected.

See [../examples/canvas-landing.js](../examples/canvas-landing.js) for the first two calls of a real
landing page, run through the real executor.
