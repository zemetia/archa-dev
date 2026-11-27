import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { z } from 'zod';
import { DocumentError } from '@archa/core';
import { newId } from '@archa/schema';
import { RPC, type AccountAgent, type AccountsOverview, type AgentAccount, type AgentCli, type HostLogin, type LoginState } from '@archa/protocol';
import { paths, hostToolPaths, anyObject, writeFileAtomic, readJson as readJsonFile } from '@archa/protocol/node';
import { findBin } from './agent-adapters';
import { keyringRead, keyringWrite } from './keyring';

/*
 * Login profiles for the agent CLIs (blueprint AGENT_BRIDGE/02), ported from Gungnir's
 * remediate/profiles.go + server/coding_agent_*.go. Like Orca, each Claude / Codex profile is its
 * own config folder (CLAUDE_CONFIG_DIR / CODEX_HOME); an agy profile is a saved copy of agy's
 * single keyring login. Profiles live in ~/.archadev/profiles — never in a project, never logged.
 */

const CLIS: Array<{ id: AccountAgent; label: string; bin: string }> = [
  { id: 'claude', label: 'Claude Code', bin: 'claude' },
  { id: 'agy', label: 'Antigravity', bin: 'agy' },
  { id: 'codex', label: 'Codex', bin: 'codex' },
];

const AGY_CREDENTIAL = 'agy-credential.json';
const LOGIN_URL = /https:\/\/\S+\/oauth\/authorize\S+/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape sequences on purpose
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const LOGIN_TIMEOUT = 15 * 60_000;

export const profilesDir = paths.profiles;

type Stored = { id: string; agent: AccountAgent; name: string; dir: string; managed: boolean; enabled: boolean; createdAt: number };
type StoreFile = { version: 1; accounts: Stored[]; defaults: Partial<Record<AccountAgent, string>> };
type Identity = { email: string; plan: string; signedIn: boolean };
type LoginSession = { child: ChildProcess; out: string; url: string; needsCode: boolean; done: boolean; cancelled: boolean; error?: string; finished: Promise<void> };

/* ------------------------------ zod boundary ------------------------------ */

/** Param schemas live in the RPC registry (packages/protocol/src/rpc.ts); the manager re-checks for direct callers. */
export const accountParams = {
  create: RPC['accounts.create'].params,
  update: RPC['accounts.update'].params,
  byId: RPC['accounts.delete'].params,
  captureHost: RPC['accounts.captureHost'].params,
  code: RPC['accounts.login.code'].params,
};

export function parse<T>(schema: z.ZodType<T>, params: unknown): T {
  const r = schema.safeParse(params);
  if (!r.success) throw new DocumentError('VALIDATION', `${r.error.issues[0]?.path.join('.') || 'params'}: ${r.error.issues[0]?.message}`);
  return r.data;
}

/* ----------------------------- login identity ----------------------------- */

const readJson = (path: string) => readJsonFile(path, anyObject, null);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// The host login is always the CLI's own default; an inherited CLAUDE_CONFIG_DIR / CODEX_HOME belongs to whoever launched us.
export const claudeHostDir = hostToolPaths.claude;
export const codexHostDir = hostToolPaths.codex;

/** Which account a Claude config folder is signed in to. Tokens are read for presence only. */
export function claudeIdentity(dir: string): Identity {
  const oauth = obj(readJson(join(dir, '.credentials.json'))?.claudeAiOauth);
  const signedIn = !!str(oauth.refreshToken);
  // Without CLAUDE_CONFIG_DIR the account record sits in ~/.claude.json, next to ~/.claude.
  const records = [join(dir, '.claude.json')];
  if (resolve(dir) === resolve(claudeHostDir())) records.unshift(join(dirname(dir), '.claude.json'));
  const email = records.map((p) => str(obj(readJson(p)?.oauthAccount).emailAddress)).find(Boolean) ?? '';
  return { email, plan: signedIn ? str(oauth.subscriptionType) : '', signedIn };
}

/** Codex keeps `auth.json` in CODEX_HOME: ChatGPT tokens (email in the id_token) or an API key. */
export function codexIdentity(dir: string): Identity {
  const auth = readJson(join(dir, 'auth.json'));
  if (!auth) return { email: '', plan: '', signedIn: false };
  const tokens = obj(auth.tokens);
  if (str(tokens.refresh_token)) {
    const claims = jwtClaims(str(tokens.id_token));
    return { email: str(claims.email), plan: str(obj(claims['https://api.openai.com/auth']).chatgpt_plan_type), signedIn: true };
  }
  if (str(auth.OPENAI_API_KEY)) return { email: '', plan: 'API key', signedIn: true };
  return { email: '', plan: '', signedIn: false };
}

export function agyIdentity(blob: Buffer | null): Identity {
  if (!blob) return { email: '', plan: '', signedIn: false };
  try {
    const c = JSON.parse(blob.toString('utf8')) as Record<string, unknown>;
    return { email: str(c.id_token_email), plan: '', signedIn: !!str(obj(c.token).refresh_token) };
  } catch {
    return { email: '', plan: '', signedIn: false };
  }
}

function jwtClaims(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) return {};
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>; } catch { return {}; }
}

function readAgyProfile(dir: string): Buffer | null {
  try { return readFileSync(join(dir, AGY_CREDENTIAL)); } catch { return null; }
}

function writePrivate(path: string, data: string | Buffer) {
  writeFileAtomic(path, data, { mode: 0o600, dirMode: 0o700 });
}

/* ------------------------------ CLI discovery ----------------------------- */

/**
 * An agent binary as `{ bin, pre }`. npm-installed CLIs are `.cmd` shims on Windows, which
 * cannot be spawned without a shell, so those run as `node <package>/bin/<name>.js`.
 */
export function resolveCli(name: string): { bin: string; pre: string[] } | null {
  const exe = findBin(name);
  if (exe) return { bin: exe, pre: [] };
  if (process.platform !== 'win32') return null;
  const pkg = NPM_PACKAGES[name];
  if (!pkg) return null;
  const node = findBin('node');
  for (const dir of (process.env.PATH ?? '').split(';')) {
    if (!existsSync(join(dir, `${name}.cmd`))) continue;
    const binDir = join(dir, 'node_modules', ...pkg.split('/'), 'bin');
    if (existsSync(join(binDir, `${name}.exe`))) return { bin: join(binDir, `${name}.exe`), pre: [] };
    if (node && existsSync(join(binDir, `${name}.js`))) return { bin: node, pre: [join(binDir, `${name}.js`)] };
  }
  return null;
}

/** npm packages whose `.cmd` shim we can bypass. */
const NPM_PACKAGES: Record<string, string> = { codex: '@openai/codex', claude: '@anthropic-ai/claude-code' };

function runQuiet(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((done) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } });
    let out = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout?.setEncoding('utf8').on('data', (c: string) => { out += c; });
    child.on('error', () => { clearTimeout(timer); done(''); });
    child.on('close', () => { clearTimeout(timer); done(out); });
  });
}

function kill(child: ChildProcess) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGTERM');
}

const lastLine = (text: string) => text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? '';

/* --------------------------------- manager -------------------------------- */

export class AccountManager {
  private data: StoreFile;
  private logins = new Map<string, LoginSession>();
  private versions = new Map<string, Promise<string | null>>();
  private agyHost: { at: number; value: Promise<{ blob: Buffer | null; error?: string }> } | null = null;

  constructor(private notify: (accountId?: string) => void) {
    this.data = this.load();
  }

  private get file() { return paths.accounts(); }

  private load(): StoreFile {
    const raw = readJson(this.file) as Partial<StoreFile> | null;
    return { version: 1, accounts: Array.isArray(raw?.accounts) ? raw.accounts : [], defaults: raw?.defaults ?? {} };
  }

  private save() {
    writePrivate(this.file, JSON.stringify(this.data, null, 2));
  }

  private stored(accountId: string): Stored {
    const a = this.data.accounts.find((x) => x.id === accountId);
    if (!a) throw new DocumentError('NOT_FOUND', 'Account not found');
    return a;
  }

  private identity(a: Stored): Identity {
    if (a.agent === 'claude') return claudeIdentity(a.dir);
    if (a.agent === 'codex') return codexIdentity(a.dir);
    return agyIdentity(readAgyProfile(a.dir));
  }

  private loginState(accountId: string): LoginState | null {
    const l = this.logins.get(accountId);
    if (!l) return null;
    return { active: !l.done, url: l.url, output: l.out.replace(ANSI, '').trim().slice(-2000), needsCode: l.needsCode, error: l.error };
  }

  /** What the UI and run status call an account: its login e-mail, else a saved name, else what it is. */
  private displayName(a: Stored, ident = this.identity(a)): string {
    if (ident.email) return ident.email;
    if (a.name) return a.name;
    if (ident.plan === 'API key') return 'OpenAI API key';
    return `${CLIS.find((c) => c.id === a.agent)?.label ?? a.agent} account`;
  }

  dto(a: Stored): AgentAccount {
    const ident = this.identity(a);
    return {
      id: a.id, agent: a.agent, name: this.displayName(a, ident), email: ident.email, plan: ident.plan, signedIn: ident.signedIn,
      enabled: a.enabled, isDefault: this.data.defaults[a.agent] === a.id, managed: a.managed, dir: a.dir, createdAt: a.createdAt,
      login: this.loginState(a.id),
    };
  }

  private version(bin: string, pre: string[]): Promise<string | null> {
    const key = [bin, ...pre].join(' ');
    let v = this.versions.get(key);
    if (!v) {
      v = runQuiet(bin, [...pre, '--version'], 8000).then((out) => lastLine(out.replace(ANSI, '')).slice(0, 80) || null);
      this.versions.set(key, v);
    }
    return v;
  }

  /** The host's agy keyring read costs a PowerShell start on Windows; cache it briefly. */
  private agyHostLogin(fresh = false) {
    if (fresh || !this.agyHost || Date.now() - this.agyHost.at > 10_000) {
      this.agyHost = { at: Date.now(), value: keyringRead().then((blob) => ({ blob }), (e: Error) => ({ blob: null, error: e.message })) };
    }
    return this.agyHost.value;
  }

  private savedId(agent: AccountAgent, email: string): string | null {
    if (!email) return null;
    return this.data.accounts.find((a) => a.agent === agent && this.identity(a).email.toLowerCase() === email.toLowerCase())?.id ?? null;
  }

  private async host(agent: AccountAgent): Promise<HostLogin> {
    let ident: Identity;
    let error: string | undefined;
    if (agent === 'claude') ident = claudeIdentity(claudeHostDir());
    else if (agent === 'codex') ident = codexIdentity(codexHostDir());
    else {
      const r = await this.agyHostLogin();
      ident = agyIdentity(r.blob);
      error = r.error;
    }
    return { ...ident, savedAccountId: this.savedId(agent, ident.email), ...(error ? { error } : {}) };
  }

  async overview(): Promise<AccountsOverview> {
    const clis: AgentCli[] = await Promise.all(CLIS.map(async (c) => {
      const cli = resolveCli(c.bin);
      const [version, host] = await Promise.all([cli ? this.version(cli.bin, cli.pre) : null, this.host(c.id)]);
      return { id: c.id, label: c.label, bin: cli ? cli.pre[0] ?? cli.bin : null, version, host };
    }));
    return { clis, accounts: this.data.accounts.map((a) => this.dto(a)), profilesDir: profilesDir() };
  }

  create(params: unknown): AgentAccount {
    const p = parse(accountParams.create, params);
    if (p.agent === 'agy') throw new DocumentError('VALIDATION', 'agy accounts are saved from this computer\'s agy login — use "Save current agy login"');
    const accountId = newId();
    // ArchaDev always owns the folder; accounts linked to an outside folder by older versions keep working.
    const dir = paths.profile(p.agent, accountId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (p.apiKey) {
      if (p.agent !== 'codex') throw new DocumentError('VALIDATION', 'An API key can only be saved for Codex');
      // The same file `codex login --with-api-key` writes.
      writePrivate(join(dir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: p.apiKey }, null, 2));
    }
    const a: Stored = { id: accountId, agent: p.agent, name: p.name ?? '', dir, managed: true, enabled: true, createdAt: Date.now() };
    this.data.accounts.push(a);
    this.save();
    this.notify(a.id);
    return this.dto(a);
  }

  update(params: unknown): AgentAccount {
    const p = parse(accountParams.update, params);
    const a = this.stored(p.id);
    if (p.name !== undefined) a.name = p.name;
    if (p.enabled !== undefined) a.enabled = p.enabled;
    if (p.isDefault === true) this.data.defaults[a.agent] = a.id;
    if (p.isDefault === false && this.data.defaults[a.agent] === a.id) delete this.data.defaults[a.agent];
    this.save();
    this.notify(a.id);
    return this.dto(a);
  }

  delete(params: unknown) {
    const { id: accountId } = parse(accountParams.byId, params);
    const a = this.stored(accountId);
    this.cancelLogin({ id: accountId });
    this.data.accounts = this.data.accounts.filter((x) => x.id !== accountId);
    if (this.data.defaults[a.agent] === accountId) delete this.data.defaults[a.agent];
    this.save();
    // A folder the person pointed us at stays; one ArchaDev created goes with its login.
    if (a.managed && resolve(a.dir).startsWith(resolve(profilesDir()))) rmSync(a.dir, { recursive: true, force: true });
    this.notify(accountId);
  }

  /* ---------------------------------- agy ---------------------------------- */

  /** Saves this computer's agy login as a profile, or refreshes the saved copy of that account. */
  async captureHost(params: unknown): Promise<AgentAccount> {
    parse(accountParams.captureHost, params);
    const { blob, error } = await this.agyHostLogin(true);
    if (error) throw new Error(`Could not read the agy login: ${error}`);
    const ident = agyIdentity(blob);
    if (!blob || !ident.signedIn) throw new DocumentError('VALIDATION', 'agy is not signed in on this computer — run `agy`, sign in, then save again');
    if (!ident.email) throw new DocumentError('VALIDATION', 'The agy login has no account e-mail');
    let a = this.data.accounts.find((x) => x.agent === 'agy' && agyIdentity(readAgyProfile(x.dir)).email.toLowerCase() === ident.email.toLowerCase());
    if (!a) {
      const accountId = newId();
      a = { id: accountId, agent: 'agy', name: ident.email, dir: paths.profile('agy', accountId), managed: true, enabled: true, createdAt: Date.now() };
      this.data.accounts.push(a);
      this.save();
    }
    writePrivate(join(a.dir, AGY_CREDENTIAL), blob);
    this.notify(a.id);
    return this.dto(a);
  }

  /** Makes a saved agy profile this computer's agy login. The login it replaces is saved first. */
  async useOnHost(params: unknown) {
    const { id: accountId } = parse(accountParams.byId, params);
    const a = this.stored(accountId);
    if (a.agent !== 'agy') throw new DocumentError('VALIDATION', 'Only agy accounts can be switched on this computer');
    const blob = readAgyProfile(a.dir);
    if (!agyIdentity(blob).signedIn || !blob) throw new DocumentError('VALIDATION', 'This agy account has no saved login');
    const current = await this.agyHostLogin(true);
    if (agyIdentity(current.blob).email) await this.captureHost({ agent: 'agy' });
    await keyringWrite(blob);
    this.agyHost = null;
    this.notify(a.id);
  }

  /* --------------------------- sign-in (claude, codex) ---------------------- */

  /**
   * Both CLIs run their own OAuth flow: they open the browser on the provider's sign-in page and
   * finish on their own through a localhost callback. Claude also prints a fallback link whose
   * page shows a code to paste back, for when the browser did not open.
   */
  async startLogin(params: unknown): Promise<LoginState> {
    const { id: accountId } = parse(accountParams.byId, params);
    const a = this.stored(accountId);
    if (a.agent === 'agy') throw new DocumentError('VALIDATION', 'agy signs in inside its own CLI; save the login afterwards');
    const cli = resolveCli(a.agent);
    if (!cli) throw new DocumentError('NOT_FOUND', `${a.agent === 'claude' ? 'Claude Code' : 'Codex'} CLI was not found on PATH`);
    this.cancelLogin({ id: accountId });
    // Codex listens on a fixed local port; only one Codex sign-in can run.
    if (a.agent === 'codex') for (const [other] of this.logins) if (this.data.accounts.find((x) => x.id === other)?.agent === 'codex') this.cancelLogin({ id: other });
    mkdirSync(a.dir, { recursive: true, mode: 0o700 });

    const args = a.agent === 'claude' ? ['auth', 'login'] : ['login'];
    const env = a.agent === 'claude' ? { CLAUDE_CONFIG_DIR: a.dir } : { CODEX_HOME: a.dir };
    const child = spawn(cli.bin, [...cli.pre, ...args], { shell: false, windowsHide: true, env: { ...process.env, ...env, NO_COLOR: '1' } });

    let resolveFinished = () => {};
    const l: LoginSession = { child, out: '', url: '', needsCode: a.agent === 'claude', done: false, cancelled: false, finished: new Promise((r) => { resolveFinished = r; }) };
    this.logins.set(accountId, l);
    this.notify(accountId);
    const timer = setTimeout(() => kill(child), LOGIN_TIMEOUT);
    const onData = (c: string) => {
      if (l.out.length < 64_000) l.out += c;
      if (!l.url) {
        const m = l.out.replace(ANSI, '').match(LOGIN_URL);
        if (m) { l.url = m[0]; this.notify(accountId); }
      }
    };
    child.stdout?.setEncoding('utf8').on('data', onData);
    child.stderr?.setEncoding('utf8').on('data', onData);
    const finish = (error?: string) => {
      if (l.done) return;
      clearTimeout(timer);
      l.done = true;
      if (error && !l.cancelled) l.error = error;
      resolveFinished();
      // A clean finish needs no panel; a failure stays so the person can read it.
      if (!l.error && this.logins.get(accountId) === l) this.logins.delete(accountId);
      this.notify(accountId);
    };
    child.on('error', (e) => finish(e.message));
    child.on('exit', (code) => finish(code === 0 ? undefined : lastLine(l.out.replace(ANSI, '')) || `Sign-in exited with code ${code}`));

    const deadline = Date.now() + 20_000;
    while (!l.url && !l.done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 150));
    return this.loginState(accountId) ?? { active: false, url: l.url, output: '', needsCode: l.needsCode, error: l.error };
  }

  async submitCode(params: unknown): Promise<AgentAccount> {
    const p = parse(accountParams.code, params);
    const a = this.stored(p.id);
    const l = this.logins.get(p.id);
    if (!l || l.done) throw new DocumentError('CONFLICT', 'No sign-in is running for this account — start it again');
    l.child.stdin?.write(`${p.code}\n`);
    await Promise.race([l.finished, new Promise((r) => setTimeout(r, 60_000))]);
    const dto = this.dto(a);
    if (!dto.signedIn) throw new DocumentError('VALIDATION', l.error || 'Sign-in did not finish — check the code and try again');
    return dto;
  }

  cancelLogin(params: unknown) {
    const { id: accountId } = parse(accountParams.byId, params);
    const l = this.logins.get(accountId);
    if (!l) return;
    l.cancelled = true;
    this.logins.delete(accountId);
    kill(l.child);
    this.notify(accountId);
  }

  /* ---------------------------------- runs ---------------------------------- */

  /**
   * Environment that points an agent run at an account: `account` = an id, 'host' for this
   * computer's own login, or undefined for the agent's default account (else the host login).
   */
  runEnv(agent: string, account?: string): { env: Record<string, string>; label: string | null } {
    const chosen = account === 'host' ? undefined : account ?? this.data.defaults[agent as AccountAgent];
    if (!chosen) return { env: {}, label: null };
    const a = this.data.accounts.find((x) => x.id === chosen && x.agent === agent);
    if (!a) throw new DocumentError('NOT_FOUND', 'The selected account no longer exists');
    const label = this.displayName(a);
    if (!a.enabled) throw new DocumentError('VALIDATION', `Account "${label}" is disabled in Settings`);
    if (!this.identity(a).signedIn) throw new DocumentError('VALIDATION', `Account "${label}" is not signed in — sign in from Settings → AI providers`);
    if (a.agent === 'claude') return { env: { CLAUDE_CONFIG_DIR: a.dir }, label };
    if (a.agent === 'codex') return { env: { CODEX_HOME: a.dir }, label };
    throw new DocumentError('VALIDATION', 'agy runs under a saved account are not supported yet — use "Use on this computer"');
  }

  shutdown() {
    for (const l of this.logins.values()) kill(l.child);
    this.logins.clear();
  }
}
