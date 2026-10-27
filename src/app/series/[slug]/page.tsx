import { AdultBadge } from "@/components/library/adult-badge";
import { normalizeGenres } from "@/lib/genres";
import { getWorkTitle, getWorkTitles } from '@/lib/work-title';
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Star, UserRound, Languages } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { Rail, SeriesCardItem } from "@/components/library/series-card";
import { RatingWidget } from "@/components/community/rating-widget";
import { CommentsSection } from "@/components/community/comments-section";
import { WorkHeroActions } from "@/components/library/work-hero-actions";
import { WorkSynopsis } from "@/components/library/work-synopsis";
import { WorkTabs, type ChapterItemView } from "@/components/library/work-tabs";
import {
  currentProfileOrNull,
  getProgressMap,
  getRelatedSeries,
  getSeriesBySlug,
  getVisibleComments,
  getUserRating,
  liveChapterWhere,
  parseJsonArray,
} from "@/lib/queries";
import {
  type Format,
  type SeriesStatus,
  CATEGORY_LABELS,
  FORMAT_LABELS,
  STATUS_LABELS,
  isCategory,
  isSeriesStatus,
  type Shelf,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSeriesBySlug(slug);
  if (!s) return { title: "عمل غير موجود" };
  return {
    title: getWorkTitle(s),
    description: s.synopsisAr.slice(0, 120),
    openGraph: {
      siteName: "Bunyora Library",
      title: getWorkTitle(s),
      description: s.synopsisAr.slice(0, 120),
      type: "article",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = await getSeriesBySlug(slug);
  if (!s) notFound();
  const titles = getWorkTitles(s);

  const profile = await currentProfileOrNull();
  const progressMap = await getProgressMap(profile?.id ?? null, s.id);
  const genres = normalizeGenres(parseJsonArray(s.genresJson));
  const tags = parseJsonArray(s.tagsJson);
  const related = await getRelatedSeries(s.id, genres);

  const [comments, userRating, shelfRow] = await Promise.all([
    getVisibleComments(s.id, null),
    getUserRating(profile?.id ?? null, s.id),
    profile
      ? import("@/lib/db").then(({ db }) =>
          db.libraryItem.findUnique({
            where: { profileId_seriesId: { profileId: profile.id, seriesId: s.id } },
            select: { shelf: true },
          })
        )
      : Promise.resolve(null),
  ]);

  // Server-side progress for signed-in reader
  let serverProgress: { chapterNumber: number; pageIndex: number; percent: number } | null = null;
  if (profile) {
    const row = await import("@/lib/db").then(({ db }) =>
      db.readingProgress.findFirst({
        where: { profileId: profile.id, seriesId: s.id, completed: false, percent: { gt: 0, lt: 100 }, chapter: { ...liveChapterWhere(), isPremiumDemo: false } },
        orderBy: { updatedAt: "desc" },
        include: { chapter: { select: { number: true } } },
      })
    );
    if (row) {
      serverProgress = {
        chapterNumber: row.chapter.number,
        pageIndex: row.pageIndex,
        percent: row.percent,
      };
    }
  }

  const published = s.publishedChapters;
  const scheduled = s.scheduledChapters;

  // Title category logic:
  // Uses s.category from returned Prisma Series.
  // Legacy unclassified webtoon remains null and is NOT guessed as manhwa.
  const categoryLabel = s.category && isCategory(s.category) ? CATEGORY_LABELS[s.category] : null;
  const formatLabel = FORMAT_LABELS[s.format as Format] ?? s.format;
  const statusLabel = isSeriesStatus(s.status) ? STATUS_LABELS[s.status as SeriesStatus] : s.status;
  const primaryGenre = genres[0] ?? null;

  const publishedView: ChapterItemView[] = published.map((c) => ({
    id: c.id,
    number: c.number,
    titleAr: c.titleAr,
    isPremiumDemo: c.isPremiumDemo,
    publishedAt: c.publishedAt,
    scheduledFor: c.scheduledFor,
    pageCount: c.pageCount,
    novelWords: c.novelWords,
  }));

  const scheduledView: ChapterItemView[] = scheduled.map((c) => ({
    id: c.id,
    number: c.number,
    titleAr: c.titleAr,
    isPremiumDemo: c.isPremiumDemo,
    publishedAt: c.publishedAt,
    scheduledFor: c.scheduledFor,
    pageCount: c.pageCount,
    novelWords: c.novelWords,
  }));

  const progressEntries: [string, { pageIndex: number; percent: number; completed: boolean }][] = [
    ...progressMap.entries(),
  ];

  const initialShelf = (shelfRow?.shelf as Shelf) ?? null;
  const hasCover = Boolean(s.coverPath.trim());


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1 pb-36 sm:pb-20 md:pb-12">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-6">
          <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside aria-label="بيانات العمل والتأليف" className="hidden space-y-5 lg:block">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border">
                {hasCover ? <Image src={s.coverPath} alt={'غلاف ' + getWorkTitle(s)} fill sizes="260px" className="object-cover" priority /> : <div role="img" aria-label="لا يوجد غلاف لهذا العمل" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card text-muted-foreground"><BookOpen className="size-10" aria-hidden /><span className="text-xs">الغلاف غير متاح</span></div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {categoryLabel && <Link href={'/explore?category=' + s.category} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-xs hover:text-primary">{categoryLabel}</Link>}
                {primaryGenre && <Link href={'/explore?genre=' + encodeURIComponent(primaryGenre)} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-xs hover:text-primary">{primaryGenre}</Link>}
                <span className={'inline-flex items-center rounded-lg border px-3 text-xs ' + (s.status === 'ongoing' ? 'border-success/30 text-success' : 'border-border text-muted-foreground')}>{statusLabel}</span>
              </div>
              <WorkSynopsis synopsis={s.synopsisAr} />
              <dl className="space-y-3 border-t border-border pt-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="flex items-center gap-2 text-muted-foreground"><UserRound className="size-4" aria-hidden /> المؤلف</dt>
                  <dd className="max-w-full break-words font-medium">{s.author}</dd>
                </div>
                {s.translator && <div className="flex flex-wrap justify-between gap-2">
                  <dt className="flex items-center gap-2 text-muted-foreground"><Languages className="size-4" aria-hidden /> المترجم</dt>
                  <dd className="max-w-full break-words font-medium">{s.translator}</dd>
                </div>}
              </dl>
              {genres.length > 0 && <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-medium">أجواء العمل</p>
                <div className="flex flex-wrap gap-2">{genres.map(genre => <Link key={genre} href={'/explore?genre=' + encodeURIComponent(genre)} className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-primary">{genre}</Link>)}</div>
              </div>}
            </aside>
            <div className="min-w-0">
              <section aria-label="بيانات العمل الرئيسية" className="relative overflow-hidden rounded-xl border border-border bg-card/30">
                {hasCover && <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
                  <Image src={s.coverPath} alt="" fill sizes="800px" className="object-cover object-[50%_12%]" priority />
                  <div className="absolute inset-0 bg-gradient-to-l from-background/95 via-background/75 to-background/25" />
                </div>}
                <div className="relative p-4 sm:p-5 lg:p-7">
                  <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 sm:grid-cols-[120px_minmax(0,1fr)] lg:block">
                    <div className="relative aspect-[2/3] self-start overflow-hidden rounded-lg border border-border lg:hidden">
                      {hasCover ? <Image src={s.coverPath} alt={'غلاف ' + getWorkTitle(s)} fill sizes="120px" className="object-cover" priority /> : <div role="img" aria-label="لا يوجد غلاف لهذا العمل" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card text-muted-foreground"><BookOpen className="size-7" aria-hidden /><span className="text-[10px]">الغلاف غير متاح</span></div>}
                    </div>
                    <div className="min-w-0">
                      <nav aria-label="تصنيف العمل" className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {categoryLabel ? <Link className="inline-flex min-h-11 items-center hover:text-primary" href={'/explore?category=' + s.category}>{categoryLabel}</Link> : <span>{formatLabel}</span>}
                        {primaryGenre && <><span aria-hidden>‹</span><Link className="inline-flex min-h-11 items-center hover:text-primary" href={'/explore?genre=' + encodeURIComponent(primaryGenre)}>{primaryGenre}</Link></>}
                      </nav>
                      {s.isAdult && <div className="mb-2 flex items-center gap-2"><AdultBadge /><span className="text-xs font-semibold text-red-700 dark:text-red-300">محتوى للبالغين</span></div>}
                      <h1 className="text-xl font-extrabold leading-snug text-foreground sm:text-2xl lg:text-3xl"><bdi>{titles.primary}</bdi></h1>
                      {titles.secondary && <p className="mt-1 break-words text-right text-xs text-muted-foreground sm:text-sm" dir="auto">{titles.secondary}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm">
                        {s.ratingCount > 0 ? <span className="inline-flex items-center gap-1 text-gold"><Star className="size-4 fill-current" aria-hidden />{s.ratingAvg.toFixed(1)}<span className="sr-only"> من 5، {s.ratingCount} تقييمًا</span></span> : <span className="text-muted-foreground">لم يُقيّم بعد</span>}
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><BookOpen className="size-4" aria-hidden />{published.length} فصلاً</span>
                        <span className={'rounded-lg border px-2 py-1 ' + (s.status === 'ongoing' ? 'border-success/30 text-success' : 'border-border text-muted-foreground')}>{statusLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 lg:mt-6">
                    <WorkHeroActions slug={s.slug} format={s.format as Format} serverProgress={serverProgress}
                      chapters={published.map(c => ({ number: c.number, isPremiumDemo: c.isPremiumDemo }))}
                      titleAr={getWorkTitle(s)} initialShelf={initialShelf} />
                  </div>
                </div>
              </section>
              <div className="px-1 pt-5 lg:hidden"><WorkSynopsis synopsis={s.synopsisAr} /></div>
              <div className="mt-5 lg:mt-4">
                <WorkTabs slug={s.slug} format={s.format as Format} coverPath={s.coverPath}
                  publishedChapters={publishedView} scheduledChapters={scheduledView} serverProgress={serverProgress}
                  progressMapEntries={progressEntries} aboutData={{ titleAr: getWorkTitle(s), synopsisAr: s.synopsisAr,
                    author: s.author, translator: s.translator, categoryLabel, formatLabel, statusLabel, genres, tags }}>
                  <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
                    <RatingWidget slug={s.slug} ratingAvg={s.ratingAvg} ratingCount={s.ratingCount} userValue={userRating?.value ?? null} />
                    <div className="min-w-0"><CommentsSection seriesSlug={s.slug} seriesTitle={getWorkTitle(s)} comments={comments} /></div>
                  </div>
                </WorkTabs>
              </div>
              {related.length > 0 && <Rail title="أعمال مشابهة قد تعجبك">
                {related.map(work => <SeriesCardItem key={work.id} series={work} />)}
              </Rail>}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
