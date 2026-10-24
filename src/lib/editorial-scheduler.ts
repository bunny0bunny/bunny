type SchedulerEnv = {
  APP_ORIGIN?: string;
  NEXTAUTH_URL?: string;
  EDITORIAL_CRON_SECRET?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};

/** The bound HTTP handler supplies the normal OpenNext request/DB context. */
export async function runScheduledPublication(env: SchedulerEnv): Promise<{ publishedCount: number }> {
  const secret = env.EDITORIAL_CRON_SECRET?.trim();
  if (!secret || !env.WORKER_SELF_REFERENCE) throw new Error('Editorial scheduler bindings are not configured.');
  const origin = new URL(env.APP_ORIGIN || env.NEXTAUTH_URL || '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('Editorial scheduler requires a trusted HTTPS app origin.');
  const request = new Request(new URL('/api/editorial/publish-due', origin), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, Origin: origin.origin },
    signal: AbortSignal.timeout(90_000),
  });
  const response = await env.WORKER_SELF_REFERENCE.fetch(request);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Scheduled publication request failed (${response.status}).`);
  }
  const result = await response.json() as { ok?: boolean; publishedCount?: number; errors?: unknown[] };
  if (!result.ok || !Number.isSafeInteger(result.publishedCount) || result.publishedCount! < 0 || !Array.isArray(result.errors) || result.errors.length)
    throw new Error('Scheduled publication did not complete the due batch.');
  return { publishedCount: result.publishedCount! };
}
