import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ADAPTERS } from '../src/core-host/agent-adapters';
import { agyErrorHint, badAgyTools } from '../src/core-host/agy-tool-schemas';

// A fake home holding agy's MCP schema copies, as agy writes them (<home>/.gemini/antigravity-cli/mcp/<server>/<tool>.json).
const home = mkdtempSync(join(tmpdir(), 'archa-agy-'));
const dir = join(home, '.gemini', 'antigravity-cli', 'mcp');
const tool = (server: string, name: string, parameters: unknown) => {
  mkdirSync(join(dir, server), { recursive: true });
  writeFileSync(join(dir, server, `${name}.json`), JSON.stringify({ name, description: '…', parameters }));
};
tool('english-drill', 'update_drill', {
  type: 'object',
  properties: { id: { type: 'string' }, questions: { type: 'array', description: 'Daftar pertanyaan baru yang diperbarui (opsional)' } },
  required: ['id'],
});
tool('english-drill', 'send_drill', { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' } } } } } });
tool('crm', 'create_client', { type: 'object', properties: { email: { type: 'string', pattern: '^(?!\\.)[a-z.]+@x\\.com$' } } });
tool('archadev', 'execute', { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { code: { type: 'string' } } });
writeFileSync(join(dir, 'english-drill', 'GUIDE.md'), '# not a schema');
afterAll(() => rmSync(home, { recursive: true, force: true }));

const failure = 'INVALID_ARGUMENT (code 400): * GenerateContentRequest.tools[0].function_declarations[45].parameters.properties[questions].items: missing field.';

describe('agy: tool schemas Gemini refuses', () => {
  it('finds the bad tools agy loaded and leaves good ones (and ours) alone', () => {
    expect(badAgyTools(dir)).toEqual([
      { server: 'crm', tool: 'create_client', path: 'properties[email].pattern', problem: 'regex uses lookaround or backreferences (not RE2)' },
      { server: 'english-drill', tool: 'update_drill', path: 'properties[questions].items', problem: 'array without items' },
    ]);
    expect(badAgyTools(join(home, 'missing'))).toEqual([]);
  });

  it('names the server and tool behind the opaque 400', () => {
    const hint = agyErrorHint(failure, dir);
    expect(hint).toContain('"english-drill" → update_drill (properties[questions].items: array without items)');
    expect(hint).toContain('`agy mcp disable english-drill`');
    expect(hint).not.toContain('crm');
  });

  it('explains agy\'s own "invalid parameter schema" refusal too', () => {
    const err = 'agent executor error: building toolbox: tool "mcp_crm_create_client" advertises an invalid parameter schema: … is not valid regex';
    expect(agyErrorHint(err, dir)).toContain('`agy mcp disable crm`');
  });

  it('falls back to a general hint, and says nothing for other errors', () => {
    expect(agyErrorHint(failure, join(home, 'missing'))).toContain('agy mcp list');
    expect(agyErrorHint('No capacity', dir)).toBe('');
  });

  it('the agy stream parser appends the hint to the failed run', () => {
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const p = ADAPTERS.find((a) => a.id === 'agy')!.parser();
      const ev = p.line(JSON.stringify({ event: 'result', result: { status: 'ERROR', error: failure } }));
      expect(ev[0]).toMatchObject({ kind: 'error' });
      expect((ev[0] as { text: string }).text).toMatch(/^INVALID_ARGUMENT[\s\S]*Caused by "english-drill" → update_drill/);
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
});
