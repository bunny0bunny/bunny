import { guardedUploadRoute, writeUploadAsset } from "@/lib/media/uploads";
export async function PUT(request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  return guardedUploadRoute(request, async () => writeUploadAsset((await params).uploadId, -1, request));
}
