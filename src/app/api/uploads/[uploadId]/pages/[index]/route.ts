import { guardedUploadRoute, writeUploadAsset } from "@/lib/media/uploads";
export async function PUT(request: Request, { params }: { params: Promise<{ uploadId: string; index: string }> }) {
  return guardedUploadRoute(request, async () => { const p = await params; return /^\d+$/.test(p.index) ? writeUploadAsset(p.uploadId, Number(p.index), request) : { ok: false, error: "invalid_input" }; });
}
