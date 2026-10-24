import { guardedUploadRoute, startUpload } from "@/lib/media/uploads";
import { latestRevisionUpload } from "@/lib/media/source-retention";
import { uploadResponse } from "@/lib/media/uploads";
import { withDatabaseScope } from "@/lib/db";
export async function GET(request: Request) {
  try { return uploadResponse(await withDatabaseScope(() => latestRevisionUpload(new URL(request.url).searchParams.get("revisionId") ?? ""))); }
  catch { return uploadResponse({ ok: false, error: "unavailable" }); }
}
export async function POST(request: Request) {
  return guardedUploadRoute(request, async () => startUpload(await request.json()));
}
