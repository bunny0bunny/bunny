import { describe, expect, test } from "bun:test"
import { createWorkerDatabase } from "../../src/lib/worker-db-operations"

function fixture() {
  const events: string[] = []
  const clients: ReturnType<typeof makeClient>[] = []
  let release = () => {}
  const pending = new Promise<void>((resolve) => { release = resolve })
  function makeClient() {
    const id = clients.length
    const delegate = {
      async findMany(wait = false) {
        expect(this).toBe(delegate)
        events.push(`query:${id}`)
        if (wait) await pending
        return id
      },
      async fail() { throw new Error("query failed") },
    }
    const client = {
      profile: delegate,
      async $disconnect() { expect(this).toBe(client); events.push(`disconnect:${id}`) },
      async $transaction(callback: (tx: typeof transaction) => Promise<unknown>, options?: unknown) {
        expect(this).toBe(client)
        events.push(`begin:${id}`)
        receivedOptions = options
        const result = await callback(transaction)
        events.push(`commit:${id}`)
        return result
      },
      async $queryRaw(...args: unknown[]) { expect(this).toBe(client); return args },
    }
    const transaction = { profile: delegate }
    clients.push(client)
    return client
  }
  let receivedOptions: unknown
  return { db: createWorkerDatabase(makeClient), events, clients, release, options: () => receivedOptions }
}

describe("Worker database operation ownership", () => {
  test("independent awaited operations allocate separate clients lazily", async () => {
    const { db, clients, events } = fixture()
    const first = db.profile.findMany()
    expect(clients).toHaveLength(0)
    expect(await first).toBe(0)
    expect(await first).toBe(0)
    expect(await db.profile.findMany()).toBe(1)
    expect(events).toEqual(["query:0", "disconnect:0", "query:1", "disconnect:1"])
  })

  test("disconnect waits for operation completion", async () => {
    const { db, events, release } = fixture()
    const result = Promise.resolve(db.profile.findMany(true))
    await Promise.resolve()
    expect(events).toEqual(["query:0"])
    release()
    await result
    expect(events).toEqual(["query:0", "disconnect:0"])
  })

  test("failed operations disconnect and preserve the rejection", async () => {
    const { db, events } = fixture()
    await expect(Promise.resolve(db.profile.fail())).rejects.toThrow("query failed")
    expect(events).toEqual(["disconnect:0"])
  })

  test("interactive transactions preserve delegates, options and callback lifetime", async () => {
    const { db, clients, events, release, options } = fixture()
    const settings = { timeout: 12000, maxWait: 3000, isolationLevel: "Serializable" }
    const result = Promise.resolve(db.$transaction(async (tx) => {
      expect(await tx.profile.findMany()).toBe(0)
      expect(clients).toHaveLength(1)
      return tx.profile.findMany(true)
    }, settings))
    await Promise.resolve()
    await Promise.resolve()
    expect(events).not.toContain("disconnect:0")
    release()
    expect(await result).toBe(0)
    expect(options()).toBe(settings)
    expect(events).toEqual(["begin:0", "query:0", "query:0", "commit:0", "disconnect:0"])
  })

  test("failed transaction callbacks disconnect after rollback propagation", async () => {
    const { db, events } = fixture()
    await expect(Promise.resolve(db.$transaction(async (tx) => { await tx.profile.fail() }))).rejects.toThrow("query failed")
    expect(events).toEqual(["begin:0", "disconnect:0"])
  })

  test("tagged raw queries retain template identity and values", async () => {
    const { db, events } = fixture()
    const template = Object.assign(["SELECT ", ""], { raw: ["SELECT ", ""] })
    const value = { id: 42 }
    const args = await db.$queryRaw(template, value)
    expect(args[0]).toBe(template)
    expect(args[1]).toBe(value)
    expect(events).toEqual(["disconnect:0"])
  })

  test("batch transactions fail before any lazy queries start", () => {
    const { db, clients } = fixture()
    expect(() => db.$transaction([db.profile.findMany()] as never)).toThrow("callback")
    expect(clients).toHaveLength(0)
  })

  test("unsupported client APIs fail explicitly without allocating clients", () => {
    const { db, clients } = fixture()
    for (const api of ["$connect", "$disconnect", "$extends", "$on", "$use"]) {
      expect(() => Reflect.get(db, api)).toThrow("unsupported")
    }
    expect(clients).toHaveLength(0)
  })
})
