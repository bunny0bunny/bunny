import { cache } from 'react';
import { getWorkTitle } from '@/lib/work-title';
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NovelReader } from "@/components/readers/novel-reader";
import { getChapterForReading, getVisibleComments, currentProfileOrNull, getReaderProgress } from "@/lib/queries";

export const dynamic = "force-dynamic";
const getReaderData = cache(getChapterForReading);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ series: string; chapter: string }>;
}): Promise<Metadata> {
  const { series, chapter } = await params;
  const num = Number(chapter);
  const data = Number.isInteger(num) && num > 0 ? await getReaderData(series, num) : null;
  return { title: `${data?.series.format === 'novel' ? getWorkTitle(data.series) : series} — الفصل ${chapter}` };
}

export default async function NovelReaderPage({
  params,
}: {
  params: Promise<{ series: string; chapter: string }>;
}) {
  const { series: seriesSlug, chapter } = await params;
  const num = Number(chapter);
  if (!Number.isInteger(num) || num < 1) notFound();
  const data = await getReaderData(seriesSlug, num);
  if (!data || data.series.format !== "novel") notFound();
  const profile = await currentProfileOrNull();
  const [comments, initialProgress] = await Promise.all([
    getVisibleComments(data.series.id, data.chapter.id, profile?.id ?? null),
    getReaderProgress(profile?.id ?? null, data.chapter.id),
  ]);

  const body = data.chapter.novelBody ?? "";
  const paragraphs = body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <NovelReader
      key={data.chapter.id}
      chapters={data.chapterList}
      initialProgress={initialProgress}
      seriesSlug={data.series.slug}
      seriesTitle={getWorkTitle(data.series)}
      chapterNumber={data.chapter.number}
      chapterTitle={data.chapter.titleAr}
      isPremiumDemo={data.chapter.isPremiumDemo}
      comments={comments}
      paragraphs={paragraphs}
      next={data.next ? { number: data.next.number, isPremiumDemo: data.next.isPremiumDemo } : null}
      prev={data.prev ? { number: data.prev.number, isPremiumDemo: data.prev.isPremiumDemo } : null}
    />
  );
}
