/** Pure ownership layer; importing it never loads Prisma or opens a connection. */
export function createWorkerDatabase<T extends { $disconnect(): Promise<void> }>(factory: () => T): T {
  function operation(path: PropertyKey[], args: unknown[]): Promise<unknown> {
    let pending: Promise<unknown> | undefined
    const start = () => pending ??= (async () => {
      const client = factory()
      try {
        let receiver: unknown = client
        for (const key of path.slice(0, -1)) receiver = Reflect.get(receiver as object, key)
        const method = Reflect.get(receiver as object, path[path.length - 1])
        // Await inside try: interactive callbacks must finish before disconnect.
        return await Reflect.apply(method, receiver, args)
      } finally {
        await client.$disconnect()
      }
    })()
    // Lazy, memoized promises keep rejected batch transactions from executing writes.
    return {
      then: (resolve, reject) => start().then(resolve, reject),
      catch: (reject) => start().catch(reject),
      finally: (finish) => start().finally(finish),
      [Symbol.toStringTag]: "Promise",
    }
  }

  const rawMethods = new Set(["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"])
  return new Proxy({} as T, {
    get(_target, key) {
      if (key === "then" || typeof key === "symbol") return undefined
      if (key === "$transaction") {
        return (callback: unknown, options?: unknown) => {
          if (typeof callback !== "function") {
            throw new Error("Worker database $transaction requires an interactive callback; batch arrays are unsupported")
          }
          return operation([key], [callback, options])
        }
      }
      if (rawMethods.has(key)) return (...args: unknown[]) => operation([key], args)
      if (key.startsWith("$") || key.startsWith("_")) {
        throw new Error(`Worker database API ${key} is unsupported`)
      }
      return new Proxy({}, {
        get(_delegate, method) {
          if (method === "then" || typeof method === "symbol") return undefined
          return (...args: unknown[]) => operation([key, method], args)
        },
      })
    },
  })
}
