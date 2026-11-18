# Editor UI

← [Plan INDEX](./INDEX.md)

## Shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Title bar: project / file · page tabs · agent status · share/export · ⋯ │
├────┬──────────────┬─────────────────────────────────────┬───────────────┤
│Tool│ Left panel   │                                     │ Right panel   │
│rail│ Layers       │            Canvas                   │ Design        │
│    │ Pages        │   (frames, code frames, wireframes, │ (properties,  │
│    │ Assets/Lib   │    comments, agent cursors)         │  auto-layout, │
│    │ Comments     │                                     │  variables)   │
│    │ Activity     │                                     │ Inspect       │
│    │ Issues       │                                     │ Prototype*    │
├────┴──────────────┴─────────────────────────────────────┴───────────────┤
│ Agent dock: running runs, timeline, steer box, decisions (collapsible)   │
└──────────────────────────────────────────────────────────────────────────┘
```
\* later phase

## Tool rail (Accent roadmap §7)

| Icon | Tool | Key | Dropdown |
|---|---|---|---|
| Arrow | Select | V | select / scale |
| Square | Shape | R | rect, ellipse, line, arrow, polygon, star, image |
| Pen | Pen / pencil | P | pen, pencil |
| T | Text | T | |
| # | Frame | F | frame, section, device presets |
| Note | Sticky note | S | |
| Globe | Browser / code frame | B | URL, local HTML, dev server |
| Hand | Hand | H / Space | |
| Bubble | Comment | C | |
| Diamond | Components | ⇧I | library browser |
| Magnifier | Search | Ctrl+F | canvas + libraries |
| `…` | More | | plugins' tools, eraser, measure, slice |

## Panels

- **Layers**: virtualised tree, drag reorder, visibility/lock, rename, filter (see [ARCHITECTURE/04](./ARCHITECTURE/04-rendering-and-layers.md)).
- **Design**: position, size modes, auto-layout, fills/strokes/effects with variable pickers, text, component props, theme preview switcher.
- **Inspect**: computed values and the variable behind each; for code frames, the live element's computed styles (Accent's Inspect mode).
- **Issues**: lint for the current page + last audit/recording.
- **Activity**: agent and plugin actions, filterable; click to jump to the node.

## Workspaces

| Workspace | Surface |
|---|---|
| Design | The canvas |
| Inspect | One code frame live, Select / Comment / Interact pointers |
| History | Overlay: rounds scrubber, before/after |

## App styling rules

The app shell uses Tailwind v4 `@theme` tokens only (no raw colours), light/dark, CVA components with Storybook stories and tests (Zemetiash component rules). Shortcuts are listed in a cheatsheet (`?`) and remappable.
