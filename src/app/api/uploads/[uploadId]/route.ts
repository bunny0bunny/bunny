import { uploadResponse, uploadStatus } from "@/lib/media/uploads";
export async function GET(_request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  try { return uploadResponse(await uploadStatus((await params).uploadId)); } catch { return uploadResponse({ ok: false, error: "unavailable" }); }
}
