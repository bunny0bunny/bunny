import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { isolatedDatabaseURL } from './qa-env.mjs';

const db = new PrismaClient({ datasources: { db: { url: isolatedDatabaseURL() } } });
const items = [
  { slug: 'qa-category-manhwa-pages', title: 'اختبار مانهوا بطريقة الصفحات', category: 'manhwa', format: 'manga', published: true },
  { slug: 'qa-category-comic-scroll', title: 'اختبار كوميك بطريقة التمرير', category: 'comic', format: 'webtoon', published: true },
  { slug: 'qa-category-unknown', title: 'اختبار عمل قديم غير مصنف', category: null, format: 'webtoon', published: true },
  { slug: 'qa-category-private', title: 'اختبار مسودة لا تظهر للاكتشاف', category: 'comic', format: 'webtoon', published: false },
] as const;

test.beforeAll(async () => {
  for (const item of items) {
    const row = await db.series.upsert({ where: { slug: item.slug }, update: {}, create: {
      slug: item.slug, titleAr: item.title, synopsisAr: 'بيانات اختبار محلية فقط لاستخدام قاعدة الاختبار المعزولة.',
      author: 'فريق الاختبار', coverPath: '/art/covers/warden-of-the-twilight-gate.webp',
      category: item.category, format: item.format,
    } });
    if (!await db.chapter.findFirst({ where: { seriesId: row.id, number: 1, deletedAt: null } })) await db.chapter.create({ data: {
      seriesId: row.id, number: 1, titleAr: 'الفصل الأول', workflow: item.published ? 'published' : 'draft',
      publishedAt: item.published ? new Date() : null,
    } });
  }
});
test.afterAll(async () => { await db.$disconnect(); });

test('category is independent of reading route and legacy format links survive', async ({ page }) => {
  await page.goto('/explore?category=manhwa&q=' + encodeURIComponent(items[0].title));
  await expect(page.getByRole('link', { name: new RegExp(items[0].title) })).toBeVisible();
  await page.goto('/series/' + items[0].slug);
  await expect(page.getByRole('link', { name: 'ابدأ القراءة', exact: true })).toHaveAttribute('href', `/read/manga/${items[0].slug}/1`);
  await page.goto('/explore?format=webtoon&q=' + encodeURIComponent(items[1].title));
  await expect(page.getByRole('link', { name: new RegExp(items[1].title) })).toBeVisible();
});

test('unclassified legacy work stays discoverable without becoming manhwa', async ({ page }) => {
  await page.goto('/explore?q=' + encodeURIComponent(items[2].title));
  await expect(page.getByRole('link', { name: new RegExp(items[2].title) })).toBeVisible();
  await page.goto('/explore?category=manhwa&q=' + encodeURIComponent(items[2].title));
  await expect(page.getByRole('link', { name: new RegExp(items[2].title) })).toHaveCount(0);
});

test('draft-only work is absent from category discovery', async ({ page }) => {
  await page.goto('/explore?category=comic&q=' + encodeURIComponent(items[3].title));
  await expect(page.getByRole('link', { name: new RegExp(items[3].title) })).toHaveCount(0);
});
