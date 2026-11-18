# Best Practice — 04: Anti-patterns and Performance

← [BEST_PRACTICE.md](../BEST_PRACTICE.md) | [Blueprint INDEX](../INDEX.md)

---

## Anti-patterns

| ❌ Don't | ✅ Do | Why |
|---|---|---|
| Write a document file from the renderer or a plugin | Send ops to the core host | Single writer → [ARCHITECTURE/04](../ARCHITECTURE/04-single-writer-sync.md) |
| Copy document data into a Zustand store | `useDoc(selector)` over the view model | Two sources of truth drift |
| `spawn('claude ' + prompt, { shell: true })` | `spawn(bin, [...args, prompt], { shell: false })` or stdin | Injection |
| Import `electron` in `packages/*` | Inject an interface from `apps/desktop` | Breaks CLI/headless |
| Cache keyed by node id | Key by `selfHash` / `subtreeHash` | Stale renders |
| Store derived data (hashes, layout) in `.archa` | Recompute; cache | Files stay small and diffable |
| Resolve variables in render code | Core resolves; render draws literals | One resolution path |
| Hand-format an MCP reply | `reply/success.ts`, `reply/error.ts` builders | Contract consistency |
| Hand-edit `skills/archadev/references/api.md` | Edit schema `.describe()` → `pnpm gen:api-docs` | Docs drift from runtime |
| Add a property without zod schema | Schema first | Validation gaps |
| Raw colour in app UI (`#fff`, `bg-gray-100`) | Token utility (`bg-surface`) | Theme breaks |
| `setState` in `useEffect` to mirror external state | `useSyncExternalStore` | Extra renders, tearing |
| Copy pen.dev docs/styles | Write our own | Licence |
| Silent catch | Log with context and surface | Hidden failures |
| One giant blueprint file | Split at 150 lines | Agents read whole files |

---

## Hot-Path Rules

| Path | Rule |
|---|---|
| Pointer move / drag | No React state updates; draw on the overlay canvas; ops only on pointer-up (coalesced) |
| Op apply | O(changed nodes × depth); never walk the whole document |
| Render frame | No allocation of CanvasKit objects per frame; reuse paints/paths |
| Layers panel | Virtualised; derived rows memoised by `subtreeHash` |
| IPC | Batch events per animation frame; transfer bitmaps, don't clone |
| Hashing | Incremental only; full rehash only on load |
| Text | Shape once per (font, size, text, width) → L2 cache |
| Images | Decode at needed mip level only |
| Agent replies | Screenshot dedup by hash; never send a whole-document dump |

---

## Measuring

- Dev overlay (Ctrl+Alt+P): fps, frame time histogram, tile queue, cache hit rates, IPC/s.
- `ARCHA_LOG=debug` adds timings for transactions, layout, save.
- Any perf PR includes a benchmark number before/after.
