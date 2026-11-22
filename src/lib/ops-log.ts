/**
 * Structured operational logs for Cloudflare Workers Logs.
 * Never pass tokens, emails, passwords, signed URLs or request bodies here.
 */
export function logOpsEvent(scope: string, event: string, details: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ level: "warn", scope, event, ...details }));
}

export function errorSummary(error: unknown) {
  if (error instanceof Error) return { errorName: error.name, errorMessage: error.message.slice(0, 300) };
  return { errorName: typeof error, errorMessage: String(error).slice(0, 300) };
}
