/*
 * Gemini function declarations take an OpenAPI 3.0 subset of JSON Schema, not full JSON Schema.
 * A tool whose parameters step outside it makes the WHOLE request fail ("INVALID_ARGUMENT (code 400):
 * GenerateContentRequest.tools[0].function_declarations[45].parameters.properties[questions].items:
 * missing field"), so one bad tool on any MCP server breaks every turn. Blueprint AGENT_BRIDGE/02.
 *
 * `sanitizeGeminiSchema` rewrites a schema into that subset; `geminiSchemaIssues` names the parts
 * Gemini rejects, with paths spelled the way Gemini's error spells them (`properties[questions].items`).
 */

export type JsonSchema = Record<string, unknown>;
export type GeminiSchemaIssue = { path: string; problem: string };

/** Keywords outside the subset; the useful ones are rewritten first (const → enum, oneOf → anyOf, …). */
const DROPPED = new Set([
  '$schema', '$id', '$ref', '$defs', '$comment', 'definitions', 'additionalProperties', 'patternProperties', 'propertyNames',
  'unevaluatedProperties', 'unevaluatedItems', 'dependentRequired', 'dependentSchemas', 'dependencies', 'if', 'then', 'else', 'not',
  'examples', 'contentEncoding', 'contentMediaType', 'readOnly', 'writeOnly', 'deprecated', 'multipleOf', 'uniqueItems',
  'prefixItems', 'additionalItems', 'contains', 'minContains', 'maxContains', 'const', 'exclusiveMinimum', 'exclusiveMaximum', 'oneOf', 'allOf',
]);
const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);
/** `format` values Gemini accepts per type; anything else ("uri", "email", …) is refused. */
const FORMATS: Record<string, string[]> = { string: ['enum', 'date-time'], number: ['float', 'double'], integer: ['int32', 'int64'] };
/** Gemini compiles `pattern` with RE2: no lookaround, no backreferences. */
const NOT_RE2 = /\(\?<?[=!]|\\[1-9]/;
/** What an array with no usable `items` gets: the loosest shape Gemini accepts. */
const FALLBACK_ITEMS: JsonSchema = { type: 'string' };

const isObj = (v: unknown): v is JsonSchema => !!v && typeof v === 'object' && !Array.isArray(v);

/** Returns a new schema inside Gemini's subset (the input is not changed). Issues found are pushed to `issues`. */
export function sanitizeGeminiSchema(schema: unknown, issues: GeminiSchemaIssue[] = []): JsonSchema {
  const src = isObj(schema) ? schema : {};
  // Parameters are always an object; an untyped root is one (not the 'string' fallback below).
  return clean(src.type || src.anyOf || src.oneOf || src.allOf ? src : { type: 'object', ...src }, '', issues);
}

/** The parts of a tool's parameter schema that Gemini rejects; empty = safe to send as is. */
export function geminiSchemaIssues(schema: unknown): GeminiSchemaIssue[] {
  const issues: GeminiSchemaIssue[] = [];
  sanitizeGeminiSchema(schema, issues);
  return issues;
}

function clean(src: JsonSchema, path: string, issues: GeminiSchemaIssue[]): JsonSchema {
  const at = (key: string) => (path ? `${path}.${key}` : key);
  const flag = (key: string, problem: string) => issues.push({ path: at(key), problem });
  let s: JsonSchema = { ...src };

  // allOf with one member (what zod and many generators emit for a described $ref) is that member.
  if (Array.isArray(s.allOf) && s.allOf.length === 1 && isObj(s.allOf[0])) {
    const { allOf: _, ...rest } = s;
    s = { ...(s.allOf[0] as JsonSchema), ...rest };
  }
  if (typeof s.$ref === 'string' && !s.type) flag('$ref', 'unresolved $ref (Gemini has no references)');
  if ('const' in s && !('enum' in s)) s.enum = [s.const];
  if (typeof s.exclusiveMinimum === 'number' && typeof s.minimum !== 'number') s.minimum = s.exclusiveMinimum;
  if (typeof s.exclusiveMaximum === 'number' && typeof s.maximum !== 'number') s.maximum = s.exclusiveMaximum;
  if (Array.isArray(s.oneOf) && !s.anyOf) s.anyOf = s.oneOf;

  // type: ["string", "null"] → type: "string", nullable: true.
  if (Array.isArray(s.type)) {
    const types = (s.type as unknown[]).filter((t): t is string => typeof t === 'string');
    if (types.includes('null')) s.nullable = true;
    const real = types.filter((t) => t !== 'null');
    if (real.length > 1) flag('type', `several types (${real.join(', ')})`);
    s.type = real[0];
  }
  if (s.type === 'null') { s.nullable = true; delete s.type; }
  if (s.type !== undefined && !TYPES.has(s.type as string)) { flag('type', `unknown type "${String(s.type)}"`); delete s.type; }

  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(s)) if (!DROPPED.has(k)) out[k] = v;

  if (Array.isArray(out.anyOf)) {
    const all = (out.anyOf as unknown[]).filter(isObj);
    const members = all.filter((m) => m.type !== 'null');
    if (members.length < all.length) out.nullable = true;
    delete out.anyOf;
    if (members.length > 1) out.anyOf = members.map((m, i) => clean(m, at(`anyOf[${i}]`), issues));
    else if (members[0]) {
      // anyOf with one real member (a nullable wrapper) is that member; the outer description wins.
      const { description, ...member } = clean(members[0], path, issues);
      Object.assign(out, member, out.description || description === undefined ? {} : { description });
    }
  }

  if (!out.type && !out.anyOf) out.type = isObj(out.properties) ? 'object' : 'items' in out ? 'array' : Array.isArray(out.enum) ? 'string' : undefined;
  if (!out.type && !out.anyOf) { flag('type', 'no type'); out.type = 'string'; }

  if (out.type === 'array') {
    const items = Array.isArray(out.items) ? out.items[0] : out.items;
    if (!isObj(items) || (!items.type && !items.anyOf && !items.allOf && !items.oneOf && !items.properties && !items.items && !items.enum && !('const' in items))) {
      flag('items', isObj(items) ? 'array items have no type' : 'array without items');
      out.items = { ...FALLBACK_ITEMS };
    } else out.items = clean(items, at('items'), issues);
  } else delete out.items;

  if (out.type === 'object' && isObj(out.properties)) {
    const props: JsonSchema = {};
    for (const [name, p] of Object.entries(out.properties)) props[name] = clean(isObj(p) ? p : {}, at(`properties[${name}]`), issues);
    out.properties = props;
    if (Array.isArray(out.required)) {
      const req = (out.required as unknown[]).filter((r): r is string => typeof r === 'string' && r in props);
      if (req.length) out.required = req; else delete out.required;
    }
  } else if (out.type !== 'object') { delete out.properties; delete out.required; }

  if (Array.isArray(out.enum) && !(out.enum as unknown[]).every((e) => typeof e === 'string')) {
    // Gemini enums are string-only; a numeric enum keeps its type and loses the list.
    const strings = (out.enum as unknown[]).filter((e) => e !== null).map(String);
    if (out.type === 'string') out.enum = strings; else delete out.enum;
  }
  if (typeof out.format === 'string' && !(FORMATS[out.type as string] ?? []).includes(out.format)) delete out.format;
  if (typeof out.pattern === 'string' && NOT_RE2.test(out.pattern)) { flag('pattern', 'regex uses lookaround or backreferences (not RE2)'); delete out.pattern; }
  if (out.pattern !== undefined && out.type !== 'string') delete out.pattern;
  if (out.default === null) delete out.default;
  return out;
}
