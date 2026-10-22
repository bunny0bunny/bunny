import { withDatabaseScope } from "@/lib/db";
import { uploadResponse, uploadStatus } from "@/lib/media/uploads";
export async function GET(_request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  try { const { uploadId } = await params; return uploadResponse(await withDatabaseScope(() => uploadStatus(uploadId))); } catch { return uploadResponse({ ok: false, error: "unavailable" }); }
}
