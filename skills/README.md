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
| [design-social](design-social/SKILL.md) | Instagram posts and carousels (4:5, 1:1, 9:16), LinkedIn/X images | 1080×1350 frames via `execute`, PNG export, HTML + `render-pdf.mjs --dpi 96` |
| [design-svg](design-svg/SKILL.md) | Logo marks, spot illustrations, charts, patterns drawn as SVG and placed on the canvas | `place_svg`, `svg()` in `execute`, `screenshot` |
| [design-flows](design-flows/SKILL.md) | Page maps, user flows, swimlanes, state diagrams | Boxes + `connector` nodes via `execute`, Mermaid for docs |

## Shared rules

Every design skill opens with the same hard rules, because agents imitate defaults and examples
before prose: **no eyebrows** (no small label above a heading), one hero element at extreme scale,
use the edge (bleed), depth through ground / raised / floating with at least one overlap, one motif
repeated with variation, alternating grounds and layouts, a content diet, and a decoration budget.
The examples obey them, so copying an example never teaches the wrong habit.

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
