# File Formats

← [Blueprint INDEX](./INDEX.md)

| Part | Coverage |
|---|---|
| [01 — `.archa`](./FILE_FORMATS/01-archa.md) | Packed zip, unpacked folder, entries, saving |
| [02 — `.archadev/` project](./FILE_FORMATS/02-archadev-project.md) | `project.json`, `agents.json`, `plugins.json`, init flow |
| [03 — Migrations and validation](./FILE_FORMATS/03-migrations-validation.md) | `formatVersion`, migrations, quarantine, fixtures |
| [04 — Importers](./FILE_FORMATS/04-importers.md) | Import pipeline, SVG, HTML/URL, tokens, `.pen` rules, import report |

---

## At a Glance

| Thing | Example | Role |
|---|---|---|
| `.archa` | `landing.archa` | Portable design document (zip of JSON + assets) |
| Unpacked design | `.archadev/designs/landing/` | Same content, git-friendly |
| `.archadev/` | `<project>/.archadev/` | Project design space |
| `.pen` | `old.pen` | Import source only — never written, never decrypted |

Code: `packages/formats/`. Schemas: `packages/schema/src/files/`.
