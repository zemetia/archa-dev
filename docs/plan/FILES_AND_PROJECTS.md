# Files and projects

← [Plan INDEX](./INDEX.md)

| Part | Coverage |
|---|---|
| [01 — `.archa` format](./FILES_AND_PROJECTS/01-archa-format.md) | Packed (zip) and unpacked (folder) encodings, versioning, migration |
| [02 — `.archadev/` project space](./FILES_AND_PROJECTS/02-archadev-project.md) | What a project folder holds, git rules, global `~/.archadev` |
| [03 — Entry points](./FILES_AND_PROJECTS/03-open-entry-points.md) | CLI, Explorer/Finder menu, file association, deep links, standalone mode |
| [04 — `.pen` import](./FILES_AND_PROJECTS/04-pen-import.md) | Licence-safe import paths and mapping |

## At a glance

| Thing | Example | Purpose |
|---|---|---|
| `.archa` file | `landing.archa` | A portable design document (zip of JSON + assets) |
| `.archadev/` folder | `my-app/.archadev/` | Per-project design space created when a folder is opened with ArchaDev |
| `~/.archadev/` | user home | Global config, agent profiles, plugins, global cache, runtime sockets |
| `.pen` file | `old.pen` | Import source only — never written |
