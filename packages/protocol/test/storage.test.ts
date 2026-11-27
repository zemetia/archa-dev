import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  appendJsonl, archaHome, assetDirFor, dataDirFor, docPaths, hostToolPaths, isRuntimeDataDir, legacyAssetDirFor, listDir,
  paths, readJson, readJsonl, runtimeFile, safeSegment, socketPath, writeJsonAtomic,
} from '../src/node';

/* Storage module: every ArchaDev path and the shared file primitives (blueprint STRUCTURE/03). */

let home: string;
let work: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-storage-'));
  work = mkdtempSync(join(tmpdir(), 'archa-storage-work-'));
  process.env.ARCHA_HOME = home;
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe('paths', () => {
  it('puts global files under ARCHA_HOME, unchanged from before the storage module', () => {
    expect(archaHome()).toBe(home);
    expect(runtimeFile()).toBe(join(home, 'runtime', 'core.json'));
    expect(paths.runtimeInfo()).toBe(runtimeFile());
    expect(socketPath()).toBe(paths.socket());
    expect(paths.libraries()).toBe(join(home, 'libraries'));
    expect(paths.customIcons()).toBe(join(home, 'icons', 'custom.json'));
    expect(paths.globalMemory()).toBe(join(home, 'memory'));
    expect(paths.skills()).toBe(join(home, 'skills'));
    expect(paths.skillsState()).toBe(join(home, 'skills.json'));
    expect(paths.mcpServers()).toBe(join(home, 'mcp.json'));
    expect(paths.chatSessions()).toBe(join(home, 'chats', 'sessions.json'));
    expect(paths.accounts()).toBe(join(home, 'profiles', 'accounts.json'));
    expect(paths.profile('agy', 'a1')).toBe(join(home, 'profiles', 'agy', 'a1'));
    expect(paths.thread('t/1')).toBe(join(home, 'runtime', 'threads', 't_1'));
    expect(paths.screenshots()).toBe(join(home, 'runtime', 'screenshots'));
  });

  it('names a saved document\'s data folder after its file', () => {
    const file = join(work, 'landing.archa');
    expect(dataDirFor(file, 'd1')).toBe(join(work, 'landing-data'));
    expect(assetDirFor(file, 'd1')).toBe(join(work, 'landing-data', 'assets'));
    expect(legacyAssetDirFor(file, 'd1')).toBe(join(work, 'landing-asset'));
    expect(isRuntimeDataDir(dataDirFor(file, 'd1'))).toBe(false);
  });

  it('keeps an unsaved document\'s data folder under runtime/data, by a safe id', () => {
    expect(dataDirFor(null, 'd:1')).toBe(join(home, 'runtime', 'data', 'd_1'));
    expect(dataDirFor(null, '')).toBe(join(home, 'runtime', 'data', 'doc'));
    expect(legacyAssetDirFor(null, 'd1')).toBe(join(home, 'runtime', 'assets', 'd1'));
    expect(isRuntimeDataDir(dataDirFor(null, 'd1'))).toBe(true);
  });

  it('lays out a data folder', () => {
    const d = docPaths(join(work, 'x-data'));
    expect(d.assets()).toBe(join(work, 'x-data', 'assets'));
    expect(d.chatThread('t 1')).toBe(join(work, 'x-data', 'chats', 't_1.json'));
    expect(d.attachments('t1')).toBe(join(work, 'x-data', 'chats', 'attachments', 't1'));
    expect(d.attachmentsRef('t1')).toBe('chats/attachments/t1');
    expect(d.skills()).toBe(join(work, 'x-data', 'skills'));
    expect(d.memory()).toBe(join(work, 'x-data', 'memory'));
  });

  it('keeps other tools\' folders under the real home, not ARCHA_HOME', () => {
    expect(hostToolPaths.claude()).toBe(join(homedir(), '.claude'));
    expect(hostToolPaths.cursorMcp()).toBe(join(homedir(), '.cursor', 'mcp.json'));
    expect(safeSegment('a/b:c', 'x', 3)).toBe('a_b');
  });
});

describe('file primitives', () => {
  const schema = z.object({ n: z.number() });

  it('reads JSON through the schema, with the fallback for a missing file', () => {
    const f = join(work, 'a.json');
    expect(readJson(f, schema, { n: 0 })).toEqual({ n: 0 });
    writeFileSync(f, '{"n":5}');
    expect(readJson(f, schema, { n: 0 })).toEqual({ n: 5 });
  });

  it('falls back on a corrupt file or a schema mismatch and leaves the file alone', () => {
    const f = join(work, 'a.json');
    writeFileSync(f, '{"n":');
    expect(readJson(f, schema, null)).toBeNull();
    writeFileSync(f, '{"n":"five"}');
    expect(readJson(f, schema, null)).toBeNull();
    expect(readFileSync(f, 'utf8')).toBe('{"n":"five"}');
  });

  it('quarantines a corrupt file when asked, so it is never overwritten', () => {
    const f = join(work, 'a.json');
    writeFileSync(f, 'not json');
    expect(readJson(f, schema, { n: 1 }, { quarantine: true })).toEqual({ n: 1 });
    expect(existsSync(f)).toBe(false);
    const kept = readdirSync(work).filter((n) => n.startsWith('a.json.broken-'));
    expect(kept).toHaveLength(1);
    expect(readFileSync(join(work, kept[0]!), 'utf8')).toBe('not json');
  });

  it('writes JSON atomically: folder created, no temp file left, old content replaced', () => {
    const f = join(work, 'deep', 'dir', 'b.json');
    writeJsonAtomic(f, { n: 1 });
    writeJsonAtomic(f, { n: 2 }, { newline: true });
    expect(readFileSync(f, 'utf8')).toBe('{\n  "n": 2\n}\n');
    expect(readdirSync(join(work, 'deep', 'dir'))).toEqual(['b.json']);
    writeJsonAtomic(f, { n: 3 }, { indent: 0 });
    expect(readFileSync(f, 'utf8')).toBe('{"n":3}');
  });

  it('appends and reads JSONL, skipping torn lines', () => {
    const f = join(work, 'log', 'c.jsonl');
    appendJsonl(f, { a: 1 });
    writeFileSync(f, `${readFileSync(f, 'utf8')}{"a":\n`);
    appendJsonl(f, { a: 2 });
    expect(readJsonl(f)).toEqual([{ a: 1 }, { a: 2 }]);
    expect(readJsonl(join(work, 'missing.jsonl'))).toEqual([]);
  });

  it('lists a folder, empty when it does not exist', () => {
    expect(listDir(join(work, 'nope'))).toEqual([]);
    mkdirSync(join(work, 'l'));
    writeFileSync(join(work, 'l', 'a.json'), '');
    writeFileSync(join(work, 'l', 'b.md'), '');
    expect(listDir(join(work, 'l'), (n) => n.endsWith('.json'))).toEqual(['a.json']);
  });
});
