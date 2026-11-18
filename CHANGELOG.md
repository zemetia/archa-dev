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
