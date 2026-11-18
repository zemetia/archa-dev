# 04 — `.pen` import

← [FILES_AND_PROJECTS](../FILES_AND_PROJECTS.md) · [Plan INDEX](../INDEX.md)

## The constraint

`.pen` files are encrypted, and the pen.dev licence (proprietary, High Agency, Inc.) prohibits reverse engineering, derivative works, and using the software to build a competing product. Accent's research (`accent-design/docs/research/pen-cli-harness.md`) followed a clean-room rule; ArchaDev keeps it:

- We do **not** decrypt `.pen`, decompile the pen CLI/editor, or copy pen's docs, style archetypes or `.lib.pen` libraries.
- Import goes only through tooling the **person has installed and is licensed to use**, and reads what that tooling's public interface returns.

**Before building any `.pen` importer, the owner must get a licence review** on whether using pen's own public tools to export a person's own file into a competing product's format is allowed. Until then this phase stays blocked. Decision D-06 in [DECISIONS.md](../DECISIONS.md).

## Candidate import paths (pending that review)

| Path | How | Fidelity | Dependency |
|---|---|---|---|
| A. Via pen's export | The person exports from pen (HTML/CSS, SVG, PNG); ArchaDev imports HTML/SVG generically | Medium: structure from HTML, no components/variables | None on pen at import time — cleanest legally |
| B. Via the person's pen MCP / CLI | ArchaDev asks the user's installed `pen` / pencil MCP to open the file and read nodes through its documented read API, then maps them | High: nodes, variables, components | pen installed and signed in; licence review required |
| C. Native parser | — | — | **Ruled out** (requires decryption / reverse engineering) |

Recommended order: build **A** first (it is also our general HTML/SVG importer, useful on its own), add **B** only if the review allows it.

## Mapping (for path B, and partly A)

| pen concept (as documented publicly) | ArchaDev |
|---|---|
| Frame with flex layout | `frame` with auto-layout |
| Sizing number / fit / fill | `fixed` / `hug` / `fill` |
| Text with sizing modes | `text` with matching sizing mode |
| Variables with theme axes | Variables with theme axes (same idea, our own schema) |
| Component, instance, overrides by id path, slots | Component, instance, overrides by id path, slots |
| Image fill | Image asset in our store |
| Icon by name | Icon node from our icon set, or SVG path if not mapped |
| Unknown | Kept as a flattened image + note in the import report |

Every import writes an **import report** (nodes mapped, approximated, dropped) next to the design and shows it in the app.

## Other importers (same pipeline)

SVG, HTML/CSS (page or element, via headless Chromium measuring computed styles — Accent's reference browser does this already), images, DTCG tokens JSON, Figma later (via its REST API with the person's token; no file parsing).
