import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager, agyIdentity, claudeIdentity, codexIdentity, profilesDir } from '../src/accounts';

let home: string;
let notified: Array<string | undefined>;
const manager = () => new AccountManager((id) => notified.push(id));

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'archa-accounts-'));
  process.env.ARCHA_HOME = home;
  notified = [];
});
afterEach(() => {
  delete process.env.ARCHA_HOME;
  rmSync(home, { recursive: true, force: true });
});

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

describe('login identity', () => {
  it('reads a Claude config folder without exposing tokens', () => {
    const dir = join(home, 'claude');
    mkdirSync(dir);
    expect(claudeIdentity(dir)).toEqual({ email: '', plan: '', signedIn: false });
    writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { refreshToken: 'r', subscriptionType: 'max' } }));
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'a@b.co' } }));
    expect(claudeIdentity(dir)).toEqual({ email: 'a@b.co', plan: 'max', signedIn: true });
  });

  it('reads Codex ChatGPT and API-key logins', () => {
    const dir = join(home, 'codex');
    mkdirSync(dir);
    writeFileSync(join(dir, 'auth.json'), JSON.stringify({ tokens: { refresh_token: 'r', id_token: jwt({ email: 'c@d.co', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }) } }));
    expect(codexIdentity(dir)).toEqual({ email: 'c@d.co', plan: 'plus', signedIn: true });
    writeFileSync(join(dir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-x' }));
    expect(codexIdentity(dir)).toEqual({ email: '', plan: 'API key', signedIn: true });
  });

  it('reads an agy keyring blob', () => {
    expect(agyIdentity(Buffer.from(JSON.stringify({ id_token_email: 'g@x.co', token: { refresh_token: 'r' } })))).toMatchObject({ email: 'g@x.co', signedIn: true });
    expect(agyIdentity(Buffer.from('not json')).signedIn).toBe(false);
    expect(agyIdentity(null).signedIn).toBe(false);
  });
});

describe('AccountManager', () => {
  it('creates managed profiles under ARCHA_HOME and persists them', () => {
    const m = manager();
    const a = m.create({ agent: 'claude' });
    expect(a.managed).toBe(true);
    expect(a.name).toBe('Claude Code account');
    expect(a.dir.startsWith(profilesDir())).toBe(true);
    expect(existsSync(a.dir)).toBe(true);
    expect(notified).toContain(a.id);
    expect(JSON.parse(readFileSync(join(profilesDir(), 'accounts.json'), 'utf8')).accounts).toHaveLength(1);
  });

  it('stores a Codex API key in the profile auth.json', () => {
    const a = manager().create({ agent: 'codex', name: 'API', apiKey: 'sk-test' });
    expect(a).toMatchObject({ signedIn: true, plan: 'API key' });
  });

  it('validates params at the boundary', () => {
    const m = manager();
    expect(() => m.create({ agent: 'hermes', name: 'x' })).toThrow();
    expect(() => m.create({ agent: 'agy', name: 'x' })).toThrow(/Save current agy login/);
    expect(() => m.create({ agent: 'claude', name: 'x', apiKey: 'k' })).toThrow(/Codex/);
  });

  it('keeps one default per agent and points runs at it', () => {
    const m = manager();
    const a = m.create({ agent: 'codex', name: 'A', apiKey: 'k1' });
    const b = m.create({ agent: 'codex', name: 'B', apiKey: 'k2' });
    expect(m.runEnv('codex')).toEqual({ env: {}, label: null });
    m.update({ id: a.id, isDefault: true });
    m.update({ id: b.id, isDefault: true });
    expect(m.dto({ ...a, managed: true, enabled: true } as never).isDefault).toBe(false);
    expect(m.runEnv('codex')).toEqual({ env: { CODEX_HOME: b.dir }, label: 'B' });
    expect(m.runEnv('codex', 'host')).toEqual({ env: {}, label: null });
    expect(m.runEnv('codex', a.id).env.CODEX_HOME).toBe(a.dir);
  });

  it('names an account after the login it signed in with', () => {
    const m = manager();
    const a = m.create({ agent: 'claude' });
    writeFileSync(join(a.dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { refreshToken: 'r', subscriptionType: 'pro' } }));
    writeFileSync(join(a.dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'me@co.com' } }));
    expect(m.dto({ ...a, name: '' } as never).name).toBe('me@co.com');
    expect(m.runEnv('claude', a.id).label).toBe('me@co.com');
    expect(manager().create({ agent: 'codex', apiKey: 'k' }).name).toBe('OpenAI API key');
  });

  it('refuses runs under a signed-out or disabled account', () => {
    const m = manager();
    const a = m.create({ agent: 'claude', name: 'new@co.com' });
    expect(() => m.runEnv('claude', a.id)).toThrow(/not signed in/);
    m.update({ id: a.id, enabled: false });
    expect(() => m.runEnv('claude', a.id)).toThrow(/disabled/);
  });

  it('deletes a managed folder but leaves a linked one', () => {
    const m = manager();
    const linked = join(home, 'existing-claude');
    mkdirSync(linked);
    // Linked folders can no longer be added, but ones saved by older versions still load and must survive removal.
    mkdirSync(profilesDir(), { recursive: true });
    writeFileSync(join(profilesDir(), 'accounts.json'), JSON.stringify({ accounts: [{ id: 'old', agent: 'claude', name: 'linked', dir: linked, managed: false, enabled: true, createdAt: 1 }], defaults: {} }));
    const m2 = manager();
    const a = m2.create({ agent: 'claude' });
    m2.update({ id: a.id, isDefault: true });
    m2.delete({ id: a.id });
    m2.delete({ id: 'old' });
    expect(existsSync(a.dir)).toBe(false);
    expect(existsSync(linked)).toBe(true);
    expect(m2.runEnv('claude')).toEqual({ env: {}, label: null });
    expect(m.runEnv('claude')).toEqual({ env: {}, label: null });
  });
});
