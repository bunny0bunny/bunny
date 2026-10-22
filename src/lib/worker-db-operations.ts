import { AsyncLocalStorage } from "node:async_hooks";

type OwnedClient = { $disconnect(): Promise<void> };
type Scope = { clients: Map<() => OwnedClient, OwnedClient>; pending: Set<Promise<unknown>>; closed: boolean };
const scopes = new AsyncLocalStorage<Scope>();

async function disconnectSafely(client: OwnedClient): Promise<void> {
  try { await client.$disconnect(); }
  catch { console.warn("[bunny-db] Connection cleanup failed; operation result preserved."); }
}

/** Explicit awaited API/data-loading boundary; never holds sockets across requests. */
export async function withWorkerDatabaseScope<R>(work: () => Promise<R>): Promise<R> {
  const inherited = scopes.getStore();
  if (inherited && !inherited.closed) return work();
  const scope: Scope = { clients: new Map(), pending: new Set(), closed: false };
  return scopes.run(scope, async () => {
    try { return await work(); }
    finally {
      scope.closed = true;
      await Promise.allSettled([...scope.pending]);
      await Promise.all([...scope.clients.values()].map(disconnectSafely));
      scope.clients.clear();
    }
  });
}

/** Lazy proxy. Explicit scopes share initialization; other callers keep per-operation ownership. */
export function createWorkerDatabase<T extends OwnedClient>(factory: () => T): T {
  function operation(path: PropertyKey[], args: unknown[]): Promise<unknown> {
    // Capture before thenable assimilation: workerd does not fully propagate ALS through thenables.
    const captured = scopes.getStore();
    let pending: Promise<unknown> | undefined;
    const start = () => {
      if (pending) return pending;
      const scope = captured && !captured.closed ? captured : undefined;
      let client = scope?.clients.get(factory) as T | undefined;
      if (!client) {
        client = factory();
        scope?.clients.set(factory, client);
      }
      const owned = client;
      pending = (async () => {
        try {
          let receiver: unknown = owned;
          for (const key of path.slice(0, -1)) receiver = Reflect.get(receiver as object, key);
          const method = Reflect.get(receiver as object, path[path.length - 1]);
          return await Reflect.apply(method, receiver, args);
        } finally { if (!scope) await disconnectSafely(owned); }
      })();
      if (scope) {
        const current = pending;
        scope.pending.add(current);
        current.then(() => scope.pending.delete(current), () => scope.pending.delete(current));
      }
      return pending;
    };
    return {
      then: (resolve, reject) => start().then(resolve, reject),
      catch: (reject) => start().catch(reject),
      finally: (finish) => start().finally(finish),
      [Symbol.toStringTag]: "Promise",
    };
  }
  const rawMethods = new Set(["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"]);
  return new Proxy({} as T, {
    get(_target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key === "$transaction") return (callback: unknown, options?: unknown) => {
        if (typeof callback !== "function") throw new Error("Worker database $transaction requires an interactive callback; batch arrays are unsupported");
        return operation([key], [callback, options]);
      };
      if (rawMethods.has(key)) return (...args: unknown[]) => operation([key], args);
      if (key.startsWith("$") || key.startsWith("_")) throw new Error(`Worker database API ${key} is unsupported`);
      return new Proxy({}, { get(_delegate, method) {
        if (method === "then" || typeof method === "symbol") return undefined;
        return (...args: unknown[]) => operation([key, method], args);
      } });
    },
  });
}
