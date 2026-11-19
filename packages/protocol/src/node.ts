import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** `~/.archadev`, overridable with ARCHA_HOME (tests must override it). */
export const archaHome = () => process.env.ARCHA_HOME ?? join(homedir(), '.archadev');

/** Where the running app's core host listens and writes its token (blueprint ARCHITECTURE/02). */
export const runtimeFile = () => join(archaHome(), 'runtime', 'core.json');

/** A custom ARCHA_HOME (dev runs, tests) gets its own pipe, so it never collides with the installed app's core. */
const homeTag = () => (process.env.ARCHA_HOME ? `-${createHash('sha1').update(process.env.ARCHA_HOME).digest('hex').slice(0, 8)}` : '');

export const socketPath = () =>
  process.platform === 'win32' ? `\\\\.\\pipe\\archadev-core-${process.env.USERNAME ?? 'user'}${homeTag()}` : join(archaHome(), 'runtime', 'core.sock');

export type RuntimeInfo = { pid: number; socket: string; token: string; startedAt: number };
