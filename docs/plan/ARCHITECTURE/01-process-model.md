# 01 — Process model

← [ARCHITECTURE](../ARCHITECTURE.md) · [Plan INDEX](../INDEX.md)

## Processes

| Process | Runs | Owns | Must not |
|---|---|---|---|
| **Electron main** | Node | Windows, native menus, tray, single-instance lock, `second-instance` argv handling, file associations, protocol handler `archadev://`, auto-update | Hold document state |
| **Core host** | Electron `utilityProcess` (Node) | Open documents, op log, revisions, undo stacks, cache, file watcher, autosave, MCP server, agent runs, local socket | Touch UI |
| **Renderer** | Chromium, React | Shell, panels, canvas view, input → op translation, view-only state (zoom, scroll, selection hover) | Write files or mutate a document locally without the core |
| **Plugin host** | `utilityProcess` per trust level | Plugin code, sandboxed | Reach disk or network except through granted capabilities |
| **Render worker** | Web Worker inside renderer (OffscreenCanvas) | Rasterising tiles off the main thread | — |
| **CLI** | Plain Node binary | Argument parsing; client of the core host, or a headless in-process core | Diverge from the core API |

Why a separate core host and not the main process: a heavy document operation, a big import or an agent's `execute` must never freeze window management, and the same code must run inside the CLI with no Electron at all.

## Single writer

Accent lost work when two browser tabs saved their own canvas copies. ArchaDev rules this out by construction:

1. Only the core host applies ops to a document and writes it to disk.
2. Every client op carries `baseRevision`. If the document moved on, the core rebases the op (ops are small and mostly commutative per node) or rejects it with the newer state.
3. The core broadcasts applied ops with the new revision; every view folds them in.
4. Two app windows, the CLI and three agents all see one document.

If a second core host would start on the same project (two app instances, or the CLI headless while the app is open), a lock file `.archadev/core.lock` (pid + socket path) makes the second one become a client of the first.

## IPC

| Link | Transport | Shape |
|---|---|---|
| Renderer ↔ core host | `MessagePort` handed over by main | Typed RPC (requests) + event stream (op broadcasts, activity, agent events) |
| CLI / MCP ↔ core host | Named pipe (Windows) / unix socket, path in `~/.archadev/runtime/` | Same RPC, JSON-lines framing, local-only, token in the runtime file |
| Core ↔ plugin host | `MessagePort` | Capability-scoped RPC |
| Core ↔ agent CLIs | child process stdio | Agent-specific stream, parsed by adapter |

One RPC schema (`@archa/protocol`, zod) for every link, so the CLI, MCP and renderer cannot drift. Generated TypeScript types; runtime validation at process boundaries only.

## Startup paths

| Trigger | Path |
|---|---|
| Double-click app | main → core host → empty start screen (recent files and projects) |
| `archa .` / `archa open <dir>` | CLI finds running app via runtime file → RPC `openProject` ; else launches app with `--project <dir>` |
| Explorer "Open with ArchaDev" | Registry verb launches `ArchaDev.exe --project "%V"` → single-instance lock forwards argv to the first instance |
| Double-click `.archa` | File association → `--file <path>` → standalone mode |
| `archa mcp` (spawned by an agent) | Connects to the running core if any; otherwise starts a headless core for the cwd project |

## Crash safety

- Autosave writes to `<target>.tmp` then renames (atomic). Op log journal in `.archadev/journal/` replays unsaved ops after a crash.
- Core host crash → main restarts it, renderer reconnects and re-syncs from the journal.
- Agent runs survive a renderer reload (they live in the core host).
