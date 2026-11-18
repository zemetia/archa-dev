# Plugins

← [Blueprint INDEX](./INDEX.md)

| Part | Coverage |
|---|---|
| [01 — Manifest and capabilities](./PLUGINS/01-manifest-capabilities.md) | `archa-plugin.json`, contribution points, SDK surface |
| [02 — Sandbox, permissions, distribution](./PLUGINS/02-sandbox-permissions.md) | Plugin host, capability broker, permissions, panels, packaging, dev loop |

---

## Principle

Everything optional is a plugin: asset generators (SVG, background removal, tracing, HTML animation), extra importers/exporters, extra agent adapters, style profiles, libraries. The core stays small; plugins never get more access than the person granted.

Code: `packages/plugin-sdk/` (public, published), `packages/plugin-host/` (internal). Phase 10.
