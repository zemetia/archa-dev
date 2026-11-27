import { DocumentError } from '@archa/core';
import { INVALID_PARAMS, isMethod, parseParams, type CoreMethods, type MethodName, type ParsedParams } from '@archa/protocol';
import type { Connection } from './context';

type Result<M extends MethodName> = CoreMethods[M]['result'] | Promise<CoreMethods[M]['result']>;

/** Gets the params the registry schema parsed (packages/protocol/src/rpc.ts); never called with invalid ones. */
export type Handler<M extends MethodName> = (params: ParsedParams<M>, conn: Connection) => Result<M>;

/** One domain's share of the RPC surface (blueprint ARCHITECTURE/02). */
export type Routes = { [M in MethodName]?: Handler<M> };

export type Router = {
  readonly routes: { [M in MethodName]: Handler<M> };
  /** Runs a request; throws (synchronously or by rejecting) like the handler does. */
  call(method: string, params: unknown, conn: Connection): unknown;
};

/**
 * Merges the domain modules; a method defined twice fails at startup, not on the first call.
 * Every request is checked against the RPC registry before its handler runs: unknown → NOT_FOUND,
 * bad params → INVALID_PARAMS and the handler is not called.
 */
export function createRouter(modules: Array<[name: string, routes: Routes]>): Router {
  const routes: Record<string, Handler<MethodName>> = {};
  const owner: Record<string, string> = {};
  for (const [name, mod] of modules) {
    for (const [method, route] of Object.entries(mod)) {
      if (owner[method]) throw new Error(`RPC method ${method} is defined by both ${owner[method]} and ${name}`);
      owner[method] = name;
      routes[method] = route as Handler<MethodName>;
    }
  }
  return {
    routes: routes as Router['routes'],
    call(method, params, conn) {
      if (!isMethod(method) || !Object.hasOwn(routes, method)) throw new DocumentError('NOT_FOUND', `Unknown method ${method}`);
      const p = parseParams(method, params);
      if (!p.ok) throw Object.assign(new Error(p.message), { code: INVALID_PARAMS });
      return routes[method]!(p.data as never, conn);
    },
  };
}
