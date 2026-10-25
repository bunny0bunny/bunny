import { guardedContentRequest } from "@/lib/content-requests/controller";
import { createContentRequest } from "@/lib/content-requests/service";

export async function POST(request: Request) {
  return guardedContentRequest(request, createContentRequest);
}
