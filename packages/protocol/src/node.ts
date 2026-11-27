import { paths } from './storage';

export * from './storage';
export * from './assets';
export * from './shots';

/** Where the running app's core host listens and writes its token (blueprint ARCHITECTURE/02). */
export const runtimeFile = paths.runtimeInfo;

export const socketPath = paths.socket;

/** `kind`: the app's core host, or a headless host started by `archa` when no app was running. */
export type RuntimeInfo = { pid: number; socket: string; token: string; startedAt: number; kind?: 'app' | 'headless' };
