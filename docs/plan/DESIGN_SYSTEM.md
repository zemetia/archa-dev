# Design system

← [Plan INDEX](./INDEX.md)

Covers the design system *inside documents* (tokens, components, libraries, style profiles) and how it leaves ArchaDev as code. The app's own UI styling rules are in [CONVENTIONS.md](./CONVENTIONS.md).

## Variables (tokens)

| Aspect | Plan |
|---|---|
| Types | color, number, string, boolean, typography (composite), shadow (composite) |
| Naming | Slash paths: `color/surface`, `space/4`, `radius/md`, `type/heading-1` |
| Theme axes | Any number of axes, e.g. Mode (light, dark) × Brand (a, b) × Density. One variable holds a value per combination, with fallback to the axis default |
| Aliases | A variable may reference another (`color/button-bg → color/accent`) |
| Colour space | Stored as oklch (Zemetiash convention) with sRGB fallback computed on export |
| Scopes | Restrict where a variable may be used (fill only, gap only…), used by lint |
| Contrast | Every colour pair a profile declares is measured; lint reports text tokens below AA on their surface |

## Components

- A component is a node subtree marked as a definition. Instances override properties by **node-id path** or unique name.
- **Variants**: component sets with variant properties (size=sm|md|lg, state=default|hover|disabled).
- **Slots**: named insertion points listing recommended child components.
- Detach, swap instance, reset overrides, "go to main component".
- Lint reports a hand-built frame that matches an existing component's structure ("this looks like `Button/primary`").

## Libraries

| Kind | Where |
|---|---|
| Document-local | Inside the `.archa` / design |
| Project library | `.archadev/libraries/<name>/` — shared by all designs in the project |
| Global library | `~/.archadev/libraries/` — across projects |
| Plugin library | Shipped by a plugin |

A library = components + variables + styles + vectors + icon set, in the same unpacked format. Import is by reference (updates flow, with a "library has updates" banner) or by copy. Harvesting a library from a live web page (Accent's `library harvest`) arrives as an importer.

## Style profiles

Accent's style system, adapted:

- A profile is a **brief about structure** (signature device stated as a removal test, layout, hierarchy ratios, type roles, decoration rules, token jobs with usage budgets) plus **parameters kept apart** (palette slots, radius scale, elevation preset, fonts per role).
- **Two-step load** (`get_style`): first call returns required parameters, second call supplies them; only tokens the profile uses reach the model.
- Type scale stored as size at two widths, emitted as `clamp()` for code export.
- Profiles cover **app UI** as well as marketing pages (gap in pen's catalogue noted by Accent).
- Starter set: port Accent's 7 profiles + 12 palettes + 20 fonts (our own work, safe to reuse).
- Applying a profile writes variables into the document; the brief itself is never written.

## Code export

| Target | Output |
|---|---|
| Tokens | DTCG JSON, CSS custom properties, Tailwind v4 `@theme {}` block (Zemetiash format), TS object |
| HTML/CSS | Static page per frame, auto-layout → flexbox, variables → custom properties |
| React + Tailwind | Component per ArchaDev component, CVA for variants (Zemetiash four-file rule optional: component, stories, test, index) |
| Plugins | Other targets (Vue, Svelte, Flutter, SwiftUI) as exporter plugins |

Design-to-code in a linked repo is an agent task (the skill's code-export guide): one component at a time, map every instance, validate visually against the frame's screenshot before moving on.
