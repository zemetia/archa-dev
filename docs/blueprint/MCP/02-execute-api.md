# MCP — 02: `execute` API

← [MCP.md](../MCP.md) | [Blueprint INDEX](../INDEX.md) | [03 — Response contract →](./03-response-contract-lint.md)

**Phase:** 5. Code: `packages/mcp/src/execute/`.

---

## Sandbox

| Aspect | Value |
|---|---|
| Engine | QuickJS (`quickjs-emscripten`), one context per client session |
| Access | Only the injected API below. No fs, network, timers beyond `await` of API promises |
| Limits | 5 s CPU, 64 MB memory, 2 MB snippet, 10k ops per call (defaults; per-project setting) |
| Persistence | Top-level assignments to globals persist across calls in the session |
| Transaction | The whole snippet = one transaction. Any thrown error → full rollback **including globals** |

---

## API Surface

```ts
// Mutations
insert(parent: NodeRef, node: NodeInput, index?: number): NodeId
copy(id: NodeRef, parent?: NodeRef): NodeId
update(id: NodeRef, patch: Partial<Props>): void
replace(id: NodeRef, node: NodeInput): NodeId
move(id: NodeRef, parent: NodeRef, index?: number): void
remove(id: NodeRef): void
setVariables(upserts: VariableInput[], removes?: string[]): void
createComponent(id: NodeRef): ComponentId
instance(componentId: ComponentId, parent: NodeRef, overrides?: Overrides): NodeId
generate(kind: 'image' | 'svg' | 'remove-bg' | 'trace', parent: NodeRef, prompt: GenerateInput): NodeId  // async, via plugins

// Reads
get(id: NodeRef, opts?: { depth?: number }): NodeView          // includes resolved bounds, clipped flag
find(visitor: (n: NodeView) => boolean | 'skip', opts: { under: NodeRef; limit?: number }): NodeView[]
getVariables(filter?: string): VariableView[]
findEmptySpace(opts: { width: number; height: number; near?: NodeRef }): { x: number; y: number }
print(...values: unknown[]): void

// Output
screenshot(id: NodeRef, opts?: { scale?: number }): void         // attached to the reply
exportNode(id: NodeRef, opts: ExportOptions): string             // returns path
```

`NodeRef` = node id string **or** unique node name. `NodeInput` uses the same schema as the document, with `children` allowed inline for building a subtree in one call.

---

## Guard Rails Built into the API

| Guard | Behaviour |
|---|---|
| `find` without `under` on a whole page/document | Rejected: "Pass `under` (a frame id) or use `get_state` for the overview" |
| Setting `id` on insert | Ignored; reply contains an id remap notice |
| Unnamed inserted node | Allowed; lint `naming/missing` (agents are told to name everything) |
| `generate` called again for a pending node | Rejected: "Already generating — keep designing, check later with `get`" |

---

## Patch Retry

On failure the reply includes an `editId`. The agent fixes by sending:

```json
{ "editId": "e_7Qx2", "edits": [{ "find": "padding: 12px", "replace": "padding: { top: 12, right: 12, bottom: 12, left: 12 }" }] }
```

| Case | Behaviour |
|---|---|
| Patched snippet succeeds | Normal success reply |
| Patched snippet fails again | Edits are kept; patch again with the same `editId` against the already-patched text |
| `find` text not found | Error naming the edit index; nothing re-run |
| Unknown / expired `editId` (> 30 min or 20 newer calls) | "Resend the full snippet" |

Saves the agent from regenerating kilobytes of code to fix one typo.
