---
name: design-flows
description: Plan and diagram product and website structure before visual design - page maps/sitemaps, user flows, workflows and business processes (swimlanes), information architecture, screen inventories, low-fi wireframe outlines, user journeys, and state diagrams. Use whenever the user asks for a workflow, flow, flowchart, page map, sitemap, site structure, user flow, user journey, IA, app structure, screen list, process diagram, swimlane, or "what pages do I need". Draws on the ArchaDev canvas with connector lines, and/or outputs Mermaid diagrams plus structured tables.
---

# Workflows, page maps and flows

Structure comes before pixels. These artifacts answer *what exists*, *how people move
through it*, and *who does what*, so that the visual design (`design-website`) and the build
have a solid skeleton.

## Files in this skill

| File | What it is |
|---|---|
| [examples/canvas-flows.js](examples/canvas-flows.js) | A page map and a swimlane drawn on the ArchaDev canvas with real `connector` nodes (checked against the real executor; no line crosses a box) |
| [examples/sitemap.mmd](examples/sitemap.mmd) | Mermaid page map: numbered IDs, 3 levels, a utility group, key pages highlighted |
| [examples/user-flow.mmd](examples/user-flow.mmd) | Mermaid user flow: happy path left to right, labelled decision exits, error branches |
| [examples/swimlane.mmd](examples/swimlane.mmd) | Mermaid workflow across actors as a `sequenceDiagram`, with alt/else for the decision |
| [examples/order-states.mmd](examples/order-states.mmd) | Mermaid state diagram of a document's lifecycle with the trigger of each transition |
| [scripts/render-mermaid.mjs](scripts/render-mermaid.mjs) | `node scripts/render-mermaid.mjs a.mmd b.mmd --png --out dir` renders with the installed Chrome/Edge and reports syntax errors |
| [references/archadev-tools.md](references/archadev-tools.md) | Which ArchaDev tools to call, connector rules, and layout recipes per diagram type |

All Mermaid examples render without errors.

## Tools

- **Inside ArchaDev**: draw on the canvas. Use `get_state`, then `execute` with boxes (frames + text) and lane
  bands (rects), then `connector` nodes (elbow, arrow caps) inserted after the boxes, then `screenshot`.
  Use `browser` to crawl an existing site's navigation for its current page map.
- **Anywhere else / for docs**: Mermaid (`.mmd` or fenced ```` ```mermaid ```` blocks), rendered and checked with
  `scripts/render-mermaid.mjs`.
- Usually both: the canvas board for working on it with the person, and Mermaid in the project docs.

## Pick the right artifact

| Question | Artifact | Canvas | Mermaid |
|---|---|---|---|
| What pages/screens exist and how are they grouped? | **Page map / sitemap** | Box tree + connectors bottom→top | `flowchart TB` |
| How does one user complete one task? | **User flow** | Row of boxes, decisions, error row below | `flowchart LR` |
| Who does what, in which order? | **Workflow / swimlane** | Lane bands + connectors (the real swimlane) | `sequenceDiagram` |
| What does each screen contain? | **Screen inventory + wireframe outline** | Screen frames in a row | table + block outline |
| What does the user feel and need at each stage? | **User journey** | Stage columns, sticky notes | `journey` |
| What states can a thing be in? | **State diagram** | Boxes + connectors | `stateDiagram-v2` |
| What data entities exist? | **Data model** | — | `erDiagram` |

Start with the page map for websites, and with user flows plus the screen inventory for apps.
Do workflows when several roles or systems are involved.

## 1. Gather inputs

- Goals of the business and the **top 3 user tasks** (e.g. "find a product", "pay", "track order").
- **Roles**: visitor, customer, admin, staff, external system.
- **Content/features** the user listed. Fill obvious gaps (login, 404, privacy policy, empty
  states), and mark anything you added as *suggested*.

## 2. Page map / sitemap

- Use at most 3 levels for websites. Every page should be reachable in ≤ 3 clicks.
- Group by the **user's mental model**, not the org chart ("Services", not "Division B").
- Number pages hierarchically: 0 Home, 1.0 Services, 1.1 Courier… Mark key pages (home, sign-up, app entry).
- Mark the nav each page lives in (main nav, footer/utility, auth-only).
- Follow the diagram with a table: `ID | Page | Purpose (one line) | Key content | Primary CTA | Nav`.

## 3. User flow

- One flow per task. Write the **trigger** (entry point) and the **success end** first.
- Mermaid shapes: `(["Start/End"])` for terminals, `["Screen"]` for screens, `{"Decision?"}` for decisions,
  `[/"System action"/]` for automated steps. Quote labels that contain punctuation.
- Draw the happy path left to right in a straight line first, then add branches for errors, empty states,
  "not logged in" and cancel. Every decision exit is labelled (`-- ya -->`).
- Count the steps on the happy path. If it can be shorter, propose that.

## 4. Workflow / swimlane

- One lane per actor or system. Each step is **verb + object** ("Approve invoice").
- Show handoffs, wait states, and what triggers each step. Mark manual vs automated steps.
- **Don't build swimlanes from Mermaid `flowchart` subgraphs**: once arrows cross lanes, Mermaid drops the
  lane direction and the result tangles (seen in a real render). Use `sequenceDiagram` in Mermaid, or real
  lane bands on the canvas.
- Below the diagram, point out bottlenecks, loops, and steps that could be automated.

## 5. Screen inventory and wireframe outline

For each screen: `ID | Screen | Reached from | Main goal | Components | States (empty/loading/error) | Role`.
For key screens, give a block outline from top to bottom:

```
[Header: logo · nav · "Coba gratis"]
[Hero: headline / sub / 2 buttons | product card]
[Proof: 6 partner logos]
[Features: bento, 1 big stat + 3 tiles]
[CTA band] [Footer]
```

On the canvas, screen flows are real frames (390×844 or 1440 wide) in a row, joined by connectors.

## 6. States, journeys, data

- `stateDiagram-v2` for lifecycles. Label every transition with its trigger, and list who can make it.
- `journey`: stages, actions, feelings (1–5) and pain points, which give you opportunities.
- `erDiagram`: entities, key fields and relationships, when the flows imply data.

## 7. Check and deliver

- Render every Mermaid diagram (`scripts/render-mermaid.mjs … --png`) and **look** at it: labels readable,
  no tangled lines, under about 20 nodes (split if bigger). Avoid `;` inside labels or notes, because
  Mermaid treats it as a statement break.
- On the canvas, `screenshot` the board after the connectors are in. If a line crosses a box, move the box.
- Deliver, in order: the diagram(s), the supporting table(s), the assumptions and *suggested* items,
  and 3–5 recommendations (simplify a flow, merge pages, remove a step). Keep labels in the user's language.
