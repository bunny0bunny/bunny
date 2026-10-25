import { withDatabaseScope } from "@/lib/db";
import { findRequestCatalog } from "@/lib/content-requests/service";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const items = await withDatabaseScope(() => findRequestCatalog(query.slice(0, 150)));
    return Response.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "تعذّر البحث في المكتبة الآن." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
