import { saveCover } from '@/lib/media/covers';
export async function POST(request: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  return saveCover(request, (await params).seriesId);
}
