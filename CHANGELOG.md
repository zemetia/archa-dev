# Changelog

All notable changes to this project are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Design fidelity
- **Gradients and picture fills**: fills are now a stack of solid, linear gradient (CSS angles), radial gradient and image paints (crop / fit / stretch / tile), on any shape or text. Photo scrims are a real gradient instead of stacked translucent rectangles. `place_image { fillOf }` puts a downloaded photo into a frame's fills. The Fill panel switches between Solid / Linear / Radial / Image with editable stops.
- **Rich text**: `spans` style ranges of one text node (colour, font, weight, italic, size, tracking, underline) — a two-tone headline is one layer. Spans follow edits to the text.
- **Tokens bound to layers**: write `"$color/accent"` (or `bind()`) and the property follows the variable; changing the token restyles every bound layer in one undoable step. HTML export prints them as CSS variables.
- **Components v2**: edits made on an instance survive a sync; components get text / boolean props and variant sets (`setProps(button, { label: "Buy", size: "lg" })`); Reset drops an instance's own changes.
- **Built-in fonts**: Inter, Inter Tight, Geist, Geist Mono, DM Sans, Manrope, Plus Jakarta Sans, Space Grotesk, Outfit, Sora, Instrument Sans/Serif, Bricolage Grotesque, Fraunces, Playfair Display and JetBrains Mono ship with the app and draw the same on every machine.
- **Grids**: frames take `wrap` (items per line) — 6 cards in a 3-column frame become two rows by themselves, like CSS `grid-template-columns: repeat(3, 1fr)`; `lineGap` sets the space between rows. Agents can write `columns: 3`, `gridTemplateColumns` or `rowGap`. Exports as CSS grid; the Auto layout panel has a Cols/Rows field.
- **Glass that agents actually use**: frosted-glass (background blur) is now in the agents' core guide with a recipe, takes CSS-like shorthands (`backdropBlur: 16`, `backdropFilter: "blur(16px)"`), and a lint warns when the glass fill is opaque.
- `.archa` format 4 (older files open unchanged).

## [1.5.0] - 2026-11-21

### Pictures from the web
- **Agents research and fetch images inside ArchaDev**, no Python: the browser tool can `search` Google (web or Images), list the `images` on a page, and `download` one (by URL, from the page, or as a screenshot of an element) — the agent sees a preview to choose from.
- **`place_image`** puts a real photo or logo straight on the canvas; the file is also saved under `~/.archadev/downloads`.

### Rotation
- **Any layer can be rotated**, text included: drag the round knob above the selection (Shift snaps to 15°) or type the angle in the ↻ field. Resizing a rotated layer keeps its opposite corner in place; exports keep the rotation.

### Text like Canva
- The Text tool makes a text box with a set width: long text wraps instead of widening it, also when you edit existing text.
- Drag a **corner** to scale the text with its box; drag a **side** to change the width. Text no longer has top/bottom handles.
- **Text toolbar** over the canvas: font, size − / +, colour, **B** / *I* / U / S, aA case, alignment, bullet / numbered lists, letter and line spacing, transparency.
- **Effects panel**: Drop, Glow, Echo, Outline, Background, Splice, Hollow, Neon, Glitch — each with its own sliders and colour — and **Curve** to bend text into an arc.

### Agents
- **`done`** tool: an agent calls it when it finishes, and its cursor leaves the canvas instead of idling.

## [1.4.2] - 2026-11-21

### Social posts
- **Instagram content looks like posts, not web pages.** A new built-in guide `social` rides along automatically when a request mentions Instagram, feed, carousel, reels, 4:5 or 9:16: 1080×1350 frames, headlines of 96–130px, nothing under 26px, one hero at extreme scale, one overlap, no badges or card grids.
- The **design-social** skill now builds on the canvas first, with a checked example (`examples/canvas-post.js`).
- **Finding skills**: `/` in the chat also searches skill descriptions — `/instagram`, `/feed` or `/carousel` find **design-social** — and shows up to 12 in a scrolling list.
- **Fewer false warnings**: text contrast is measured against the shape behind it (a sticker, a card), and a crop at the edge can be marked as intended with `absolute: true`.

## [1.4.1] - 2026-11-21

### Brand
- **New ArchaDev logo** (gold "A"): in the title bar, the chat welcome, and as the app, installer and taskbar icon.

## [1.4.0] - 2026-11-21

### SVG
- **AI-written SVG lands on the canvas as a drawing.** Agents get a `place_svg` tool and an `svg(markup, parent, opts)` helper in `execute`: shapes become editable vector layers; SVG with gradients, text, filters or masks is placed as an exact image (the agent is told which). SVG markup put into a text layer is placed as a drawing instead of showing the code.
- **SVG in chat replies shows as a picture** with **Place on canvas**, Copy and the source — for ```svg blocks, bare `<svg>` markup and every `place_svg` step.
- **One SVG parser everywhere** (file import, drag and drop, paste, My icons, chat, agents), now without the DOM: rotated and skewed shapes, arcs and `<style>` class rules stay vectors. Pasting SVG with gradients or text no longer does nothing — it lands as an image.
- New built-in design guide `svg` and skill **design-svg** (logo marks, spot illustrations, charts, patterns).

## [1.3.0] - 2026-11-20

### Text
- **Clean in-place editing**: the old text no longer shows doubled under the editor, and one edit makes one undo step.
- **Enter saves**, Shift+Enter starts a new line.
- **Font picker**: search every font installed on this computer, each previewed in its own face, with keyboard navigation; type a name that isn't installed to use it anyway.

### Canvas
- **Drag and drop photos** from Explorer (or a browser) onto the canvas: they land under the pointer, inside the frame there, side by side when you drop several. Dropping a photo on the chat composer attaches it to your message.
- **Remove background**: right-click an image (or Design panel → Image) to cut the subject out, on this computer. The model (BiRefNet lite, MIT) downloads once (~224 MB); the photo never leaves your machine. Undo brings the original back.
- **Drag layers out of frames**: a photo or any layer can now be dragged out of an auto-layout frame (dragging inside it still reorders) and stays visible while it leaves a clipping frame. Dropping into an auto-layout frame shows where it will land.

### Export
- **Multi-page PDF**: select several frames (Shift+click or drag a box) and export them as one PDF, a page each at its own size, in canvas order (left to right, top to bottom). From the Design panel's Export section or right-click **Export as PDF**. PNG, JPG and SVG with several layers save one file per layer into a folder.

### Chat
- **Expandable steps**: every step the agent takes (execute, inspect, screenshot…) opens to show what it did: the code it ran or the arguments, and what came back (or the error).
- **Built-in design skills are on**: `design-website`, `design-pdf`, `design-slides`, `design-social` and `design-flows` now ship with the app and reach every chat run (Claude Code loads them as skills; Antigravity and Codex get them as a list to read). Turn one off in Settings → Skills; a library skill with the same name replaces it.
- **`/skill` mentions**: type `/` in the composer to pick a skill or a built-in guide; its instructions go with that message, for every agent.
- **Minimal by default**: agents now build only what you ask for, without filler sections, labels above headings, badges or extra copy, unless you ask for more.

### Design skills
- **Design taste rules** in every design skill: no labels above headings, one hero at real scale, layered depth with overlap, a repeated motif and a decoration budget, plus a self-check.
- New examples: an annual report, a CV and a studio profile (PDF), a launch deck and a research deck (slides), and a new `design-social` skill with Instagram posts and a carousel.

## [1.2.0] - 2026-11-20

### Assets: icons and logos
- **Assets panel** (grid button on the tool rail, or Shift+I): over 20,000 icons in one place. Lucide, Tabler (outline + filled), Phosphor (thin, light, regular, bold, fill), Heroicons (outline, solid, mini, micro) and about 3,500 brand logos in their brand colours. Search one set or all of them, pick a size and colour, then click to insert or drag onto the canvas.
- **My icons**: upload your own SVG or PNG icons and logos. They are saved on this computer for every document; SVGs stay editable vectors.
- Agents reach every set too: `icon("tabler:home")`, `icon("ph-fill:heart")`, `icon("logos:github")`, `icon("my:<name>")`, and `icons("query")` searches them all.

### Fixes
- The tool rail and the right-click menu scroll instead of running off a short window.

## [1.1.0] - 2026-11-20

### Design skills
- **Four design skills for agents** in `skills/`: `design-website` (minimalist professional sites), `design-pdf` (designed PDF documents), `design-slides` (decks as editable PPTX or HTML/PDF) and `design-flows` (page maps, user flows, swimlanes, state diagrams). Import them in Settings → Skills.
- Each skill ships a complete worked example, ArchaDev canvas snippets for `execute`, a reference of which ArchaDev tools to call (and the `execute` traps seen in real runs), and render scripts that use the installed Chrome/Edge: page screenshots at phone/tablet/desktop width, HTML → PDF with page previews, PPTX previews through PowerPoint, and Mermaid → SVG/PNG.
- Every canvas snippet was run through the real executor, and every example was rendered and checked.

### Web page objects
- New web pages start as a phone (390 × 844) and empty; the link is asked once, then never shown.
- The toolbar snaps to Phone / Tablet / Desktop and saves JPG screenshots: Wide (1440 × 900) or Object (as shown).
- Page scrollbars are hidden; a wheel over the selected page scrolls it without double-clicking. The placeholder card drops the address strip.

## [1.0.1] - 2026-11-20

### Design panel
- **Rebuilt right sidebar.** Layer name with type icon, then Create component, Context, Alignment, Position, Auto layout, Dimensions, Appearance, Text, Fill, Stroke, Effects, Code and Export.
- **Alignment works everywhere.** One layer aligns inside its frame; several align to their bounds; distribute evens out 3+ layers. A layer inside auto layout now changes the parent's alignment instead of doing nothing, and a lone top-level layer says why it can't be aligned.
- **Auto layout:** pick freeform / vertical / horizontal, place children with a 9-dot grid, gap with Space between / Space around, padding per axis or per side.
- **Dimensions:** Fill width/height and Hug width/height checkboxes; typing a width or height makes that side fixed again (text switches to wrapping).
- **Context:** a note for agents on any layer ("keep the price on one line"). Agents see it in their state and in `inspect`.
- **Effects:** drop shadow, inner shadow, layer blur and background blur (frosted glass). Shadows now keep their size at every zoom.
- **Fill opacity** can be typed again (the % field was read-only). **Code:** copy HTML + Tailwind or HTML + CSS to the clipboard, or export it.
- `.archa` format 3 (new effect types, `space-around`); format 2 files open unchanged.

### Agents
- New `inspect` tool and `outline()` helper: a compact read of a design (sizes, layout, paints, text, context) instead of large `get()` JSON.
- `align()`, `distribute()` and `wrap()` in `execute` use the same code as the design panel, so agents arrange layers in one call instead of computing x/y.
- More CSS / Figma spellings are understood (`alignItems`, `justifyContent`, `flexDirection`, `borderRadius`, `stroke`, `blur` / `inset` / `backdrop` effects).
- `get_state` includes an outline of the selected layers and every context note.

### Canvas
- **Connectors** (tool L) for workflows, flowcharts and page maps: drag from one layer to another; the line sticks to both and follows when they move. Elbow (90°) or straight, rounded corners, arrow / dot / no caps; drag an end handle onto another layer to reattach. Exported to SVG and HTML; agents create them with `insert(null, { type: "connector", start, end })`.
- **Right-click menu**: paste here, copy, duplicate, bring to front / send to back, group (Ctrl+G), frame, ungroup (Ctrl+Shift+G), add / remove auto layout, create component, delete, and a pixel grid toggle.
- Chat messages can be selected and copied.

### Orchestrate mode
- **Orchestrate** in the chat composer turns the agent you talk to into a team lead. It splits the job and sends other agents to research or build different sections of the same page at the same time, then checks and joins their work. Each worker has its own name, colour and cursor on the canvas, and can be Claude Code, Antigravity or Codex.
- **Team view** (the Team button in the chat header) fills the window with the team as connected circles: which AI each agent is, its task and the prompt the lead gave it, live status and latest step. Hover shows the whole prompt; clicking an agent zooms into it and opens its chat. Back or Esc returns to the canvas.
- When the whole team is done, the lead is told on its own and checks the result. Stopping the lead stops its team. Worker chats open from the team view and have a back arrow to the lead; History lists only the lead.

## [0.4.0] - 2026-11-19

### Settings
- Adding a Claude or Codex account no longer asks for a name or e-mail. The account is named after the login you sign in with, and for Claude, Add account opens the sign-in straight away.
- The "Use an existing config folder" option is gone; ArchaDev keeps each account in its own folder. Accounts linked to a folder earlier keep working.

### Chat agent: faster and better results
- **Warm sessions.** Claude and Antigravity now keep one process per conversation, so follow-ups skip the start-up. The process starts as soon as you click into the composer.
- **Queue and Send now.** While an agent works, Enter queues your next message; Ctrl+Enter (or the lightning button) stops the current turn and sends it right away. Stop keeps the session alive.
- **Selection chip.** What you have selected is attached to the message as its focus (remove it with ×).
- **Built-in design guides** (landing, web app, mobile, layout, taste, type and colour, components, icons). The matching guide is sent with the first message; agents can read others with `read_guide`.
- **Leaner Claude runs.** Design runs use ArchaDev's own system prompt and no coding tools: about a tenth of the context per step.
- **Agent helpers:** `icon()` places any lucide icon as a vector; text without a colour is fixed automatically; every building step returns a screenshot without an extra call. Each turn ends with its time and cost.
- Agents get fewer failed steps: common CSS/Figma spellings (`auto`, `stretch`, `vertical`, `bold`, `content`…) are understood, names can be re-declared between calls, and errors quote the value that was wrong.
- Dev runs with their own `ARCHA_HOME` use their own core pipe, so they no longer collide with the installed app.

### Export
- The Export section of the Design panel now offers **PNG, JPG, SVG, PDF, HTML + CSS and HTML + Tailwind** for any selected layer, with 1x–4x scale for PNG and JPG. The last choice is remembered.
- **HTML + CSS** writes the page, a CSS file with one class per layer, and an assets folder for images. **HTML + Tailwind** writes one page styled with Tailwind classes. Auto-layout becomes flexbox; hug, fill and fixed sizes carry over.
- **PDF** is one vector page at the layer's size, with selectable text.

## [0.3.0] - 2026-11-19

### Tool rail
- The left tool rail is reorganised. A chevron under a button opens its family:
  - **Move / Scale / Hand.** Scale resizes a selection together with everything inside it: text, strokes, corner radius, gaps, padding and shadows.
  - **Rectangle, Ellipse, Polygon, Icon, Import image or SVG.** Script and Import Figma are marked coming soon.
- New tools: **Pen** (curves, closing, Enter to finish), **Sticky note**, **Web page** (a live site on the canvas that you can scroll and click after a double-click), and **Comment**.
- **Variables** opens a table of the document's colours, numbers and text values. Agents see them in their state and can set them.
- **Find layer** (Ctrl+F) searches layer names, text and URLs, then selects and zooms to the result.
- **Icon** inserts any lucide icon as an editable vector. **Import image or SVG** (Ctrl+Shift+K): an SVG becomes editable vectors when it can.
- **Comments**: drop pins, reply, resolve, and **Apply** (or Apply all) to have the chat agent make the change. Applied comments resolve when the agent finishes.

### Documents
- `.archa` format 2: polygon, vector path, image, sticky note and web page nodes, plus document variables and comments. Older files open and upgrade automatically.
### Agent sessions
- Every chat works under its own random name (for example "Swift Heron") instead of "claude" or "agy". The name stays with the conversation and shows in the chat header, the History list, the activity feed and undo history.
- Chats on the same document run in parallel: start a New chat while another is working and both design on the canvas at once. Only a second message to a conversation that is still working is refused.
- Each agent session has a live cursor on the canvas. It follows the agent's work step by step (creating, editing, copying, moving, deleting, reading, checking), outlines the node it is on, shows "<name> · <action> <node>", and leaves a dashed path behind. Each session has its own colour.
- Agents can copy any part of the design with the new `copy()` in `execute`.

## [0.2.4] - 2026-11-19

### Settings
- Settings is now one dialog with grouped pages: AI providers, Skills, MCP servers, Connect an agent, GitHub, Integrations and About.
- AI providers shows Claude Code, Antigravity and Codex on one page with their real logos; Gemini CLI, Ollama and OpenRouter are listed as coming soon.
- Skills: write a skill, import a skill folder, or copy one from Claude Code, Codex, Antigravity or `~/.agents`. Skills that are turned on reach chat runs.
- MCP servers: add external servers (command, HTTP or SSE), test them and see their tools, import the ones Claude Code, Antigravity or Cursor already use, or start from a preset. Servers that are turned on reach chat runs. Secret values stay on this computer and are never shown again.
- Connect an agent: copy-paste commands that register ArchaDev's MCP server with Claude Code, Codex, Antigravity or any MCP client.
- GitHub and other integrations are shown as coming soon.

## [0.2.3] - 2026-11-19

### Chat
- Antigravity gets the ArchaDev tool list and `execute` guide in its prompt, so it designs right away instead of searching files first. In testing, a small card went from about 6 minutes (or repeated failed attempts) to about 1.5 minutes with one `execute`.
- A rolled-back `execute` now shows in the chat as "execute failed · <reason>", so you can see why the agent retries.
- Agent progress notes (`say`) and screenshots show once, not twice. Agent replies render Markdown (bold, code, lists, headings).
- Claude Code sign-in failures show once, with how to sign in. Validation errors are readable sentences instead of raw JSON.
- If you stop a run before the agent answers, your request is passed on with your next message in that chat, so "continue" keeps working on what you asked.
- A run started from another window or from the CLI opens its conversation in the chat panel. The "1 live" badge stays on one line, and the Stop button is visible.
- `execute`: reusing a `const` name from an earlier call now explains how to fix it.

## [0.2.2] - 2026-11-19

### Left menu
- One header row: Chat on the left, and Layers, Components, Slides and Library aligned right. History opens from the chat header.
- **History**: conversations are saved per document and survive restarts. Opening one resumes that agent session, and New chat starts fresh. Old conversations can be deleted.
- **Components**: turn a frame into a reusable component with a short description, insert linked instances, sync every instance after editing the main, or detach one. Layers marks components and instances in violet.
- **Slides**: every top-level frame shown as a picture at its own size and ratio. Click one to jump to it.
- **Library**: publish components to a global library (`~/.archadev/libraries`) and use them in any document. The first insert adds a local main, and later inserts are instances of it.

### Agents
- Agents get the component and library lists in their canvas state, plus new `execute` helpers: `components()`, `makeComponent()`, `instance()`, `syncInstances()` and `fromLibrary()`. The designer prompt tells them to reuse components before building new ones, so designs stay consistent.

### Chat
- Antigravity and Codex join Claude Code in the agent picker. Agents that are not installed show as "Not installed".
- The model list comes from the installed CLI: Claude Code aliases plus your account's extra models, `agy models` for Antigravity, and Codex's model cache. Your agent and model choice is remembered.
- Agent, model and account pickers are themed dropdowns instead of the system ones.
- Replies stream into the chat while the agent writes, and every run ends with a reply, an error, or "Finished without a reply".
- Fixed: a Claude Code run waited ~3 s for input before starting, and your own Claude Code hooks and plugins were loaded into design runs. Long prompts now go through stdin, so they no longer hit the Windows command-line limit.

## [0.2.1] - 2026-11-18

### Shell
- Left and right sidebars collapse and expand: Ctrl+\ (left), Ctrl+Shift+\ (right), the toggle at the top of the tool rail (left), or the button in the right panel header. When the right panel is hidden, a floating "Design" button brings it back. Panel state is remembered between sessions.
- Left panel tabs are compact icon tabs; the active one is highlighted in the ArchaDev violet and its name shows as the section title.
- Right panel has a header showing the selection name (or "Design") and a violet accent mark.

### Chat
- The composer is now its own card under the thread. It shows the target document, a colour dot for the selected agent, and a violet send button.
- New empty state: suggestion chips fill the composer (they never send on their own), plus short notes on self-checking agents, connecting a terminal agent over MCP, and local `.archa` saves.

## [0.1.0] - 2026-11-18

First release of ArchaDev, a design canvas built for AI agents first.

### Canvas
- Frames, rectangles, ellipses and text on an infinite canvas with pan and zoom.
- Select, marquee, move, resize, drop a layer into a frame, and reorder inside auto-layout.
- Auto-layout (row or column) with gap, padding, align, justify, and fixed/hug/fill sizing.
- Inline text editing, per-author undo/redo, copy/paste/duplicate, wrap in frame or auto-layout.

### Panels
- Layers panel with rename, hide and lock.
- Design panel for position, size, auto layout, appearance, fill, stroke, shadow, text, align and export.

### Files
- `.archa` documents (zip of JSON) with several open in tabs, Save / Open, and `.archa` file association.
- PNG (@2x) and SVG export.

### Agents
- `archa mcp`: MCP server for local agents, which edits the open canvas live. Tools: `get_state`, `execute`, `screenshot`, `export_svg`, `say`.
- `execute` runs the agent's JavaScript in a QuickJS sandbox as one transaction. On failure everything is rolled back and the agent gets an `editId` to patch the snippet.
- Each reply lists lint issues, and screenshots of unchanged frames are not sent again.
- Chat panel: runs Claude Code headless on the open document and shows its progress, with agent edits outlined on the canvas.
- Settings → Agents (Ctrl+,): several login profiles each for Claude Code, Antigravity and Codex, with a per-run account picker in Chat. Tokens stay on this computer and never cross the app protocol.

### Cache
- Frame bitmap cache keyed by content hash, so panning and unrelated edits don't repaint frames.

### Known limitations
- Windows installer only, unsigned (SmartScreen shows a warning).
- `archa mcp` needs the app to be open (no headless mode yet).
- No `.archadev` project mode, components, variables, plugins or `.pen` import yet. See `docs/plan/ROADMAP.md`.
