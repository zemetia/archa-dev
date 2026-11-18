import { homedir } from 'node:os';
import { join } from 'node:path';

/** `~/.archadev`, overridable with ARCHA_HOME (tests must override it). */
export const archaHome = () => process.env.ARCHA_HOME ?? join(homedir(), '.archadev');

/** Where the running app's core host listens and writes its token (blueprint ARCHITECTURE/02). */
export const runtimeFile = () => join(archaHome(), 'runtime', 'core.json');

export const socketPath = () =>
  process.platform === 'win32' ? `\\\\.\\pipe\\archadev-core-${process.env.USERNAME ?? 'user'}` : join(archaHome(), 'runtime', 'core.sock');

export type RuntimeInfo = { pid: number; socket: string; token: string; startedAt: number };
