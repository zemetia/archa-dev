# Changelog

All notable changes to this project are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Files
- **Images live next to the file, not inside it.** Saving `landing.archa` keeps its images in `landing-asset/images/` and the document only points at them (`asset:images/…`). Pasted, imported and agent-made images are written there as they arrive, so `.archa` files no longer carry base64 and stay small.
- Opening an older file moves its embedded images out into the folder; save once to slim the file down. File format is now version 3 (older ArchaDev versions cannot open it).
- Agents can place a photo by its file path or URL instead of sending the image itself.
- Exports (HTML, SVG, PDF) and published library components still include their images.

### Chat
- **Every conversation is its own `.json` file** in `<name>-asset/chats/`, with its pasted images in `chats/attachments/`. Conversations travel with the design folder and load from there when you open it; they are never stored inside the `.archa`. History from earlier versions moves over on first open.

### Design
- **Gradients.** Fills can be linear or radial gradients, edited in the Design panel (Solid / Linear / Radial, angle, colour stops) and exported to SVG, HTML and PDF.
- **Rich text.** One text node can mix colours, weights, fonts, underline and strikethrough. Styles stay on the right words when the text is edited.
- **Token bindings.** A fill, radius, gap, padding, font size and more can be bound to a variable; change the variable and every bound layer follows. Editing the property by hand unbinds it. Undo covers both.
- **Instance overrides survive sync.** Text, images or colours changed on a component instance are kept when the main is synced, and synced layers keep their ids.
- **Twelve fonts built in**: Inter, Inter Tight, Roboto, Open Sans, Poppins, Montserrat, Plus Jakarta Sans, DM Sans, Manrope, Space Grotesk, Playfair Display, JetBrains Mono — drawn and measured exactly on every machine.

### Agents
- MCP tools (`get_state`, `execute`, `screenshot`, `export_svg`, `say`) take a `doc` argument — a document id, `.archa` path or name — so an agent can work on any open document, not only the active one. New tools: `list_documents`, `open_document`, `new_document`, `save_document`.
- Screenshots are no longer shrunk: agents get the full-size image plus a temporary file path. A tall page comes back as readable full-width slices, each labelled with its y range. Replies stay under the size MCP clients accept, so a long page no longer drops the connection. The in-app browser screenshots work the same way.
- **Rebuild from a reference.** `reference` reads a PDF page (or image) into numbers — every text line with position, size and colour, boxes with their corner radius, the palette, the type scale — and puts its photos straight into the document's asset folder. `compare` diffs a build against the reference and names the layers in the worst regions, with a heat map. A built-in `rebuild` guide walks agents through it.
- `execute` gains `image(path)` (the app reads the file and uses its real size), `bind()` for tokens and `fonts()`; fills accept CSS gradient strings and text accepts `runs` for rich text.

### Canvas
- **Text fits its box.** Layout now measures text with the real widths of the bundled fonts instead of an estimate, and the canvas draws with the same metrics, so hug-sized frames, centred text and wrapped paragraphs line up. SVG export keeps wrapped lines.
- Outside strokes no longer erase the fill of the shape they belong to.
- Fixed 823 lucide icons (arrows, search, x and more) that drew broken.

### Settings
- Claude Code installed through npm signs in again (it failed with `spawn … ENOENT` on Windows).

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
