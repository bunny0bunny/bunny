import { guardedUploadRoute, cancelUpload } from "@/lib/media/uploads";
export async function POST(request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  return guardedUploadRoute(request, async () => cancelUpload((await params).uploadId, (await request.json()).expectedVersion));
}
