import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "../../.generated/prisma-worker/client"
import { createWorkerDatabase } from "./worker-db-operations"

/** A URL can be injected for tests; runtime configuration uses ambient secrets only. */
export function createWorkerClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("[bunny-library] DATABASE_URL must be a PostgreSQL connection string")
  }
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: databaseUrl }),
    log: ["error"],
  })
}

// This module holds only a proxy. Pools belong to individual awaited operations,
// including an entire interactive transaction, and disconnect before returning.
export const db: PrismaClient = createWorkerDatabase(() => createWorkerClient())
