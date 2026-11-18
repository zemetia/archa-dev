# 04 — Review loop

← [AGENTS_AND_MCP](../AGENTS_AND_MCP.md) · [Plan INDEX](../INDEX.md)

Ported from Accent's review board (sections 15–18 and 20 of its research doc), adapted to a node canvas.

## Pieces

| Piece | Behaviour |
|---|---|
| Comments | Pinned to a node (stable id, not a selector). Threads, replies, attachments (pick, drop, paste), resolve |
| Sketch on canvas | Pen/arrow/shape/text markup on a review layer above the design; sent to the agent as a picture plus the typed notes with the node each sits on |
| Round | Person presses **Send to agent** (or Ctrl+L handoff box). Round = note + comments + markup + selection. Delivered to a launched run or to an agent blocked in `review_wait` |
| Round close | Agent calls `review_done(summary)`; History stores request, summary, before/after per frame |
| Decisions | `ask` (question + options) and `variants` (several takes on one node) block the agent until the person picks in a modal; one tab per pending decision; answers revisitable |
| Variants | Each take is a temporary branch of the document (ops on a fork); choosing applies that fork's ops. Swapping later is direct only while the touched nodes are unchanged; otherwise it becomes a new request |
| Activity | Every tool call and agent event; agent cursor with name tag on the node in question; Activity tab |
| History | A scrubber over rounds; before/after side by side |

## Quick actions

- **Ctrl+K**: palette over everything (frames, nodes, comments, rounds, library items, issues, decisions, actions). Prefixes: `>` actions, `@` nodes, `#` comments, `/` pages.
- **Ctrl+L**: handoff box — one sentence to the agent with suggestions from the current selection; submit sends a round and turns on Follow (camera follows the agent cursor).

## Delivery rules

- Launch: the app starts a run with the round as prompt (see [02-agent-bridge.md](./02-agent-bridge.md)).
- Listen: any agent in `review_wait` gets it; a heartbeat shows who is listening.
- If both: the person picks.
