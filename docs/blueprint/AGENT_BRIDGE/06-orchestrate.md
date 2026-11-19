# Agent Bridge — 06: Orchestrate Mode

← [AGENT_BRIDGE.md](../AGENT_BRIDGE.md) | [Blueprint INDEX](../INDEX.md) | [05 — Skills and MCP servers](./05-skills-mcp.md)

**Built (0.5.0).** Code: `core-host/agents.ts` (ChatRunner → orchestrate), `apps/cli/src/mcp.ts` (team tools), `protocol/agent-docs.ts` (briefs), `renderer/ui/OrchestraView.tsx`.

---

## Idea

The agent the person chats with becomes the **lead**. It splits the job and starts **workers** — other chat threads, each its own agent CLI process, session name, colour and canvas cursor — that research or build different parts of the same document **at the same time**, then it checks and joins the result. Parallel work is faster; small, focused briefs give more detailed parts.

---

## Threads

| Rule | Detail |
|---|---|
| Mode | `chat.send` takes `mode: 'chat' \| 'orchestrate'`. A new thread sent with `orchestrate` is a lead. The mode is fixed once a thread has messages |
| Role | Every message of a team thread carries `orchestra`: `{ lead: true }` on the lead, `{ parent, title, kind?, prompt }` on a worker (`parent` = lead thread id). Stored in the chat jsonl, so teams survive a restart |
| Workers | Ordinary chat threads: the person can open one and talk to it directly. Their messages to the person show the lead's prompt; the agent gets the team brief (`workerBrief`) instead (`SendOptions.brief`) |
| Agent | A task may pick `claude` / `agy` / `codex`; default = the lead's agent, with the lead's model and account (another agent → its defaults) |
| Names | A worker's session name is reserved at delegate time (`names`), so parallel workers never share a name or colour slot |
| Limit | At most 8 workers working per lead (`MAX_WORKERS`); `delegate` takes 1-8 tasks |
| Delete | Deleting a lead deletes its workers; refused while any of them runs |

---

## Team Tools (archadev MCP)

Registered for every run (agy's MCP server is global, so it cannot be per thread); the core refuses them unless the calling connection's thread (`conn.threadId`, from `ARCHA_RUN_ID`) is a lead.

| Tool | Core method | Effect |
|---|---|---|
| `delegate { tasks: [{ title, prompt, kind?, agent?, model?, frame? }] }` | `orchestra.delegate` | One new worker thread per task, all started at once. `frame` = a frame id: the worker's focus and the only area it may change |
| `wait_workers { workers?, timeoutSec? }` | `orchestra.wait` | Blocks until the workers (default all) stop working, the lead's turn ends, or the timeout (default 240 s, max 600). Returns status + last reply (≤ 2400 chars) per worker |
| `tell_worker { worker, message }` | `orchestra.tell` | Follow-up for one worker by name or thread id; queued if it is busy |

Long calls: Claude runs get `MCP_TOOL_TIMEOUT` = 11 min; codex gets `mcp_servers.archadev.tool_timeout_sec=660`.

---

## Briefs

| Brief | When |
|---|---|
| `ORCHESTRATOR_PROMPT` | Prepended to the lead's request on its first turn as lead (works for every CLI: it rides on the message). Teaches: split, build the shared foundation first (variables + one empty named section frame per worker), self-contained prompts, research before design, 2-6 workers, wait, check seams, summarise |
| `workerBrief()` | First message of a worker: its name, its lead, its area (frame) or "do not touch others' nodes", research = no canvas changes, reply with a short report + node ids |

---

## Lifecycle

| Event | Effect |
|---|---|
| Worker turn ends (started by the lead) | Added to the lead's unreported set; `wait_workers` waiters re-check |
| `wait_workers` returns | Its workers leave the unreported set |
| Whole team done while the lead is idle | **Auto report**: status "Team finished — <lead> is checking their work" and a new lead turn with every report, so the lead integrates without the person asking |
| Person stops the lead | Its working workers are stopped and their queues cleared; no auto report until the person writes to the lead again. **Send now** on a lead does not stop the team |

---

## Team View (renderer)

| Rule | Detail |
|---|---|
| Open | Chat header **Team** button (lead or worker thread) → `orchestraView = leadThreadId`. Fills the window over the shell; **Back** or Esc closes it |
| Graph | Lead circle in the centre, workers on an ellipse (an even team turned half a step so nobody sits below the lead). Ring = session colour; icon = task kind (research, design, copy, review); dot = agent CLI colour; badge = done / failed / stopped; halo pulses while working |
| Links | Curved lead → worker line in the worker's colour; a dot travels along it while the worker works |
| Text | Under each circle: name, agent · kind, task title, the prompt (2 lines) and its latest activity. Hover → the full prompt in the opposite corner, the others fade |
| Click | Zooms into the agent, then closes the view and opens that agent's chat (`chatThread`), opening the left panel if needed |
| Chat | Worker header: ← back to the lead's chat. Composer: Chat / Orchestrate toggle for a new chat (remembered as `archa.chatMode`), a fixed Orchestrate / Worker badge for a started one. History lists leads (team icon), not workers |
