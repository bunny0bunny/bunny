import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WebtoonReader } from "@/components/readers/webtoon-reader";
import { getChapterForReading, getVisibleComments, currentProfileOrNull, getReaderProgress } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ series: string; chapter: string }>;
}): Promise<Metadata> {
  const { series, chapter } = await params;
  return { title: `الفصل ${chapter} — ${series}` };
}

export default async function WebtoonReaderPage({
  params,
}: {
  params: Promise<{ series: string; chapter: string }>;
}) {
  const { series: seriesSlug, chapter } = await params;
  const num = Number(chapter);
  if (!Number.isInteger(num) || num < 1) notFound();
  const data = await getChapterForReading(seriesSlug, num);
  if (!data || data.series.format !== "webtoon") notFound();
  const profile = await currentProfileOrNull();
  const [comments, initialProgress] = await Promise.all([
    getVisibleComments(data.series.id, data.chapter.id, profile?.id ?? null),
    getReaderProgress(profile?.id ?? null, data.chapter.id),
  ]);

  return (
    <WebtoonReader
      key={data.chapter.id}
      chapters={data.chapterList}
      initialProgress={initialProgress}
      seriesSlug={data.series.slug}
      seriesTitle={data.series.titleAr}
      chapterNumber={data.chapter.number}
      chapterTitle={data.chapter.titleAr}
      isPremiumDemo={data.chapter.isPremiumDemo}
      comments={comments}
      panels={data.chapter.pages.map((p) => ({
        id: p.id,
        pageIndex: p.pageIndex,
        imagePath: p.imagePath,
        fallbackImagePath: p.fallbackImagePath,
        width: p.width,
        height: p.height,
      }))}
      next={data.next ? { number: data.next.number, isPremiumDemo: data.next.isPremiumDemo } : null}
      prev={data.prev ? { number: data.prev.number, isPremiumDemo: data.prev.isPremiumDemo } : null}
    />
  );
}
