import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { isolatedDatabaseURL } from "./qa-env.mjs";

const db = new PrismaClient({ datasources: { db: { url: isolatedDatabaseURL() } } });
test.afterAll(async () => { await db.$disconnect(); });

async function prepare(page: Page, slug = "qa-reader-other") {
  const profile = await db.profile.findUniqueOrThrow({ where: { email: "reader@bunny.demo" } });
  const series = await db.series.findUniqueOrThrow({ where: { slug } });
  await db.libraryItem.upsert({ where: { profileId_seriesId: { profileId: profile.id, seriesId: series.id } },
    create: { profileId: profile.id, seriesId: series.id, shelf: "reading" }, update: { shelf: "reading" } });
  await db.readingProgress.deleteMany({ where: { profileId: profile.id, seriesId: series.id } });
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", { form: {
    csrfToken, email: "reader@bunny.demo", password: "bunny-reader-2026", json: "true",
  } });
  return { profile, series };
}

test("library experience: search, shelf moves and failed removal preserve actual saved state", async ({ page }) => {
  const { profile, series } = await prepare(page);
  await page.goto("/library?q=عمل%20آخر");
  await expect(page.getByRole("link", { name: "عمل آخر", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "إدارة عمل آخر", exact: true }).click();
  await page.getByRole("menuitem", { name: "نقل إلى: أنهيتها", exact: true }).click();
  await expect.poll(async () => (await db.libraryItem.findUnique({ where: { profileId_seriesId: { profileId: profile.id, seriesId: series.id } } }))?.shelf).toBe("finished");
  await page.getByRole("navigation", { name: "أرفف المكتبة", exact: true }).getByRole("link", { name: /^أنهيتها/ }).click();
  await expect(page).toHaveURL(/tab=finished/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("عمل آخر");
  await expect(page.getByRole("link", { name: "عمل آخر", exact: true })).toBeVisible();
  await page.route("**/library?**", async route => {
    if (route.request().headers()["next-action"]) await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "إدارة عمل آخر", exact: true }).click();
  await page.getByRole("menuitem", { name: "إزالة من المكتبة", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "تعذّر حفظ التغيير" })).toBeVisible();
  expect(await db.libraryItem.findUnique({ where: { profileId_seriesId: { profileId: profile.id, seriesId: series.id } } })).not.toBeNull();
  await page.unroute("**/library?**");
  await page.getByRole("button", { name: "إدارة عمل آخر", exact: true }).click();
  await page.getByRole("menuitem", { name: "إزالة من المكتبة", exact: true }).click();
  await expect.poll(() => db.libraryItem.count({ where: { profileId: profile.id, seriesId: series.id } })).toBe(0);
  await expect(page.getByRole("link", { name: "عمل آخر", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("library experience: updates distinguish old unread chapters and marking a work read persists", async ({ page }) => {
  const { profile, series } = await prepare(page);
  await page.goto("/updates?tab=unread");
  const old = page.locator("li").filter({ has: page.locator('a[href="/read/manga/qa-reader-other/7"]') });
  await expect(old).toBeVisible();
  await expect(old.getByText("جديد", { exact: true })).toHaveCount(0);
  await expect(page.locator('a[href="/read/manga/qa-reader-other/7"]').first()).toBeVisible();
  await page.goto("/library?q=عمل%20آخر");
  await page.getByRole("button", { name: "إدارة عمل آخر", exact: true }).click();
  await page.getByRole("menuitem", { name: "تعليم الكل كمقروء", exact: true }).click();
  await expect.poll(() => db.readingProgress.count({ where: { profileId: profile.id, seriesId: series.id, completed: true } })).toBe(3);
  await page.goto("/updates?tab=unread");
  await expect(page.locator('a[href="/read/manga/qa-reader-other/7"]')).toHaveCount(0);
  await page.goto("/updates");
  await expect(page.locator("li").filter({ has: page.locator('a[href="/read/manga/qa-reader-other/7"]') }).getByText("تمت القراءة", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await db.libraryItem.deleteMany({ where: { profileId: profile.id, seriesId: series.id } });
});

test("library experience: resume selects saved public incomplete progress and excludes draft and locked targets", async ({ page }) => {
  const { profile, series } = await prepare(page, "qa-reader-novel");
  for (const [number, percent] of [[1, 42], [2, 99.5], [4, 75], [8, 80]]) {
    const chapter = await db.chapter.findFirstOrThrow({ where: { seriesId: series.id, number, deletedAt: null } });
    await db.readingProgress.create({ data: { profileId: profile.id, seriesId: series.id, chapterId: chapter.id, percent, pageIndex: 0, completed: false } });
  }
  await page.goto("/library");
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/1"]').first()).toBeVisible();
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/2"]')).toHaveCount(0);
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/4"]')).toHaveCount(0);
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/8"]')).toHaveCount(0);
  await page.goto("/updates");
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/3"]')).toHaveCount(0);
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/4"]')).toHaveCount(0);
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/8"]').first()).toBeVisible();
  await expect(page.locator("li").filter({ has: page.locator('a[href="/read/novel/qa-reader-novel/2"]') }).getByText("تمت القراءة", { exact: true })).toBeVisible();
  await db.libraryItem.update({ where: { profileId_seriesId: { profileId: profile.id, seriesId: series.id } }, data: { shelf: "plan" } });
  await page.goto("/library?tab=reading");
  await expect(page.locator('a[href="/read/novel/qa-reader-novel/1"]')).toHaveCount(0);
  await db.readingProgress.deleteMany({ where: { profileId: profile.id, seriesId: series.id } });
  await db.libraryItem.deleteMany({ where: { profileId: profile.id, seriesId: series.id } });
});

test("library experience: notifications reject another reader's id and only change state after a successful save", async ({ page }) => {
  const { profile, series } = await prepare(page);
  const other = await db.profile.findFirstOrThrow({ where: { id: { not: profile.id } } });
  const own = await db.notification.create({ data: { profileId: profile.id, type: "system", titleAr: "إشعار اختبار الملكية", href: "/library" } });
  const foreign = await db.notification.create({ data: { profileId: other.id, type: "system", titleAr: "إشعار حساب آخر" } });
  try {
    await page.goto("/notifications");
    await page.route("**/notifications", async route => {
      const body = route.request().postData();
      if (route.request().headers()["next-action"] && body?.includes(own.id)) {
        await route.continue({ postData: body.replaceAll(own.id, foreign.id) });
      } else await route.continue();
    });
    await page.getByRole("button", { name: /إشعار اختبار الملكية/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "تعذّر تحديث الإشعار" })).toBeVisible();
    expect((await db.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt).toBeNull();
    expect((await db.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt).toBeNull();
    await page.unroute("**/notifications");
    await page.getByRole("button", { name: /إشعار اختبار الملكية/ }).click();
    await expect(page).toHaveURL("/library");
    expect((await db.notification.findUniqueOrThrow({ where: { id: own.id } })).readAt).not.toBeNull();
  } finally {
    await db.notification.deleteMany({ where: { id: { in: [own.id, foreign.id] } } });
    await db.libraryItem.deleteMany({ where: { profileId: profile.id, seriesId: series.id } });
  }
});
