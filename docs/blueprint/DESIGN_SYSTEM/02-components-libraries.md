# Design System — 02: Components and Libraries

← [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) | [Blueprint INDEX](../INDEX.md) | [03 — Style profiles →](./03-style-profiles.md)

**Phase:** 7. Code: `packages/core/src/components/`, `packages/design-system/src/libraries/`.

---

## Components

| Concept | Model |
|---|---|
| Component | `ComponentDef { id, name, rootId, props: PropDef[], slots: SlotDef[] }` — the subtree lives in `components/<id>.json` |
| Variant set | Components sharing a `setId`; variant props `{ size: 'sm'\|'md'\|'lg', state: … }` |
| Component props | `text`, `boolean` (toggle a layer), `instance-swap`, `variant` |
| Slot | Named frame inside the component with `recommended: ComponentId[]` |
| Instance | `instance` node: `componentId`, `variant`, `props`, `overrides` |
| Override key | Node-id path inside the component (`"a1/b7/c3"`) **or** unique name |

| Operation | Op / behaviour |
|---|---|
| Create from selection | `createComponent` |
| Edit main → instances update | Reverse index component → instances dirties them |
| Detach | Instance becomes a plain subtree with overrides applied |
| Reset overrides | Per property or all |
| Swap | Change `componentId` keeping compatible overrides |
| Go to main | Selects the definition (switching doc/library if needed) |

Lint `component/rebuilt` compares structure hashes of hand-built subtrees with existing components.

---

## Libraries

| Kind | Location | Shared with |
|---|---|---|
| Document-local | Inside the design / `.archa` | That document |
| Project | `.archadev/libraries/<name>/` | All designs in the project |
| Global | `~/.archadev/libraries/<name>/` | All projects of this user |
| Plugin | Plugin package | Projects enabling the plugin |

A library is an unpacked design with `library.json`:

```json
{ "format": "archa-library", "name": "core-ui", "version": "1.4.0", "exports": { "components": ["…"], "variables": "all", "icons": "icons/" } }
```

---

## Using a Library

| Mode | Behaviour |
|---|---|
| Linked (default) | Components referenced as `libraryId:componentId`; library updates show a banner with a diff, applied on accept |
| Copied | Components copied into the doc; no updates |

Ids from libraries are namespaced so two libraries never collide. `archa library harvest <url>` builds a library from a live page (Accent harvest) — output needs human curation and is marked `draft`.

---

## Icons

Built-in icon set (open-licence, e.g. Lucide) as a global library; `icon` lookup by name; unknown names → lint `icon/unknown`.
