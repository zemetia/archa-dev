# Decisions

← [Plan INDEX](./INDEX.md)

## Decision log

Status: **Proposed** (this plan's recommendation, waiting for the owner) · **Accepted** · **Superseded**.

| ID | Decision | Status | Why | Alternatives |
|---|---|---|---|---|
| D-01 | Node canvas as the source of truth, with code frames for live HTML | Proposed | Owner wants pen.dev-like layers, `.archa` files and `.pen` import; Accent's code-first path survives as code frames | Pure code-as-canvas (Accent) — no real design file |
| D-02 | CanvasKit (Skia WASM) for content rendering | Proposed | Same rasteriser in app, worker and headless CLI → agent screenshots match the app | PixiJS (no good text/vector parity), DOM/SVG (slow at scale), native Skia via N-API (build pain) |
| D-03 | Core host in an Electron `utilityProcess`, loadable in-process by the CLI | Proposed | Single writer, no UI freezes, headless parity | Core in main process |
| D-04 | Own op log with per-property LWW + fractional indexing; CRDT later if multiplayer | Proposed | Simple, fast, compatible with Yjs/Loro later | Yjs from day one (heavier, harder to validate with zod) |
| D-05 | `.archa` = zip of JSON; unpacked folder inside `.archadev/` | Proposed | Portable file + git-friendly project | Single JSON, SQLite file |
| D-06 | No `.pen` reverse engineering; import via pen's own export first, via the person's pen tooling only after a licence review | Proposed | pen licence; Accent clean-room rule | Native parser (ruled out) |
| D-07 | QuickJS sandbox for `execute` | Proposed | Real isolation, limits, same in app and CLI | Node `vm` (not a security boundary), isolated-vm (native module) |
| D-08 | Launch + listen agent modes, adapters ported from Gungnir | Proposed | Proven with the same four agents | Embedding one agent SDK (pen's approach) |
| D-09 | pnpm + Turborepo monorepo, electron-vite, electron-builder | Proposed | Mainstream, fast | Nx, Forge |
| D-10 | Plan in `docs/plan`, graduating into `docs/blueprint` + `docs/knowledge` | Proposed | Zemetiash system | — |
| D-11 | Chat engine: keep local agent CLIs warm per thread (A) before any direct-API engine (B) | Proposed | Removes cold start and allows steering while keeping D-08 (own logins, agent-neutral) — [CHAT_AGENT](./CHAT_AGENT.md) | Direct API with keys; both |

## Open questions for the owner

1. **Name check.** "ArchaDev" / `archa` / `.archa`: any conflicts to check (trademark, npm name `archa`, existing `.archa` extension)? Accent hit a name clash late.
2. **Licence of ArchaDev itself.** Open source, source-available, or proprietary? Affects the plugin SDK and registry.
3. **`archa-dev-server`.** Confirm it is out of scope for v1 (sync, sharing, plugin registry, accounts later).
4. **Accent's future.** Does ArchaDev replace Accent, or does Accent become an ArchaDev plugin (code harness: audit, record, reference browser)? This plan assumes Accent's code is ported where useful.
5. **First agent.** Is Claude Code the first-class target for phase 5 (recommended), with agy/Codex/Hermes in phase 6?
6. **Platforms.** Windows first (owner's machine), macOS and Linux in CI from phase 0 — agreed?
7. **`.pen` licence review.** Who reviews, and is path A (import pen's HTML export) acceptable meanwhile?
8. **Telemetry.** None, or opt-in crash reports only?
