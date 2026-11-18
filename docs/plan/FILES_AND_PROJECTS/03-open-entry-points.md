# 03 — Entry points

← [FILES_AND_PROJECTS](../FILES_AND_PROJECTS.md) · [Plan INDEX](../INDEX.md)

## The ways in

| Entry | Result | Mode |
|---|---|---|
| `archa` / `archa .` / `archa open <dir>` | Opens the folder as a project (creates `.archadev/` after confirm) | Project |
| `archa open file.archa` | Opens the file | Standalone |
| Right-click folder → **Open with ArchaDev** | Same as `archa open <dir>` | Project |
| Right-click inside a folder's empty area → **Open this folder with ArchaDev** | Same | Project |
| Right-click a `.archa` file → Open | File | Standalone |
| Double-click `.archa` | File | Standalone |
| Start app from menu/dock | Start screen: recent, new file, open folder, import `.pen` | Either |
| `archadev://open?path=…` | Deep link (used by the CLI fallback and plugins) | Either |

## Windows

Registered by the NSIS installer (per-user, `HKCU`, no admin) and removable from Settings:

| Key | Verb |
|---|---|
| `HKCU\Software\Classes\Directory\shell\ArchaDev` | "Open with ArchaDev" on folders → `"…\ArchaDev.exe" --project "%1"` |
| `HKCU\Software\Classes\Directory\Background\shell\ArchaDev` | "Open this folder with ArchaDev" → `--project "%V"` |
| `HKCU\Software\Classes\.archa` + ProgId `ArchaDev.Document` | Open, icon, thumbnail |
| `archadev` URL protocol | Deep links |

Windows 11 shows classic verbs under "Show more options". A modern top-level entry needs an `IExplorerCommand` shell extension in a sparse MSIX package; planned as a later item (phase 11), not v1.

The CLI is put on `PATH` by the installer (`archa.cmd` shim → the bundled CLI), with an opt-out.

## macOS

- Finder: a Quick Action (Services) "Open with ArchaDev" installed with the app; `.archa` UTI in `Info.plist`.
- CLI: "Install `archa` command in PATH" menu item (symlink to `/usr/local/bin/archa`), like VS Code's `code`.

## Linux

- `.desktop` file with `MimeType=application/vnd.archadev.archa+zip;inode/directory`.
- Nautilus/Dolphin scripts installed optionally.

## Single instance

`app.requestSingleInstanceLock()`. A second launch forwards argv to the first instance (`second-instance` event), which opens the project/file in a new window or focuses the existing window for it. One window per project; standalone files can share a window as tabs.

## Standalone mode details

- Unsaved new file lives in memory + journal; first save asks for a location and writes `.archa`.
- "Move into project…" converts it to an unpacked design in a chosen project's `.archadev/designs/`.
- Agents can work on a standalone file too: the app exposes it on the MCP server under its file id; `archa mcp --file <path>` targets it headless.
