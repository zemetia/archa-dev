# CLI — 02: Parity and Exit Codes

← [CLI.md](../CLI.md) | [Blueprint INDEX](../INDEX.md)

---

## Parity Table

Keep this table current. A new capability adds a row; a blank cell needs a reason in "Note".

| Capability | App | CLI | MCP | Note |
|---|---|---|---|---|
| Open project / file | ✓ | `open` | — | Agents are started inside a project |
| Init project | ✓ | `init` | — | |
| Edit document | ✓ | via `run` / plugins | `execute` | No raw edit command by design |
| Read state | ✓ | `status --json` | `get_state` | |
| Screenshot | ✓ | `export --to png` | `screenshot` | |
| Export (image, svg, pdf, code, tokens) | ✓ | `export`, `tokens export` | `export` | |
| Import | ✓ | `import` | — | Later: `import` tool |
| Variables / tokens | ✓ | `tokens` | `execute` `setVariables` | |
| Style profiles | ✓ | `style` | `get_style` | |
| Libraries | ✓ | `library` | `library` | |
| Comments | ✓ | — | `comments` | CLI later |
| Review rounds | ✓ | — | `review_wait`, `review_done` | |
| Decisions | ✓ | — | `ask`, `variants` | |
| Agent runs | ✓ | `run`, `runs` | — | |
| Agent status | ✓ | `status`, `agents` | — | |
| Plugins | ✓ | `plugin` | plugin tools | |
| Cache | Settings | `cache` | — | |

---

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Usage error (bad flags/arguments) |
| 2 | Validation or lint failure (useful in CI: `archa export` with `--strict` fails on issues) |
| 3 | Not found (file, design, node, agent) |
| 4 | Core/app unavailable and headless start failed |
| 5 | Permission denied (plugin, OS integration) |
| 6 | Agent run failed / rate-limited |
| 130 | Interrupted (Ctrl+C) |

---

## Output Rules

| Rule | Detail |
|---|---|
| Human output | Short, no colour when not a TTY or `NO_COLOR` set |
| `--json` | One JSON document on stdout; nothing else on stdout |
| Errors | stderr: one line `error: <message>` + hint line; with `--json`, `{ "error": { code, message } }` on stdout |
| Progress | stderr only, so stdout stays pipeable |
| Paths | Printed absolute |
