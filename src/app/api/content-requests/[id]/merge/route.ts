import { guardedContentRequest } from "@/lib/content-requests/controller";
import { mergeContentRequests } from "@/lib/content-requests/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guardedContentRequest(request, body => mergeContentRequests({ ...body, sourceId: id }));
}
