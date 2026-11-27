import { paths } from './storage';

export * from './storage';

/** Where the running app's core host listens and writes its token (blueprint ARCHITECTURE/02). */
export const runtimeFile = paths.runtimeInfo;

export const socketPath = paths.socket;

export type RuntimeInfo = { pid: number; socket: string; token: string; startedAt: number };
