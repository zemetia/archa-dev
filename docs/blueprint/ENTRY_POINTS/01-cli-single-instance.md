# Entry Points — 01: CLI and Single Instance

← [ENTRY_POINTS.md](../ENTRY_POINTS.md) | [Blueprint INDEX](../INDEX.md) | [02 — OS integration →](./02-os-integration.md)

**Phase:** 4. Code: `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/argv.ts`, `apps/cli/src/commands/open.ts`.

---

## App argv Contract

| Flag | Meaning |
|---|---|
| `--project <dir>` | Open `<dir>` as a project (create `.archadev/` after confirm) |
| `--file <path>` | Open a `.archa` standalone |
| `--import <path>` | Start screen with import dialog prefilled |
| `--new-window` | Do not reuse an existing window |
| `archadev://open?path=<encoded>&kind=project\|file` | Same, via protocol |
| bare path (from file association) | Folder → `--project`, `.archa` → `--file` |

Parsing lives in one pure function `parseArgv(argv, cwd): OpenIntent` — unit tested with Windows, macOS and Linux argv shapes (Electron adds its own args; `process.defaultApp` shifts indices in dev).

---

## `archa open` Flow

```
archa open <target>
  ├─ resolve absolute path; folder or .archa?
  ├─ runtime/core.json present & socket answers?
  │     └─ yes → RPC app.open(OpenIntent) → exit 0
  └─ no  → launch app binary with argv (detached) → exit 0
```

App binary is found from: the CLI's own install location (bundled), then `ARCHA_APP_PATH`, then platform defaults.

---

## Single Instance

```ts
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.on('second-instance', (_e, argv, cwd) => openIntent(parseArgv(argv, cwd)));
app.on('open-file', (e, path) => { e.preventDefault(); openIntent({ kind: 'file', path }); });   // macOS
app.on('open-url',  (e, url)  => { e.preventDefault(); openIntent(fromDeepLink(url)); });      // macOS
```

---

## Window Policy

| Intent | Behaviour |
|---|---|
| Project already open | Focus its window |
| New project | New window |
| Standalone file | Open as a tab in the focused standalone window, or a new window if none |
| `--new-window` | Always new |

Window bounds per project saved in `~/.archadev/config.json` (`windows[projectId]`).

---

## Standalone Mode

| Aspect | Behaviour |
|---|---|
| New file | In memory + journal under `~/.archadev/journal/<fileId>/`; first save asks for a path |
| Assets | `~/.archadev/cache/assets/` while editing; embedded into the `.archa` on save |
| Agents | MCP exposes the file by id; `archa mcp --file <path>` targets it headless |
| Move into project | `archa adopt file.archa` / menu "Move into project…" → unpacked design + assets merged into the project store |
