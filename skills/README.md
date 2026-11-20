# ArchaDev design skills

Skills that teach any agent working in ArchaDev (Claude Code, Antigravity, Codex, Hermes) how to
produce professional design work, with the canvas tools as the first step. Each folder is a standard
skill: `SKILL.md` (frontmatter `name` + `description`, then instructions), plus `examples/`,
`references/` and `scripts/`.

| Skill | For | Main ArchaDev tools |
|---|---|---|
| [design-website](design-website/SKILL.md) | Minimalist, modern, professional websites and landing pages | `execute` (tokens, sections, components, `icon()`), `screenshot`, `browser` |
| [design-pdf](design-pdf/SKILL.md) | Designed PDF documents: proposals, reports, CVs, invoices, certificates | A4 page frames via `execute`, Export → PDF, print HTML + `render-pdf.mjs` |
| [design-slides](design-slides/SKILL.md) | Pitch and presentation decks as PPTX or HTML/PDF | 1920×1080 frames, the Slides panel, `delegate` for long decks, pptxgenjs |
| [design-flows](design-flows/SKILL.md) | Page maps, user flows, swimlanes, state diagrams | Boxes + `connector` nodes via `execute`, Mermaid for docs |

## Every example is checked

- `execute` snippets (`examples/canvas-*.js`) were run through the real `AgentExecutor`
  (headless, temp `ARCHA_HOME`), exported with `exportHtmlStandalone`, and looked at.
- HTML/PDF examples were rendered with the bundled scripts and checked page by page. The PPTX example
  was rendered through PowerPoint. The Mermaid examples render without errors.

## Install into ArchaDev

Settings → Skills → **Import** and pick a skill folder. It is copied into `~/.archadev/skills/` and handed
to every chat run (blueprint AGENT_BRIDGE/05). Agents outside the app can also load the folders directly
(`~/.claude/skills`, `~/.agents/skills`, …).

Scripts need Node ≥ 18 and Chrome or Edge. Page previews need `pdftoppm` (poppler). PPTX previews need
PowerPoint (Windows) or LibreOffice. pptxgenjs and mermaid-cli are fetched with npm/npx when used.
