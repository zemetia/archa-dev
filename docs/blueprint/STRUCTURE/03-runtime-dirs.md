# Structure — 03: Runtime Directories

← [STRUCTURE.md](../STRUCTURE.md) | [Blueprint INDEX](../INDEX.md)

**Phase:** 4. Format details → [FILE_FORMATS/02](../FILE_FORMATS/02-archadev-project.md).

---

## Per project — `<project>/.archadev/`

| Path | Git | Purpose |
|---|---|---|
| `project.json` | ✓ | id, name, `formatVersion`, default design, code target (dev URL, src dir), designer profile |
| `designs/<name>/` | ✓ | Unpacked `.archa` |
| `assets/` | ✓ | Content-addressed store (`<sha256>.<ext>`) shared by all designs |
| `tokens/` | ✓ | `tokens.json` (DTCG) + generated `tokens.css` |
| `libraries/` | ✓ | Project component libraries |
| `comments/` | ✓ | Threads per design |
| `decisions/` | ✓ | `ask` / `variants` records |
| `agents.json` | ✓ | Enabled agents, default agent/model, run isolation |
| `plugins.json` | ✓ | Enabled plugins + granted permissions |
| `rounds/` | opt | Review rounds (setting `git.includeRounds`) |
| `activity.jsonl` | opt | Append-only activity log |
| `runs/` | ✗ | Agent run records → [AGENT_BRIDGE/03](../AGENT_BRIDGE/03-runs-steering.md) |
| `journal/` | ✗ | Op journal for crash recovery |
| `cache/` | ✗ | All derivable caches → [CACHE](../CACHE.md) |
| `runtime/` | ✗ | `core.lock` (pid, socket path) |
| `.gitignore` | ✓ | Generated: `runs/ journal/ cache/ runtime/` |

---

## Global — `~/.archadev/` (overridable with `ARCHA_HOME`)

| Path | Purpose |
|---|---|
| `config.json` | Preferences, accepted terms, telemetry choice |
| `recent.json` | Recent files and projects |
| `profiles/<agent>/<profileId>/` | Agent login profiles — **never** copied into a project |
| `plugins/<id>@<version>/` | Installed plugins |
| `libraries/` | Global libraries and style profiles |
| `cache/` | Fonts, plugin bundles, standalone-file assets, `index.sqlite` |
| `journal/<fileId>/` | Journals for standalone `.archa` files |
| `runtime/core.json` | Running app: socket path + auth token (file mode 0600) |
| `logs/` | Rotating logs per process |

---

## Environment Variables

| Var | Default | Purpose |
|---|---|---|
| `ARCHA_HOME` | `~/.archadev` | Global dir; tests **must** set it to a temp dir |
| `ARCHA_LOG` | `info` | `debug` / `info` / `warn` / `error` |
| `ARCHA_AGENT_<ID>` | — | Override binary path of an agent CLI (`ARCHA_AGENT_CLAUDE`) |
| `ARCHA_AGENT_IT` | unset | `1` enables live agent integration tests |
| `ARCHA_NO_GPU` | unset | Force CPU raster (CI, broken drivers) |
| `ARCHA_MCP_HTTP_PORT` | off | Enable streamable HTTP MCP on this port |
