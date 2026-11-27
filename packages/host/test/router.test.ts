import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MethodName } from '@archa/protocol';
import { createRouter } from '../src';
import { newHost } from './helpers';

/*
 * Router coverage (blueprint ARCHITECTURE/02): every RPC method in CoreMethods has exactly one
 * handler. The list is a Record over MethodName, so typecheck fails when a method is added or
 * removed in the protocol without updating it.
 */
const ALL: Record<MethodName, true> = {
  'workspace.list': true, 'workspace.restore': true, 'project.files': true, 'doc.new': true, 'doc.open': true, 'doc.save': true,
  'doc.close': true, 'doc.rename': true,
  'doc.snapshot': true, 'doc.apply': true, 'doc.undo': true, 'doc.redo': true, 'selection.set': true,
  'render.respond': true, 'agents.list': true, 'activity.list': true, 'agent.state': true, 'agent.execute': true,
  'agent.screenshot': true, 'agent.exportSvg': true, 'agent.reference': true, 'agent.compare': true,
  'agent.outline': true, 'agent.say': true, 'agent.readSkill': true, 'agent.done': true, 'agent.browser': true,
  'agent.placeImage': true, 'orchestra.delegate': true, 'orchestra.wait': true, 'orchestra.tell': true,
  'app.info': true, 'settings.get': true, 'settings.set': true, 'export.save': true, 'export.page': true, 'export.code': true, 'chat.send': true,
  'chat.warm': true, 'chat.stop': true, 'chat.queued': true, 'chat.sendQueued': true, 'chat.unqueue': true,
  'chat.runs': true, 'chat.list': true, 'chat.deleteThread': true, 'agents.models': true, 'library.list': true,
  'library.publish': true, 'library.remove': true, 'library.insert': true, 'icons.custom.list': true,
  'icons.custom.add': true, 'icons.custom.remove': true, 'accounts.overview': true, 'accounts.create': true,
  'accounts.update': true, 'accounts.delete': true, 'accounts.captureHost': true, 'accounts.useOnHost': true,
  'accounts.login.start': true, 'accounts.login.code': true, 'accounts.login.cancel': true, 'memory.list': true,
  'memory.remember': true, 'memory.forget': true, 'skills.list': true, 'skills.create': true, 'skills.import': true,
  'skills.update': true, 'skills.delete': true, 'skills.read': true, 'mcp.list': true, 'mcp.save': true,
  'mcp.delete': true, 'mcp.test': true, 'mcp.importCandidates': true, 'mcp.import': true,
};

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'archa-router-')); process.env.ARCHA_HOME = home; });
afterEach(() => { delete process.env.ARCHA_HOME; rmSync(home, { recursive: true, force: true }); });

describe('host router', () => {
  it('has exactly one handler for every CoreMethods method', () => {
    const host = newHost();
    expect(Object.keys(host.router.routes).sort()).toEqual(Object.keys(ALL).sort());
  });

  it('refuses two modules that define the same method', () => {
    expect(() => createRouter([['a', { 'agents.list': () => [] }], ['b', { 'agents.list': () => [] }]])).toThrow(/agents.list is defined by both a and b/);
  });

  it('checks params against the RPC registry before the handler runs', () => {
    let ran = false;
    const router = createRouter([['docs', { 'doc.close': () => { ran = true; } }]]);
    const conn = {} as never;
    expect(() => router.call('doc.close', { docId: 42 }, conn)).toThrow(/docId/);
    expect(ran).toBe(false);
    router.call('doc.close', { docId: 'd1' }, conn);
    expect(ran).toBe(true);
    expect(() => router.call('nope.nothing', {}, conn)).toThrow(/Unknown method/);
  });

  it('rejects bad params on the handlers that used to destructure them unchecked', () => {
    const host = newHost();
    const conn = host.attach({ send: () => {}, onMessage: () => {} }, { kind: 'mcp', name: 'probe' });
    expect(() => host.handlers['doc.new']({ name: 7 } as never, conn)).toThrow(/name/);
    expect(() => host.handlers['doc.close']({} as never, conn)).toThrow(/docId/);
    expect(() => host.handlers['selection.set']({ docId: 'x', ids: 'a' } as never, conn)).toThrow(/ids/);
    expect(() => host.handlers['agent.say']({ text: 3 } as never, conn)).toThrow(/text/);
    const docId = host.ctx.summaries()[0]!.id;
    host.handlers['selection.set']({ docId, ids: [] }, conn);
    expect(host.ctx.selection.get(docId)).toEqual([]);
  });
});
