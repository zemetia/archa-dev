# Plugins

← [Plan INDEX](./INDEX.md)

## What a plugin can add

| Capability | Example |
|---|---|
| `tools` | MCP tools exposed to agents (namespaced) |
| `panels` | UI panel in the app (sandboxed iframe, talks through `plugin-sdk`) |
| `commands` | Palette actions and menu items |
| `nodeTypes` | Custom node type with its own render + a fallback image |
| `importers` / `exporters` | New file formats or code targets |
| `generators` | Asset generation: SVG, image, background removal, tracing, HTML animation (Accent roadmap §8) |
| `lintRules` | Extra checks in the `execute` response and the Issues panel |
| `styleProfiles` / `libraries` | Design content |
| `agents` | A new agent adapter for launch mode |
| `designerProfiles` | Bundles of skill emphasis + style + tools |

## Manifest — `archa-plugin.json`

```json
{
  "id": "com.example.bg-remove",
  "name": "Background Remover",
  "version": "1.2.0",
  "engine": "^1.0.0",
  "main": "dist/main.js",
  "ui": "dist/panel.html",
  "contributes": { "generators": ["remove-background"], "commands": ["bg-remove.run"] },
  "permissions": ["document:read", "document:write", "assets:write", "network:api.example.com"]
}
```

## Sandbox and permissions

- Plugin `main` runs in the **plugin host** utility process, one isolate per plugin (Node `vm` is not a security boundary → use a separate process per untrusted plugin; trusted/first-party plugins may share one).
- No direct `fs`, `child_process` or network. Everything goes through the capability broker, which checks the manifest permissions the person granted.
- Permissions are granted per project on first use and listed in `.archadev/plugins.json`.
- Panels are iframes with a strict CSP; they talk only to their own plugin via `postMessage`.
- Document writes from a plugin are transactions with author = plugin, so they have their own undo stack and show in Activity.

## Distribution

| Source | v1 |
|---|---|
| Local folder (`archa plugin link <dir>`) | Yes — for development, including agent-written plugins |
| `.archaplugin` package file (zip) | Yes |
| npm package with `archa-plugin` keyword | Yes |
| Registry on `archa-dev-server` | Later |

`archa plugin new <name>` scaffolds a TypeScript plugin with the SDK, a test harness running against a headless core, and hot reload in the app.
