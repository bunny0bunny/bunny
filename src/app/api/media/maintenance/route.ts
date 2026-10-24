import { withDatabaseScope } from "@/lib/db";
import { maintainAbandonedUploads, maintainCompletedSources } from "@/lib/media/source-retention";

export async function POST(request: Request) {
  const secret = process.env.EDITORIAL_CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false }, { status: 401 });
  try {
    const result = await withDatabaseScope(async () => ({
      completed: await maintainCompletedSources({ limit: 5 }),
      abandoned: await maintainAbandonedUploads({ limit: 3 }),
    }));
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false }, { status: 503 }); }
}
