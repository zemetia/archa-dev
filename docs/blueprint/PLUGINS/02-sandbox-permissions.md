# Plugins — 02: Sandbox, Permissions, Distribution

← [PLUGINS.md](../PLUGINS.md) | [Blueprint INDEX](../INDEX.md)

**Phase:** 10. Code: `packages/plugin-host/`.

---

## Isolation

| Plugin trust | Process | Notes |
|---|---|---|
| First-party (signed by ArchaDev) | Shared plugin host `utilityProcess` | |
| Third-party | One `utilityProcess` per plugin | Node `vm` is not a security boundary — separate process is |
| Panel UI | Iframe, `sandbox="allow-scripts"`, strict CSP, no `allow-same-origin` | Talks only to its own plugin via `postMessage` bridge |
| Custom node draw code | Render worker, QuickJS-wrapped | Pure draw; no API access |

Plugin host processes run with no inherited env secrets, cwd = plugin dir, and Node permissions model flags (`--permission`, no fs/child_process) where supported.

---

## Capability Broker

All plugin API calls are RPC to the broker in the core host:

```
plugin → broker.check(pluginId, permission, target) → core API → result
```

| Check | Rule |
|---|---|
| Permission declared in manifest | Otherwise reject `PERMISSION` |
| Granted by the person for this project | Prompt on first use; stored in `.archadev/plugins.json` |
| `network:<host>` | Exact host match; HTTPS only |
| Rate | Per-plugin limits on transactions/s and network calls |

Revoking a permission takes effect immediately; the plugin gets `PERMISSION` errors.

---

## Lifecycle

| Event | Behaviour |
|---|---|
| Install | Validate manifest + `engine` range; unpack to `~/.archadev/plugins/<id>@<version>/` |
| Enable (per project) | Add to `plugins.json`; activate lazily on first contribution use |
| Crash | Mark crashed, notify; others unaffected; auto-restart once |
| Update | Side-by-side install; switch on next activation |
| Remove | Disable everywhere, delete folder; custom nodes keep their fallback |

---

## Distribution

| Source | Command |
|---|---|
| Local folder (dev, incl. agent-written plugins) | `archa plugin link <dir>` — hot reload on rebuild |
| Package file `.archaplugin` (zip) | `archa plugin install file.archaplugin` |
| npm (`keywords: ["archa-plugin"]`) | `archa plugin install <npm-name>` |
| Registry (`archa-dev-server`) | Later |

---

## Dev Loop

`archa plugin new <name>` scaffolds:

```
<name>/
├── archa-plugin.json
├── src/main.ts            definePlugin(...)
├── src/panel/             optional React panel
├── test/main.test.ts      runs against a headless core via @archa/plugin-sdk/testing
└── package.json           build with tsup
```

`@archa/plugin-sdk/testing` provides `createTestCore()` with an in-memory document and fake permissions.
