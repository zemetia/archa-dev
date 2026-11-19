# Built-in Chat Agent — Fluent Design Plan

← [Plan INDEX](./INDEX.md) | Related: [AGENTS_AND_MCP](./AGENTS_AND_MCP.md), [ROADMAP](./ROADMAP.md), blueprint [AGENT_BRIDGE](../blueprint/AGENT_BRIDGE.md), [MCP](../blueprint/MCP.md)

**Goal (owner, 2026-11-19):** the Chat tab is *the* way to design with AI in ArchaDev, like the composer in pen.dev's Chat tab: pick a model beside Send, type, and watch it design fluently. Make designing with the agent faster, smoother and easier to steer.

Reference = pen.dev's public docs only (clean-room, no copied text or behaviour internals).

---

## 1. Where we are (0.3.0)

| Works | Hurts |
|---|---|
| Chat spawns claude / agy / codex headless with the archadev MCP; model list per CLI; accounts; parallel sessions with cursors | **Cold start every turn**: a new CLI process per message (Claude ~5-10 s, agy 1-3 min) |
| `execute` snippets, one transaction each, lint + screenshot replies | Agent + model + account are three controls; no shortcut to "use my selection" |
| Comments → Apply, History, undo per transaction | A second message while working is **refused** (no queue / steer) |
| Skills from Settings reach runs | No `/` menu for skills; no styles; no variants mode; no turn cost/time |
| | Agent draws everything from rectangles: no icons helper, no starter kit, so more calls and plainer output |
| | Review is "scroll the canvas": no per-turn change card, no "undo this turn" |

---

## 2. Decision first — the engine (D-11, owner)

| Option | What | For | Against |
|---|---|---|---|
| **A. Warm CLI sessions** (recommended first) | Keep one CLI process alive per thread and feed turns over stdin (`claude -p --input-format stream-json`; codex app-server; agy stays per-turn until it has an equivalent) | Keeps D-08 (agent-neutral, the person's own logins); kills cold start; enables steer mid-turn | Each CLI differs; must spike each |
| B. Direct-API engine "ArchaDev Agent" | Our own agent loop in the core host calling the model API with our tools in-process (no MCP hop) | Fastest loop; full control of prompt, caching, cost | Needs API keys (not subscriptions); a 4th adapter to maintain |
| C. Both | A now, B as an optional "fast" engine later | | |

Recommendation: **A now, B only if A cannot reach the speed targets below.**

---

## 3. Workstreams

### W1 — Composer (pen-like, easier)
| # | Item | Detail |
|---|---|---|
| 1.1 | **One model picker beside Send** | Single grouped menu: Claude › Fable / Opus / Sonnet / Haiku, Codex › …, Antigravity › … Account moves into the menu footer. Last choice remembered per document |
| 1.2 | **Context chips** | Current selection auto-attached as a chip (`◇ Pricing Card`), removable; `@` mentions layers/components/pages; drop/paste images (reference) and URLs (opened in the browser tool) |
| 1.3 | **`/` menu** | Skills (Settings → Skills) + built-in actions: `/variants 3`, `/polish`, `/responsive`, `/to-component`, `/export-code` |
| 1.4 | **Style chip** | Pick a style profile before sending (needs Phase 7 profiles; until then: "Match canvas" = read existing variables) |
| 1.5 | **Queue + steer** | Typing while running queues the message (chip "queued"); **Send now** steers the running turn (warm session) instead of refusing |
| 1.6 | **Turn footer** | Time, tokens/cost when the CLI reports it (`result.total_cost_usd`), model used |

### W2 — Engine speed (fluent)
| # | Item | Detail |
|---|---|---|
| 2.1 | **Warm sessions** (D-11 A) | Process per thread stays alive while the thread is open; idle-kill after 10 min; resume id kept as today for cold restarts |
| 2.2 | **Pre-warm** | Start the session when the composer gets focus / a thread opens, so the first Send is instant |
| 2.3 | **Lean prompt** | System prompt = DESIGNER_PROMPT + EXECUTE_API_DOC once per session (cached), turn = request + state *diff* since last turn, not the full state |
| 2.4 | **Fewer round-trips** | `execute` auto-attaches a screenshot of the created root when the snippet asks for none; common lint fixes applied in the core (text without fill → ink colour, hug in non-layout parent → fixed) and reported, not bounced back |
| 2.5 | **Progressive apply** | A long snippet can `commit()` mid-way so the canvas updates in steps (still one undo group per call) |

### W3 — Better first results (less work per design)
| # | Item | Detail |
|---|---|---|
| 3.1 | `icon(name, parent, { size, color })` | Lucide icons as vectors inside `execute` (app already ships lucide) |
| 3.2 | **Starter kit library** | Built-in global library: button, input, select, card, navbar, tab bar, table row, badge, avatar — as components the agent places with `fromLibrary()`, themed by variables |
| 3.3 | **Skeleton first** | Prompt rule + helper: create named placeholder frames for every planned screen/section first (visible plan on the canvas), then fill each one |
| 3.4 | **Placeholder images** | `image({ prompt, w, h })` draws a labelled placeholder now; real generation later (plugin generator, Phase 10) |
| 3.5 | **Variables-first** | Agent creates `color/*`, `space/*`, `radius/*` variables on a blank doc before building (bindings in Phase 7) |

### W4 — Review and control
| # | Item | Detail |
|---|---|---|
| 4.1 | **Change card per turn** | In the thread: thumbnails of frames created/changed this turn → click zooms; **Undo turn** (all its transactions as one); **Keep** |
| 4.2 | **Ask about selection** | Ctrl+L or right-click → "Ask agent…" opens the composer with the selection chip |
| 4.3 | **Variants mode** | `/variants N` or a 1-4 stepper: N sessions build side by side in empty space; pick one → others removed (blueprint 04 `variants`) |
| 4.4 | **Divide mode** | One prompt split into sections, one session each, shared variables/components (Phase 13 lite) |
| 4.5 | **Permissions** | archadev tools always allowed (undoable); anything else a run asks for (files, shell) → Allow / Deny card in the thread |

---

## 4. Order and "done when"

| Step | Contents | Done when |
|---|---|---|
| S1 | Spike 2.1 on Claude (stdin stream-json, multi-turn, interrupt) and Codex | Second message in a thread starts producing output in < 2 s; interrupt + new instruction works |
| S2 | 1.1, 1.2, 1.5, 1.6, 2.1-2.3 | Owner sends 5 follow-ups in one thread without waiting for cold starts; selection chip used by default |
| S3 | 3.1, 3.2, 3.3, 2.4 | "Pricing page with 3 tiers" finishes in ≤ 6 `execute` calls with icons and kit components, lint clean |
| S4 | 4.1, 4.2, 1.3 | Owner reviews a turn from its card and undoes it in one click |
| S5 | 4.3, 1.4, 4.5, 2.5 | 3 variants of one hero side by side; choosing one removes the others |
| S6 | 4.4, 3.4, 3.5 | 3-screen flow built by 3 sessions with no duplicated components |

Measure every step on the same 3 prompts (pricing page, mobile onboarding, dashboard): time to first canvas change, total time, `execute` calls, lint issues left.

---

## Status (2026-11-19)

Built on `zemetia/pen-import-export`: S1 (warm Claude + agy, interrupt, queue, pre-warm), 1.2 (selection chip), 1.5 (queue / Send now), 1.6 (time + cost per turn), 2.1–2.2, 2.4 (auto-screenshot, auto-fix), 3.1 (`icon`), internal guides (`read_guide` + first-turn pre-load), lean Claude system prompt. Codex warm mode: not installed here, not built. Next: 1.1 single model menu, 3.2 starter kit, 4.1 change card.

## 5. Open questions for the owner

1. D-11: A (warm CLIs), B (direct API with keys) or C?
2. Default model for new chats — Sonnet (speed) or Opus/Fable (quality)?
3. Starter kit look: neutral (shadcn-like) or ArchaDev's own?
4. Variants: max 3 or 4 in parallel on this machine?
