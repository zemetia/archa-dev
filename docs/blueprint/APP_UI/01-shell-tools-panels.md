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

| Tool | Key | Dropdown | Code |
|---|---|---|---|
| Select | V | select / scale | `canvas/tools/select.ts` |
| Shape | R | rect, ellipse, line, arrow, polygon, star, image | `tools/shape.ts` |
| Pen | P | pen, pencil | `tools/pen.ts` |
| Text | T | | `tools/text.ts` |
| Frame | F | frame, section, device presets | `tools/frame.ts` |
| Sticky note | S | | `tools/sticky.ts` |
| Browser / code frame | B | URL, local HTML, dev server | `tools/codeFrame.ts` |
| Hand | H / Space | | `tools/hand.ts` |
| Comment | C | | `tools/comment.ts` |
| Components | Shift+I | library browser | opens `features/library` |
| Search | Ctrl+F | canvas + libraries | `features/palette` |
| More `…` | | eraser, measure, slice, plugin tools | |

A tool is `{ id, cursor, onPointerDown/Move/Up, onKey }` producing ops through the core client — never mutating the view model directly except as optimistic pending ops.

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
