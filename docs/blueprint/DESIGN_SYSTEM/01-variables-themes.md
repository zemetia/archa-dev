# Design System — 01: Variables and Themes

← [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) | [Blueprint INDEX](../INDEX.md) | [02 — Components →](./02-components-libraries.md)

**Phase:** 7 (basic variables in 1). Code: `packages/schema/src/variables.ts`, `packages/design-system/src/resolve/`.

---

## Variable Types

| Type | Value | Example name |
|---|---|---|
| `color` | oklch `{ l, c, h, a }` | `color/surface`, `color/accent` |
| `number` | px or unitless | `space/4`, `radius/md`, `opacity/muted` |
| `string` | text | `font/heading` |
| `boolean` | | `feature/show-badge` |
| `typography` | `{ family, weight, size, lineHeight, letterSpacing }` | `type/heading-1` |
| `shadow` | list of `{ x, y, blur, spread, color }` | `elevation/md` |

Names are slash paths; the first segment groups them in the UI and in exports.

---

## Theme Axes

```ts
type VariableCollection = {
  axes: { id: string; name: string; values: string[]; default: string }[];  // e.g. Mode: light|dark, Brand: a|b
  variables: {
    id: string; name: string; type: VariableType; scopes?: Scope[];
    values: Record<ThemeKey, Value | { $alias: string }>;  // ThemeKey = "mode=dark;brand=a" or partial "mode=dark"
  }[];
};
```

| Rule | Detail |
|---|---|
| Lookup | Exact theme key → keys matching a subset of axes (most specific first) → axis defaults |
| Active theme | Per document, per frame override possible (`frame.theme = { mode: 'dark' }`) |
| Aliases | `{ $alias: 'color/accent' }`; cycles rejected on write |
| Scopes | `fill`, `stroke`, `text`, `gap`, `padding`, `radius`, `size`, `effect` — lint flags use outside scope |

---

## Resolution

`resolveVariables(doc, node, theme)` → literal values. Runs in the core; render, export and hashing consume resolved values only. Reverse index variable → nodes makes a theme switch dirty only the nodes that use themed variables → [DOCUMENT_MODEL/04](../DOCUMENT_MODEL/04-hashing.md).

---

## Bindings (built, 0.4.1)

The `$var` references below are the target; what ships is a per-node `bind` map (`packages/core/src/bindings.ts`):

| Rule | Detail |
|---|---|
| Apply | After every transaction the core (and the renderer mirror, identically) sets bound properties from their variables: all bound nodes after a variable changed, else the nodes just written. The writes are part of the transaction, so undo restores them |
| Detach | Setting a bound property by hand (a patch without `bind`) drops that binding — Figma-like |
| Agents | `bind(ref, { fill: "color/accent" })` (names resolved to ids), `bind: {…}` on insert; `variables()` returns ids |

---

## Contrast

Every colour variable used as text is measured against the surfaces it sits on (from the profile's declared pairs and from actual usage). Result exposed in the Variables panel and as lint `a11y/contrast`. The check follows the variable's declared job: an accent declared "fill only" is not reported as text.

---

## Panel (app)

Table view: rows = variables, columns = theme combinations; inline edit with colour picker (oklch + hex); alias picker; usage count with "select users".
