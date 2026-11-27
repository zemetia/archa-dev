import { describe, expect, it } from 'vitest';
import { geminiSchemaIssues, sanitizeGeminiSchema } from '../src/gemini-schema';

/** The exact tool that broke delegated agy runs: `questions` is an array with no `items`. */
const updateDrill = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'ID drill yang ingin di-edit' },
    title: { type: 'string' },
    questions: { type: 'array', description: 'Daftar pertanyaan baru yang diperbarui (opsional)' },
    timeLimitSeconds: { type: 'number' },
  },
  required: ['id'],
};

/** Every keyword Gemini refused anywhere in the given schema tree. */
function offending(s: unknown, path = ''): string[] {
  if (!s || typeof s !== 'object') return [];
  const o = s as Record<string, unknown>;
  const bad = ['$schema', '$ref', '$defs', 'additionalProperties', 'propertyNames', 'const', 'exclusiveMinimum', 'oneOf', 'allOf'].filter((k) => k in o).map((k) => `${path}${k}`);
  if (o.type === 'array' && !(o.items as { type?: unknown } | undefined)?.type) bad.push(`${path}items`);
  if (Array.isArray(o.type)) bad.push(`${path}type[]`);
  return [...bad, ...Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? offending(v, `${path}${k}.`) : []))];
}

describe('Gemini tool schemas', () => {
  it('names the failing path the way Gemini does', () => {
    expect(geminiSchemaIssues(updateDrill)).toEqual([{ path: 'properties[questions].items', problem: 'array without items' }]);
  });

  it('gives an array without items a valid items schema and keeps the rest', () => {
    const s = sanitizeGeminiSchema(updateDrill);
    expect(s.properties).toMatchObject({
      questions: { type: 'array', description: 'Daftar pertanyaan baru yang diperbarui (opsional)', items: { type: 'string' } },
      id: { type: 'string', description: 'ID drill yang ingin di-edit' },
    });
    expect(s.required).toEqual(['id']);
    expect(geminiSchemaIssues(s)).toEqual([]);
    expect(updateDrill.properties.questions).not.toHaveProperty('items'); // input untouched
  });

  it('fixes empty and untyped items, nested deep', () => {
    const s = sanitizeGeminiSchema({ type: 'object', properties: { pages: { type: 'array', items: { type: 'object', properties: { tags: { type: 'array', items: {} } } } } } });
    expect(geminiSchemaIssues({ type: 'object', properties: { tags: { type: 'array', items: {} } } })).toEqual([{ path: 'properties[tags].items', problem: 'array items have no type' }]);
    const pages = (s.properties as { pages: { items: { properties: { tags: { items: unknown } } } } }).pages;
    expect(pages.items.properties.tags.items).toEqual({ type: 'string' });
  });

  it('strips what zod / MCP SDK emit and Gemini refuses', () => {
    // Shape of our own `browser` and `place_image` tools as the MCP SDK lists them.
    const zod = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        params: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: {} },
        width: { type: 'number', exclusiveMinimum: 0 },
        mode: { const: 'auto' },
        kind: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        note: { anyOf: [{ type: 'string', description: 'inner' }, { type: 'null' }], description: 'outer' },
        tags: { type: ['array', 'null'], items: { type: 'string', format: 'uri' } },
        email: { type: 'string', format: 'email', pattern: '^(?!\\.)[a-z]+@x$' },
        level: { type: 'integer', enum: [1, 2, 3] },
      },
      required: ['width', 'ghost'],
    };
    const s = sanitizeGeminiSchema(zod);
    expect(offending(s)).toEqual([]);
    const p = s.properties as Record<string, Record<string, unknown>>;
    expect(s).not.toHaveProperty('$schema');
    expect(p.params).toEqual({ type: 'object' });
    expect(p.width).toEqual({ type: 'number', minimum: 0 });
    expect(p.mode).toEqual({ type: 'string', enum: ['auto'] });
    expect(p.kind).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] });
    expect(p.note).toEqual({ type: 'string', description: 'outer', nullable: true });
    expect(p.tags).toEqual({ type: 'array', nullable: true, items: { type: 'string' } });
    expect(p.email).toEqual({ type: 'string' });
    expect(p.level).toEqual({ type: 'integer' });
    expect(s.required).toEqual(['width']);
    expect(geminiSchemaIssues(zod).map((i) => i.path)).toEqual(['properties[email].pattern']);
  });

  it('turns a missing root into an empty object schema', () => {
    expect(sanitizeGeminiSchema(undefined)).toEqual({ type: 'object' });
    expect(sanitizeGeminiSchema({ properties: { a: { type: 'string' } } })).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
  });
});
