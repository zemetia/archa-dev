# App UI — 01: Shell, Tools and Panels

← [APP_UI.md](../APP_UI.md) | [Blueprint INDEX](../INDEX.md) | [02 — Components and tokens →](./02-components-tokens.md)

**Phase:** 2 (shell, core tools), 8 (review), 11 (Inspect). Code: `apps/desktop/src/renderer/`.

---

## Renderer Layout

```
src/renderer/
├── main.tsx              root, connect core, providers
├── app/                  Shell.tsx, StartScreen.tsx, routes per workspace
├── canvas/               CanvasView, input/ (pointer, keyboard → ops), overlays/, tools/
├── features/
│   ├── layers/  design-panel/  inspect/  variables/  library/
│   ├── comments/  review/  activity/  issues/  agents/  palette/
│   └── settings/
├── stores/               Zustand view stores → 03-state.md
└── lib/                  core client hook, shortcuts registry, formatters
```

---

## Shell

```
┌ Title bar: project/file · pages · agent status · export · ⋯ ───────────────┐
├ Tool rail ┬ Left panel ┬──────────── Canvas ─────────────┬ Right panel ──────┤
│           │ Layers     │                                 │ Design / Inspect  │
│           │ Assets/Lib │                                 │                   │
│           │ Comments   │                                 │                   │
│           │ Activity   │                                 │                   │
│           │ Issues     │                                 │                   │
├───────────┴────────────┴─────────────────────────────────┴───────────────────┤
│ Agent dock: runs, timeline, steer box, decisions (collapsible)               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Tool Rail

Built today (`ui/ToolRail.tsx`, keys in `TOOL_KEYS`): a family button shows its last tool; the chevron under it opens the family (check = active).

| Rail item | Key | Family / behaviour | Code |
|---|---|---|---|
| Pointer | V · K · H (Space) | Move, Scale (resize scales the whole subtree: text, strokes, radii, gap, padding), Hand | `canvas/Canvas.tsx`, `canvas/scale.ts` |
| Shapes | R · O | Rectangle, Ellipse, Polygon, Icon (lucide picker → vector), Script (soon), Import image or SVG (Ctrl+Shift+K), Import Figma (soon). Ctrl+V on the canvas imports a clipboard image / SVG markup; layers copied in-app win while the `archadev:layers` mark is still on the clipboard | `lib/importers.ts`, `lib/commands.ts` |
| Pen | P | Click points, drag for curves, click first point to close, Enter/Esc finish, Backspace undoes a point | `canvas/pen.ts` |
| Text · Frame | T · F | | |
| Sticky note | S | Click/drag on the page; edits in place | |
| Web page | B | Live page on the page; double-click to scroll/click inside, Esc leaves; URL bar above when selected | `canvas/EmbedLayer.tsx` |
| Comment | C | Pins + threads; right panel becomes Comments | `canvas/CommentsLayer.tsx`, `ui/CommentsPanel.tsx` |
| Variables | | Floating table: name, typed value, duplicate/delete, add colour/number/string | `ui/RailPanels.tsx` |
| Find layer | Ctrl+F | Search names, text and URLs; Enter selects + zooms | `ui/RailPanels.tsx` |

Image import keeps pixels in the node (downscaled to 2048 px); SVG becomes a frame of vectors when it has no rotation, text, gradients or `<use>`, else an image. Planned: pencil, line/arrow/star, section and device presets, components entry, `…` menu.

A tool is `{ id, cursor, onPointerDown/Move/Up, onKey }` producing ops through the core client — never mutating the view model directly except as optimistic pending ops.

---

## Collapsible Sidebars

| Rule | Detail |
|---|---|
| Toggle | Left: Ctrl+\ or the tool-rail top button. Right: Ctrl+Shift+\ (`e.code === 'Backslash'`), header button; a floating "Design" button reopens it |
| Layout | Wrapper animates `width` to 0 and carries its own 8px gutter; the inner column keeps a fixed width so nothing reflows mid-animation. Canvas follows via its ResizeObserver |
| State | `leftOpen` / `rightOpen` in the view store, remembered in localStorage (`archa.leftOpen`, `archa.rightOpen`), try/catch, default open |
| Chat composer | Thread lives in the left card; the composer is its own card below (agent colour dot, violet send, target-document chip). Suggestion chips fill `chatDraft`, never send |

---

## Left Menu

Header row (`LeftTab` in the store): **Chat** on the left (also active while History is open), **Layers · Components · Slides · Library** right-aligned. No History or collapse button in this row — History opens from the chat header, collapsing from the tool rail / Ctrl+\. Non-chat tabs get a title row.

| Tab | Content | Code |
|---|---|---|
| Chat | Current conversation (`chatThread`; null = new). Header: History, New chat | `ui/ChatPanel.tsx` |
| History | Conversations of this document, newest first (`chatThreads()`), open = resume, two-click delete | `ui/HistoryPanel.tsx` |
| Layers | Tree; components/instances show a violet icon | `ui/LayersPanel.tsx` |
| Components | Make from selected frame, description (agents read it), Insert, Sync, Publish, Unmake; instance bar: Reset / Go to main / Detach | `ui/ComponentsPanel.tsx` |
| Slides | Every visible top-level frame as a thumbnail at its own aspect ratio (height capped at 420), click = select + zoom | `ui/SlidesPanel.tsx` |
| Library | Global library items with search; click inserts (main first, then instances); two-click remove | `ui/LibraryPanel.tsx` |

Thumbnails: `lib/thumbs.ts` renders with `renderNodePng`, cached by subtree hash, debounced 250 ms.

---

## Panels

| Panel | Content |
|---|---|
| Layers | Virtualised tree → [RENDERING/02](../RENDERING/02-layers-hit-testing.md) |
| Design | Position, sizing modes, auto-layout, fills/strokes/effects with variable pickers, text, component props, theme switcher |
| Inspect | Computed values + variable behind each; live DOM styles for code frames |
| Variables | → [DESIGN_SYSTEM/01](../DESIGN_SYSTEM/01-variables-themes.md) |
| Issues | Lint for the current page |
| Activity / Comments | → [AGENT_BRIDGE/04](../AGENT_BRIDGE/04-review-loop.md) |

---

## Workspaces

| Workspace | Surface |
|---|---|
| Design | Canvas |
| Inspect | One code frame live; pointers Select / Comment / Interact |
| History | Overlay over either: rounds scrubber, before/after |

---

## Shortcuts

Registry `lib/shortcuts.ts`: id, default keys per platform, scope (global / canvas / text). Remappable in Settings; `?` opens the cheatsheet. Ctrl+K palette, Ctrl+L handoff.
