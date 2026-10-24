type MaintenanceEnv = {
  APP_ORIGIN?: string; NEXTAUTH_URL?: string; EDITORIAL_CRON_SECRET?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};
export async function runMediaMaintenance(env: MaintenanceEnv): Promise<void> {
  const secret = env.EDITORIAL_CRON_SECRET?.trim();
  if (!secret || !env.WORKER_SELF_REFERENCE) throw new Error("Media maintenance bindings are missing.");
  const origin = new URL(env.APP_ORIGIN || env.NEXTAUTH_URL || "");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Media maintenance requires a trusted HTTPS origin.");
  const response = await env.WORKER_SELF_REFERENCE.fetch(new Request(new URL("/api/media/maintenance", origin), {
    method: "POST", headers: { authorization: `Bearer ${secret}`, origin: origin.origin }, signal: AbortSignal.timeout(90_000),
  }));
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Media maintenance failed (${response.status}).`); }
  const result = await response.json() as { ok?: boolean; completed?: Record<string, number>; abandoned?: Record<string, number> };
  if (!result.ok || [result.completed, result.abandoned].some(batch => !batch || ["examined", "deleted", "failed", "skipped"].some(key => !Number.isSafeInteger(batch[key]) || batch[key] < 0) || batch.failed !== 0)) throw new Error("Media maintenance did not finish its batch.");
}
