import { PrismaClient } from "@prisma/client"
import { resolveDatabaseUrl } from "@/lib/db-url"

/**
 * Bunny Library — runtime database client (Neon PostgreSQL).
 *
 * Two Neon connection strings are used (see README → "Database"):
 *   - DATABASE_URL : Neon POOLED url  → used by this client for ALL runtime queries
 *                    (PgBouncer endpoint; serverless-safe for the Next.js runtime)
 *   - DIRECT_URL   : Neon DIRECT url  → used only by Prisma migrate/CLI commands
 *                    (versioned migrations in prisma/migrations)
 *
 * Validation is intentionally LAZY (runs on first real DB use, not at module import):
 *   - `next build` never needs database env vars (all DB-backed routes are
 *     force-dynamic), and
 *   - any wrong or missing configuration still fails LOUDLY at runtime instead of
 *     silently connecting to a wrong database.
 *
 * There is NO SQLite fallback: SQLite was removed as a runtime dependency
 * (DECISIONS.md D-28). Error messages reference variable NAMES only — never values,
 * because connection strings contain credentials.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function assertRuntimeUrlConfigured(): string {
  const url = resolveDatabaseUrl()
  if (!url) {
    throw new Error(
      "[bunny-library] DATABASE_URL is missing or is not a PostgreSQL connection string. " +
        "Add both Neon connection strings to .env.local (DATABASE_URL = pooled url, DIRECT_URL = direct url). " +
        "SQLite is no longer a runtime option (DECISIONS.md D-28). See README → Database."
    )
  }
  return url
}

function getClient(): PrismaClient {
  let client = globalForPrisma.prisma
  if (!client) {
    const url = assertRuntimeUrlConfigured()
    // The URL is passed EXPLICITLY (datasourceUrl) from the value validated
    // above, so the engine uses exactly this url and never re-reads ambient
    // env files (Prisma's own .env auto-loading cannot override it).
    client = new PrismaClient({
      log: ["error"],
      datasourceUrl: url,
      // Standard PrismaClient against the Neon POOLED endpoint is the
      // serverless-safe configuration for the Node.js/Next.js runtime.
      // (Driver adapters are only needed for Edge runtimes — not used here.)
    })
    globalForPrisma.prisma = client
  }
  return client
}

/**
 * Lazy proxy: module import stays side-effect free (build-safe), while the first
 * property access (e.g. `db.series.findMany`) constructs and validates the client.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = Reflect.get(client, prop)
    return typeof value === "function" ? value.bind(client) : value
  },
})

/** Node runtime already owns a reusable client; keep the same explicit boundary API. */
export async function withDatabaseScope<R>(work: () => Promise<R>): Promise<R> { return work(); }
