import { getWorkTitle } from '@/lib/work-title';
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { liveChapterWhere } from "@/lib/queries";
import { displayCover } from "@/lib/demo-cover-art";

const requestSchema = z.object({ targets: z.array(z.object({
  seriesSlug: z.string().min(1).max(200),
  chapterNumber: z.number().int().positive(),
  format: z.enum(["manga", "webtoon", "novel"]),
})).max(20) });

// Public, bounded lookup of live reader destinations. Never returns draft metadata.
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 16_000) return NextResponse.json({ error: "Invalid targets" }, { status: 400 });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid targets" }, { status: 400 }); }
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: "Invalid targets" }, { status: 400 });
  const targets = parsed.data.targets;
  if (!targets.length) return NextResponse.json({ readable: [] });
  const chapters = await db.chapter.findMany({
    where: { AND: [liveChapterWhere(), { isPremiumDemo: false }, { OR: targets.map(t => ({
      number: t.chapterNumber, deletedAt: null, series: { slug: t.seriesSlug, format: t.format, deletedAt: null },
    })) }] },
    select: { number: true, titleAr: true, series: { select: {
      slug: true, titleAr: true, titleOriginal: true, format: true, coverPath: true, accent: true,
    } } },
  });
  return NextResponse.json({ readable: chapters.map(c => ({
    seriesSlug: c.series.slug, chapterNumber: c.number, format: c.series.format,
    seriesTitle: getWorkTitle(c.series), chapterTitle: c.titleAr,
    coverPath: displayCover(c.series.coverPath), accent: c.series.accent,
  })) });
}
