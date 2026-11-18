# CLI — `archa`

← [Plan INDEX](./INDEX.md)

`archa --help` is a short front door for people (Accent lesson); `archa tools` lists everything.

## Commands

| Command | Does |
|---|---|
| `archa [path]` / `archa open <dir\|file>` | Open in the app (launches it if needed). Folder → project mode, `.archa` → standalone |
| `archa init [dir]` | Create `.archadev/`, ask about skill/MCP/code target one question at a time |
| `archa new <name> [--from <style-profile>]` | New design in the current project, or a new `.archa` with `--file` |
| `archa import <file> [--as <design>]` | `.archa`, SVG, HTML/URL, tokens, (later) `.pen` |
| `archa export <design\|file> [--frame <id>] --to png\|svg\|pdf\|html\|react\|tokens [--out]` | Headless export |
| `archa pack <design>` / `archa unpack <file.archa>` | Convert between project design and standalone file |
| `archa adopt <file.archa>` | Move a standalone file into the current project |
| `archa mcp [--project\|--file] [--run <id>]` | MCP server on stdio (what agents run) |
| `archa agents` | Detected agent CLIs, versions, profiles, default models |
| `archa status [agent]` | Deep check: app ↔ core ↔ MCP ↔ agent (Accent `accent status`) |
| `archa run <agent> "<prompt>" [--design]` | Start an agent run from the terminal; streams the timeline |
| `archa skill install [--agent] [--scope]` | Install the skill + MCP config |
| `archa plugin new\|link\|install\|list\|remove` | Plugin management |
| `archa tokens export\|import` | Token sync with code (`tokens.css`, `@theme`, DTCG) |
| `archa library list\|harvest <url>\|add\|remove` | Libraries |
| `archa doctor` | Checks paths, registry entries, PATH, agent configs, cache health |
| `archa cache clear [--project\|--global]` | Clear caches (always safe) |
| `archa setup` / `archa uninstall` | First-run terms + config; clean removal |

Exit codes: 0 ok, 1 usage, 2 validation/lint failure (for CI), 3 not found, 4 app/core unavailable.
`--json` on every read command for scripts and agents.

## Parity table (kept current in the blueprint)

| Capability | App | CLI | MCP |
|---|---|---|---|
| Open project / file | ✓ | ✓ | — |
| Edit document | ✓ | via `run`/plugins | `execute` |
| Screenshot / export | ✓ | `export` | `screenshot`, `export` |
| Tokens import/export | ✓ | `tokens` | `export` |
| Comments / rounds / decisions | ✓ | `review` (later) | ✓ |
| Agent runs | ✓ | `run` | — |
| Plugins | ✓ | `plugin` | plugin tools |
