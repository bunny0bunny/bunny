import { guardedUploadRoute, startUpload } from "@/lib/media/uploads";
export async function POST(request: Request) {
  return guardedUploadRoute(request, async () => startUpload(await request.json()));
}
