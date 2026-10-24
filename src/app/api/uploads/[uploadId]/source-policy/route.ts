import { changeSourcePolicy } from "@/lib/media/source-retention";
import { guardedUploadRoute } from "@/lib/media/uploads";

export async function POST(request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  return guardedUploadRoute(request, async () => {
    const { uploadId } = await params;
    return changeSourcePolicy(uploadId, await request.json());
  });
}
