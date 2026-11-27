import type { z } from 'zod';
import { DocumentError } from '@archa/core';
import type { CoreMethods, MethodName } from '@archa/protocol';
import type { Connection } from './context';

type Params<M extends MethodName> = CoreMethods[M]['params'];
type Result<M extends MethodName> = CoreMethods[M]['result'] | Promise<CoreMethods[M]['result']>;

/** A handler that trusts its params' types (it validates inside, or the params are only read). */
export type Handler<M extends MethodName> = (params: Params<M>, conn: Connection) => Result<M>;

/** A handler whose params the router checks against `schema` first; `run` gets the parsed value. */
export type Validated<R> = { schema: z.ZodType; run: (params: never, conn: Connection) => R };

export type Route<M extends MethodName> = Handler<M> | Validated<Result<M>>;

/** One domain's share of the RPC surface (blueprint ARCHITECTURE/02). */
export type Routes = { [M in MethodName]?: Route<M> };

/** Pairs a handler with the zod schema of its params. */
export function validated<S extends z.ZodType, R>(schema: S, run: (params: z.infer<S>, conn: Connection) => R): Validated<R> {
  return { schema, run };
}

/** zod issue → the VALIDATION error every handler reports for bad params. */
export function parse<T>(schema: z.ZodType<T>, params: unknown): T {
  const r = schema.safeParse(params);
  if (!r.success) throw new DocumentError('VALIDATION', `${r.error.issues[0]?.path.join('.') || 'params'}: ${r.error.issues[0]?.message}`);
  return r.data;
}

export type Router = {
  readonly routes: { [M in MethodName]: Route<M> };
  /** Runs a request; throws (synchronously or by rejecting) like the handler does. */
  call(method: string, params: unknown, conn: Connection): unknown;
};

/** Merges the domain modules; a method defined twice fails at startup, not on the first call. */
export function createRouter(modules: Array<[name: string, routes: Routes]>): Router {
  const routes: Record<string, Route<MethodName>> = {};
  const owner: Record<string, string> = {};
  for (const [name, mod] of modules) {
    for (const [method, route] of Object.entries(mod)) {
      if (owner[method]) throw new Error(`RPC method ${method} is defined by both ${owner[method]} and ${name}`);
      owner[method] = name;
      routes[method] = route as Route<MethodName>;
    }
  }
  return {
    routes: routes as Router['routes'],
    call(method, params, conn) {
      const route = Object.hasOwn(routes, method) ? routes[method] : undefined;
      if (!route) throw new DocumentError('NOT_FOUND', `Unknown method ${method}`);
      if (typeof route === 'function') return route(params as never, conn);
      return route.run(parse(route.schema, params ?? {}) as never, conn);
    },
  };
}
