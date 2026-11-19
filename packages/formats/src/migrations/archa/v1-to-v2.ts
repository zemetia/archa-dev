/** v2 adds document variables and comments (and new node types, which v1 files never contain). */
export function v1ToV2(raw: RawArcha): RawArcha {
  return { ...raw, document: { ...raw.document, variables: [], comments: [] } };
}

export type RawArcha = { manifest: Record<string, unknown>; document: Record<string, unknown>; pages: Record<string, unknown> };
