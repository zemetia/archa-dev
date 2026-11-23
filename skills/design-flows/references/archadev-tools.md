# ArchaDev tools for flows, page maps and workflows

The canvas has real **connector** nodes: lines that stick to the boxes they join, with 90° (elbow) or
straight routing, rounded corners and arrow/dot caps. When the person is in ArchaDev, draw the
diagram there; it stays editable and readable, and tangles can be fixed by moving boxes. Mermaid
is the portable text version for docs and READMEs.

| Tool | Use it to |
|---|---|
| `get_state` | Find free space and existing boards before drawing |
| `execute` | Draw boxes (frames with auto layout + text), lane bands (rects), sticky notes, then `connector` nodes |
| `screenshot` | Look at the whole board after the boxes, and again after the connectors |
| `inspect` | Read an existing flow before extending it |
| `say` | Progress note between boards (a separate tool) |
| `browser` | Crawl a live site to build its current page map (`open`, `snapshot` for the nav links) |

## Connector rules (from the execute API)

```js
insert(null, { type: 'connector', name: 'A → B',
  start: { nodeId: a, side: 'bottom' },   // side: auto | top | right | bottom | left; or a free point { x, y }
  end:   { nodeId: b, side: 'top' },
  routing: 'elbow',                       // or 'straight'
  cornerRadius: 8, startCap: 'none', endCap: 'arrow',   // caps: none | arrow | dot
  strokes: [{ color: '#9a958c', width: 1.5 }] });
```

- Insert connectors **on the page** (`parent null`), **after** the nodes they join. Never set their x/y/width/height;
  layout routes them and they follow the boxes when they move.
- Connectors have no text. Put decision labels ("ya", "tidak") in a small text node beside the line.
- Choose sides so lines flow one way: page maps go bottom → top, flows and swimlanes go right → left.
- If a line crosses a box, move the box to its own column or row instead of adding bends.

## Layout recipes

| Diagram | Layout |
|---|---|
| Page map | Board frame; level 0 centred at the top; level 1 in one row (300 apart); level 2 under each parent, side by side; a single child goes right under its parent; key pages (home, sign-up, app) tinted |
| User flow | Left to right, one row for the happy path (270 apart); error branches in a second row below; terminals as pills (`cornerRadius: 999`), decisions as boxes ending in "?" |
| Swimlane | Board with one full-width `rect` band per actor (190 high, 10 apart) and the actor name top left; each step in its actor's band; one column per step in time order; automated steps get a different stroke or shape |
| Screen flow | Real screen frames (390×844 or 1440 wide) in a row with 120 gaps, joined by connectors from the button that leads on to the next screen |

## Checked

[../examples/canvas-flows.js](../examples/canvas-flows.js) builds a page map and a swimlane with connectors. It ran through
the real executor, and the routed lines were drawn over a render to confirm that nothing overlaps or crosses a box.
