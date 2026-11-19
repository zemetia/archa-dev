# LEARN — Correction & Mistake Log

> Written whenever: (1) the owner explicitly corrects the AI, or (2) the AI recognizes it deviated from what was asked or from best practice. Format is compact but lossless.

**Template:** `[YYYY-MM-DD] - [problem] - [solution] - [lesson]`

---

<!-- Entries below, newest first -->

[2026-11-19] - A dev app started with its own ARCHA_HOME still listened on `\\.\pipe\archadev-core-<USERNAME>`, the installed app's pipe; dev and installed cores could collide - `socketPath()` adds a hash of a custom ARCHA_HOME to the pipe name - Anything "isolated by ARCHA_HOME" must derive every path, pipe and lock from it; check names that come from the user or machine.

[2026-11-19] - The dev window sat on "Connecting to core…" after a Vite HMR update, so agent screenshots failed during a live benchmark - Reloaded the window (the core port is only sent on page load) - After HMR in a dev run, reload the window before trusting agent screenshots; check `document.body.innerText` for "Connecting to core".

[2026-11-19] - First live warm-session run: 98 s to the first canvas change. The agent read all 5 guides and three calls failed on spellings (`sizing: "auto"`, `align: "stretch"`, `content` instead of `text`) and on re-declared `const` names - Core guides moved into the cached system prompt; `normaliseInput` maps common CSS/Figma spellings; top-level `const`/`let` run as `var` - Measure agent runs end to end and read the failed calls: most agent slowness is avoidable round-trips, not model speed.

[2026-11-19] - Launched the dev app from the sandboxed Bash tool to test agent cursors; the UI worked but the core never wrote `runtime/core.json`, so no MCP/CLI client could connect - The sandbox blocks creating Windows named pipes (`listen EACCES`); relaunched the dev app outside the sandbox - When the core socket is missing in a dev run, check the launcher's sandbox before suspecting the code.

[2026-11-19] - Told agy "don't read files or run commands" to make it faster; it then failed every `execute` (return outside a function, guessing globals), because agy learns MCP tool descriptions by reading its schema files, not from context - Put the tool list + EXECUTE_API_DOC directly in the agy prompt: one `execute`, ~100 s instead of 356 s - Before restricting an agent's behaviour, find out what that behaviour gives it. Verify every prompt change with a live run.

[2026-11-19] - The real host Claude login (~/.claude) was expired. Earlier "live" Claude tests passed only because the shell had Orca's CLAUDE_CONFIG_DIR - Isolated the E2E app env (main strips inherited CLAUDE_CONFIG_DIR/ORCA_*) and saw the real failure - Run live agent tests with the same env the app gives agents, not the dev shell's env.

[2026-11-19] - Chat "did not respond": `claude -p` was spawned with stdin left open (waited 3 s for input), loaded the owner's own hooks/plugins (an antigravity routing hook leaked into design runs), only Claude was offered, models were a hardcoded list - Close stdin always, prompt via stdin, `--setting-sources project,local`, adapters for agy/codex with parsers + `agents.models` from each CLI, streamed `chat.delta` - Spawn every headless agent CLI with an explicit stdin (write+end or ignore) and isolate it from the user's personal config; verify with a live run, not just typecheck.

[2026-11-18] - While visually testing the chat suggestion chips, a Claude Code run started on the dev canvas (chip had filled + focused the composer; the dev window had OS focus while the owner was typing) - Stopped the run immediately via the Stop button; verified chips only set `chatDraft` - When driving the UI in a window the owner can see, never leave a filled composer focused; clear the draft right after the check.

[2026-11-18] - Created a feature branch in the shared `archa-dev` checkout; mid-task the checkout was switched back to `main` while another agent edited the sidebar there, so both sets of uncommitted changes mixed - Moved only my hunks into a new worktree (`../archa-dev-settings`) on the feature branch and restored the shared files; left the other agent's changes untouched - Never do branch work in the shared checkout: start in a dedicated worktree, and check `git status`/current branch before every commit.

[2026-11-18] - Whole window went black after switching Layers -> Chat -> Layers ("destroy_ is not a function") - `ChatPanel` had `useEffect(() => el?.scrollIntoView(...))`; in Chromium 156 (Electron 45) scrollIntoView returns a Promise, React used it as the cleanup and the throw unmounted the tree. Fixed with braces; added a root `ErrorBoundary`, per-load core reconnect and `render-process-gone` reload - Effects always use a block body; never return an expression from an effect. A UI with no error boundary turns any render/effect throw into a blank window.
