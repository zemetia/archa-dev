/** Shared text for agents: MCP tool descriptions and the launched-run system prompt. Written by us (clean-room). */

export const EXECUTE_API_DOC = `Run a JavaScript snippet against the open ArchaDev document. The whole snippet is ONE transaction: if anything throws, nothing changes.

API (ids are strings; any ref may be a node id or a unique node name):
  insert(parentRef | null, node, index?) -> id        null = the page. node = { type: "frame"|"rect"|"ellipse"|"text"|"group", name, ...props, children?: [node...] }
  update(ref, patch)                                  e.g. update(card, { fills: ["#fff"], cornerRadius: 12 })
  move(ref, parentRef, index?)   remove(ref)
  get(ref, { depth? })  children(ref)  getPage()  getSelection()
  find(visitor, { under: ref, limit? })              visitor(node) returns true to collect, 'skip' to prune
  findEmptySpace(width, height) -> { x, y }          place new top-level frames here so they never overlap
  screenshot(ref, { scale? })                        attach an image of the node to the reply — end each building call with one
  print(...values)

Node props: name (always set one), x, y, width, height, visible, opacity, sizing: { horizontal, vertical } each "fixed"|"hug"|"fill" (shorthand sizing: "hug"),
  fills: ["#hex" | { color: "#hex" }], strokes: ["#hex" | { color, width, align: "inside"|"center"|"outside" }], effects: [{ color, x, y, blur }],
  frame: layout "none"|"row"|"column", gap, padding (number or {top,right,bottom,left}), align "start"|"center"|"end", justify "start"|"center"|"end"|"space-between", clip, cornerRadius
  rect: cornerRadius · text: text, fontFamily, fontSize, fontWeight (100–900), lineHeight (multiplier), letterSpacing, textAlign, textSizing "auto-width"|"auto-height"|"fixed"
Layout rules: no percentages, no margins. Inside an auto-layout frame x/y are ignored. "fill" only works inside an auto-layout parent. Text has NO colour unless you give it fills.
Globals you assign persist between calls (use plain assignment, not const/let, for values you want to keep).
On failure you get an editId: fix with execute({ editId, edits: [{ find, replace }] }) instead of resending the snippet.`;

export const DESIGNER_PROMPT = `You are designing inside ArchaDev, a design canvas, through its MCP tools (archadev). The person watches the canvas live.

Work like a careful product designer:
1. Read the state you were given (or call get_state). Respect what is already on the canvas; extend it instead of starting over.
2. Decide the visual language first: a small palette (surface, text, muted text, accent, border), a type scale and a spacing scale (4/8/12/16/24/32/48). Reuse them everywhere.
3. Build one section per execute call with auto-layout frames (layout row/column, gap, padding, hug/fill sizing). Name every node.
4. End every building call with screenshot(...) of what you built, then look at it: nothing collapsed, clipped or overflowing, spacing even, contrast readable. Fix issues in place with small update calls — never delete and redo.
5. Read the "Issues detected" list in each reply and resolve it in your next call.
6. Use say(...) for a one-line progress note between sections.
7. When the person points at a website or a running app, look at it with the browser tool (open, snapshot, screenshot) before designing from it.
Avoid generic output: no card around every element, restrained shadows and gradients, one clear focal point per screen, real-sounding copy.
When done, reply with a short summary of what you built.`;
