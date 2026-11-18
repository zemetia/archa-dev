# Entry Points

← [Blueprint INDEX](./INDEX.md)

| Part | Coverage |
|---|---|
| [01 — CLI and single instance](./ENTRY_POINTS/01-cli-single-instance.md) | `archa open`, argv contract, single-instance forwarding, windows, standalone mode |
| [02 — OS integration](./ENTRY_POINTS/02-os-integration.md) | Windows registry verbs, `.archa` association, macOS Quick Action, Linux `.desktop`, PATH |

---

## Ways In

| Entry | Mode |
|---|---|
| `archa`, `archa .`, `archa open <dir>` | Project |
| Explorer / Finder: **Open with ArchaDev** on a folder or its background | Project |
| `archa open file.archa`, double-click `.archa` | Standalone |
| App start screen: recent, new file, open folder, import | Either |
| `archadev://open?path=…` | Either |
