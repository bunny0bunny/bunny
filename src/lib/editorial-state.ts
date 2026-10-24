export const EDITORIAL_LABELS = {
  draft: 'مسودة', review: 'قيد المراجعة', changes_requested: 'طُلبت تعديلات',
  approved: 'معتمد', scheduled: 'مجدول', published: 'منشور', withdrawn: 'مسحوب',
} as const;
export type EditorialStatus = keyof typeof EDITORIAL_LABELS;

export const latestRevisionSelect = {
  orderBy: { revisionNumber: 'desc' as const }, take: 1,
  select: { status: true, titleAr: true, pagesJson: true, novelBody: true, scheduledFor: true },
};

type WorkingChapter = {
  workflow: string; titleAr: string; novelBody: string | null; scheduledFor: Date | null;
  _count: { pages: number };
  revisions: { status: string; titleAr: string; pagesJson: unknown; novelBody: string | null; scheduledFor: Date | null }[];
};

/** Public Chapter fields remain intact; editorial metadata describes only the latest snapshot. */
export function withWorkingState<T extends WorkingChapter>(chapter: T) {
  const latest = chapter.revisions[0];
  return {
    ...chapter,
    workingStatus: (latest?.status ?? chapter.workflow) as EditorialStatus,
    workingTitleAr: latest?.titleAr ?? chapter.titleAr,
    workingPageCount: latest ? (Array.isArray(latest.pagesJson) ? latest.pagesJson.length : 0) : chapter._count.pages,
    workingWordCount: (latest ? latest.novelBody : chapter.novelBody)?.split(/\s+/).filter(Boolean).length ?? 0,
    workingScheduledFor: latest ? latest.scheduledFor : chapter.scheduledFor,
  };
}

export function isPublicChapter(chapter: { workflow: string; scheduledFor: Date | null }, now = new Date()) {
  return chapter.workflow === 'published' && (!chapter.scheduledFor || chapter.scheduledFor <= now);
}
