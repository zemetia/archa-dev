import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHost, nodeMcpCommand } from '../src';
import { CLI } from './helpers';

/* Headless use (blueprint ARCHITECTURE/02 "In-process"): a client of the host in the same process. */

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'archa-inproc-')); process.env.ARCHA_HOME = home; });
afterEach(() => { delete process.env.ARCHA_HOME; rmSync(home, { recursive: true, force: true }); });

describe('in-process client', () => {
  it('calls the host over the channel pair and gets its events', async () => {
    const core = createHost({ cliPath: CLI, mcpCommand: nodeMcpCommand(CLI) });
    const client = core.connect({ kind: 'mcp', name: 'test' });
    const changed: number[] = [];
    client.on('workspace.changed', (docs) => changed.push(docs.length));
    const { docId } = await client.call('doc.new', { name: 'Inproc' });
    const r = await client.call('agent.execute', { docId, code: "insert(null, { type: 'frame', name: 'Box', width: 10, height: 10 })" });
    expect(r.ok).toBe(true);
    expect(await client.call('agent.state', { docId })).toContain('Box');
    await expect(client.call('doc.close', {} as never)).rejects.toThrow(/docId/);
    expect(changed.at(-1)).toBe(2);
    await core.close();
  });
});
