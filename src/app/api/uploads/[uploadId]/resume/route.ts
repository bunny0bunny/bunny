import { guardedUploadRoute, resumeUpload } from "@/lib/media/uploads";
export async function POST(request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  return guardedUploadRoute(request, async () => resumeUpload((await params).uploadId, await request.json()));
}
