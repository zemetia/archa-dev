# Changelog

All notable changes to this project are documented in this file, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

### Cache
- Frame bitmap cache keyed by content hash, so panning and unrelated edits don't repaint frames.

### Known limitations
- Windows installer only, unsigned (SmartScreen shows a warning).
- `archa mcp` needs the app to be open (no headless mode yet).
- No `.archadev` project mode, components, variables, plugins or `.pen` import yet. See `docs/plan/ROADMAP.md`.
