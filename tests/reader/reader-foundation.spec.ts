import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { isolatedDatabaseURL } from "./qa-env.mjs";

const db = new PrismaClient({ datasources: { db: { url: isolatedDatabaseURL() } } });
test.afterAll(async () => { await db.$disconnect(); });
const key = "bunny.progress.v1";
function record(format = "manga", overrides: Record<string, unknown> = {}) {
  return { seriesSlug: `qa-reader-${format}`, seriesTitle: "اختبار", chapterNumber: 1, chapterTitle: "اختبار",
    pageIndex: 2, percent: 45, total: 5, format, coverPath: "", accent: "", updatedAt: Date.now() - 10000, ...overrides };
}
async function preload(page: Page, raw: string, font = "26") {
  await page.addInitScript(({ key, raw, font }) => {
    if (!sessionStorage.getItem("reader-qa-initialized")) {
      localStorage.setItem(key, raw);
      localStorage.setItem("bunny.novel.fontSize.v1", font);
      sessionStorage.setItem("reader-qa-initialized", "1");
    }
  }, { key, raw, font });
}
async function local(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), key);
}
async function sessionReady(page: Page) {
  await expect(page.getByRole("button", { name: "وضع القراءة العميقة", exact: true })).toBeVisible();
  const path = new URL(page.url()).pathname.split("/");
  const visitStarted = await page.evaluate(() => Math.floor(performance.timeOrigin));
  await expect.poll(async () => {
    // A preloaded row is not evidence that session-gated persistence has run.
    try { return (await local(page)).some((p: {seriesSlug: string; chapterNumber: number; updatedAt: number}) => p.seriesSlug === path[3] && p.chapterNumber === Number(path[4]) && p.updatedAt >= visitStarted); }
    catch { return false; }
  }, { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(300);
}
async function advanceManga(page: Page) {
  const next = page.getByRole("button", { name: "الصفحة التالية", exact: true });
  if ((page.viewportSize()?.width ?? 1280) < 640) await next.tap();
  else await next.click();
}

test("manga: footer controls fit the viewport with usable buttons, slider and immersive mode", async ({ page }, info) => {
  await preload(page, JSON.stringify([record()]));
  await page.goto("/read/manga/qa-reader-manga/1");
  await sessionReady(page);
  const prev = page.getByRole("button", { name: "الصفحة السابقة", exact: true });
  const next = page.getByRole("button", { name: "الصفحة التالية", exact: true });
  const direction = page.getByRole("button", { name: /^اتجاه القراءة الحالي:/ });
  const slider = page.getByRole("slider", { name: "التنقل بين الصفحات", exact: true });
  const counter = page.getByText("3 / 5", { exact: true });
  const viewport = page.viewportSize()!;
  for (const control of [prev, direction, next, slider, counter]) {
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    if (info.project.name === "mobile" && control !== counter) expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const nextBox = (await next.boundingBox())!;
  const sliderBox = (await slider.boundingBox())!;
  if (info.project.name === "mobile") expect(sliderBox.y).toBeGreaterThanOrEqual(nextBox.y + nextBox.height);
  else expect(Math.abs(sliderBox.y + sliderBox.height / 2 - nextBox.y - nextBox.height / 2)).toBeLessThan(1);
  await advanceManga(page);
  await expect(page.getByRole("img", { name: "صفحة 4 من 5", exact: true })).toBeVisible();
  if (info.project.name === "mobile") await prev.tap(); else await prev.click();
  await expect(page.getByRole("img", { name: "صفحة 3 من 5", exact: true })).toBeVisible();
  if (info.project.name === "mobile") await direction.tap(); else await direction.click();
  await expect(direction).toHaveAttribute("aria-label", "اتجاه القراءة الحالي: من اليسار لليمين. اضغط للتبديل.");
  const position = { x: sliderBox.width * 0.75, y: sliderBox.height / 2 };
  if (info.project.name === "mobile") await slider.tap({ position }); else await slider.click({ position });
  await expect(page.getByRole("img", { name: "صفحة 4 من 5", exact: true })).toBeVisible();
  await expect(page.getByText("4 / 5", { exact: true })).toBeVisible();
  // Native range keys must move once, without the reader shortcut also firing.
  await slider.press("ArrowLeft");
  await expect(page.getByRole("img", { name: "صفحة 3 من 5", exact: true })).toBeVisible();
  await slider.press("ArrowRight");
  await expect(page.getByRole("img", { name: "صفحة 4 من 5", exact: true })).toBeVisible();
  await slider.blur();
  await page.locator("body").press("ArrowLeft");
  await expect(page.getByRole("img", { name: "صفحة 3 من 5", exact: true })).toBeVisible();
  await page.locator("body").press("ArrowRight");
  await expect(page.getByRole("img", { name: "صفحة 4 من 5", exact: true })).toBeVisible();
  await page.screenshot({ path: `${process.env.READER_QA_RUN_DIR}/manga-footer-${info.project.name}.png` });
  await page.getByRole("button", { name: "وضع القراءة العميقة", exact: true }).click();
  await expect.poll(async () => (await next.boundingBox())!.y).toBeGreaterThanOrEqual(viewport.height);
  await page.getByRole("button", { name: "إظهار أدوات القراءة", exact: true }).last().click();
  await expect.poll(async () => (await next.boundingBox())!.y + (await next.boundingBox())!.height).toBeLessThanOrEqual(viewport.height);
});

test("manga: edge tap advances the page and center tap toggles reader tools", async ({ page }) => {
  await page.goto("/read/manga/qa-reader-manga/1");
  await sessionReady(page);
  const image = page.getByRole("region", { name: "منطقة تقليب صفحات المانجا", exact: true });
  if ((page.viewportSize()?.width ?? 1280) < 640) await image.tap({ position: { x: 30, y: 100 } });
  else await image.click({ position: { x: 30, y: 100 } });
  await expect(page.getByRole("img", { name: "صفحة 2 من 5", exact: true })).toBeVisible();
  const box = await image.boundingBox();
  expect(box).not.toBeNull();
  const center = { x: box!.width / 2, y: 100 };
  if ((page.viewportSize()?.width ?? 1280) < 640) await image.tap({ position: center });
  else await image.click({ position: center });
  await expect(page.getByRole("button", { name: "إظهار أدوات القراءة", exact: true }).last()).toBeVisible();
  await expect(page.getByRole("img", { name: "صفحة 2 من 5", exact: true })).toBeVisible();
});
async function ratio(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollTop / (el.scrollHeight - el.clientHeight) * 100;
  });
}
async function expectRatio(page: Page, target: number) {
  await expect.poll(async () => Math.abs(await ratio(page) - target)).toBeLessThan(3);
}
async function scrollTo(page: Page, percent: number) {
  await page.evaluate(percent => { const el = document.documentElement; window.scrollTo(0, (el.scrollHeight - el.clientHeight) * percent / 100); }, percent);
}
async function login(page: Page) {
  // Real credentials authentication; APIRequestContext shares browser cookies.
  const csrf = await page.request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const response = await page.request.post("/api/auth/callback/credentials", { form: {
    csrfToken, email: "reader@bunny.demo", password: "bunny-reader-2026", json: "true",
  } });
  expect(response.ok()).toBe(true);
  const session = await page.request.get("/api/auth/session");
  expect((await session.json()).user.email).toBe("reader@bunny.demo");
  await page.goto("/login", { waitUntil: "domcontentloaded" });
}
async function serverProgress(format: string, pageIndex = 3, percent = 65, updatedAt = new Date(Date.now() - 5000)) {
  const profile = await db.profile.findUniqueOrThrow({ where: { email: "reader@bunny.demo" } });
  const series = await db.series.findUniqueOrThrow({ where: { slug: `qa-reader-${format}` } });
  const chapter = await db.chapter.findUniqueOrThrow({ where: { seriesId_number: { seriesId: series.id, number: 1 } } });
  await db.readingProgress.upsert({ where: { profileId_chapterId: { profileId: profile.id, chapterId: chapter.id } },
    create: { profileId: profile.id, seriesId: series.id, chapterId: chapter.id, pageIndex, percent, updatedAt },
    update: { pageIndex, percent, updatedAt } });
  return { profile, series, chapter };
}

for (const format of ["manga", "webtoon", "novel"]) {
  test(`${format}: siblings stay in their series and exclude future/draft/other-only chapters`, async ({ page }) => {
    await page.goto(`/read/${format}/qa-reader-${format}/1`);
    await sessionReady(page);
    if (format === "manga") for (let i = 0; i < 4; i++) await advanceManga(page);
    const next = page.getByRole("link", { name: "الفصل التالي (2)", exact: true });
    await expect(next).toHaveAttribute("href", `/read/${format}/qa-reader-${format}/2`);
    await next.click();
    await expect(page).toHaveURL(`/read/${format}/qa-reader-${format}/2`);
    if (format === "manga") await expect(page.getByRole("img", { name: "صفحة 1 من 5", exact: true })).toBeVisible();
    if (format === "manga") for (let i = 0; i < 4; i++) await advanceManga(page);
    await expect(page.getByRole("link", { name: "الفصل السابق (1)", exact: true })).toHaveAttribute("href", `/read/${format}/qa-reader-${format}/1`);
    await expect(page.getByRole("link", { name: "الفصل التالي — مقفل", exact: true })).toHaveAttribute("href", `/read/${format}/qa-reader-${format}/8`);
    for (const number of [3, 4]) {
      await page.goto(`/read/${format}/qa-reader-${format}/${number}`);
      await expect(page.getByRole("heading", { name: "هذه الرفّ فارغ", exact: true })).toBeVisible();
      await expect(page.getByRole("main", { name: format === "novel" ? "نص الفصل" : format === "manga" ? "صفحات الفصل" : "لوحات الفصل" })).toHaveCount(0);
    }
  });
  test(`${format}: homepage updates open the appropriate reader`, async ({ page }) => {
    await page.goto("/");
    const update = page.locator('[role="listitem"]').filter({ hasText: `اختبار القارئ ${format}` }).filter({ hasText: "الفصل 1 —" });
    await expect(update).toHaveAttribute("href", `/read/${format}/qa-reader-${format}/1`);
    await update.click();
    await expect(page.getByRole("main", { name: format === "novel" ? "نص الفصل" : format === "manga" ? "صفحات الفصل" : "لوحات الفصل" })).toBeVisible();
  });
  test(`${format}: locked content preserves local and server progress`, async ({ page }) => {
    const { profile, series } = await serverProgress(format);
    const chapter = await db.chapter.findUniqueOrThrow({ where: { seriesId_number: { seriesId: series.id, number: 8 } } });
    await db.readingProgress.deleteMany({ where: { profileId: profile.id, chapterId: chapter.id } });
    await login(page);
    const raw = JSON.stringify([record(format, { chapterNumber: 8 })]);
    await page.evaluate(({key,raw}) => localStorage.setItem(key, raw), {key,raw});
    await page.goto(`/read/${format}/qa-reader-${format}/8`);
    await expect(page.getByRole("heading", { name: "فصل تجريبي مقفل" })).toBeVisible();
    await page.waitForTimeout(3000);
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
    expect(await db.readingProgress.count({ where: { profileId: profile.id, chapterId: chapter.id } })).toBe(0);
  });
  test(`${format}: empty content does not persist progress`, async ({ page }) => {
    await preload(page, "[]");
    await page.goto(`/read/${format}/qa-reader-${format}/10`);
    await expect(page.getByRole("heading", { name: "محتوى الفصل غير متاح بعد", exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await scrollTo(page, 100);
    await page.waitForTimeout(500);
    expect(await local(page)).toEqual([]);
  });
}
test("manga: guest page 3 survives delayed session, reload and advancement", async ({ page }, info) => {
  await preload(page, JSON.stringify([record()]));
  await page.route("**/api/auth/session", async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
  await page.goto("/read/manga/qa-reader-manga/1");
  await expect(page.getByRole("img", { name: "صفحة 3 من 5", exact: true })).toBeVisible();
  await sessionReady(page);
  expect((await local(page))[0].pageIndex).toBe(2);
  await page.reload();
  await expect(page.getByRole("img", { name: "صفحة 3 من 5", exact: true })).toBeVisible();
  await sessionReady(page);
  await page.screenshot({ path: `${process.env.READER_QA_RUN_DIR}/manga-${info.project.name}.png` });
  await advanceManga(page);
  await expect.poll(async () => (await local(page))[0].pageIndex).toBe(3);
});
for (const [name, raw] of [
  ["invalid JSON", "{"], ["null row", "[null]"],
  ["wrong chapter", JSON.stringify([record("manga", { chapterNumber: 2 })])],
  ["wrong format", JSON.stringify([record("novel", { seriesSlug: "qa-reader-manga" })])],
  ["negative page", JSON.stringify([record("manga", { pageIndex: -1 })])],
  ["fractional page", JSON.stringify([record("manga", { pageIndex: 1.5 })])],
  ["invalid percent", JSON.stringify([record("manga", { percent: 101 })])],
  ["invalid timestamp", JSON.stringify([record("manga", { updatedAt: "yesterday" })])],
  ["string page", JSON.stringify([record("manga", { pageIndex: "2" })])],
] as const) {
  test(`manga: ${name} falls back to usable page 1`, async ({ page }) => {
    await preload(page, raw);
    await page.goto("/read/manga/qa-reader-manga/1");
    await sessionReady(page);
    await expect(page.getByRole("img", { name: "صفحة 1 من 5", exact: true })).toBeVisible();
    await advanceManga(page);
    await expect(page.getByRole("img", { name: "صفحة 2 من 5", exact: true })).toBeVisible();
  });
}
test("manga: shortened chapter clamps an eligible page", async ({ page }) => {
  await preload(page, JSON.stringify([record("manga", { pageIndex: 9, total: 12 })]));
  await page.goto("/read/manga/qa-reader-manga/1");
  await expect(page.getByRole("img", { name: "صفحة 5 من 5", exact: true })).toBeVisible();
});
for (const scenario of ["empty local", "newer server", "newer local", "ineligible newer local"]) {
  test(`manga: authenticated resume selects ${scenario}`, async ({ page }) => {
    await login(page);
    const { profile, chapter } = await serverProgress("manga", 3, 80, new Date(Date.now() - 5000));
    await page.route("**/api/auth/session", async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
    const raw = scenario === "empty local" ? "[]" : JSON.stringify([record("manga", {
      pageIndex: 2, updatedAt: Date.now() - (scenario === "newer server" ? 20000 : 1000),
      chapterNumber: scenario === "ineligible newer local" ? 2 : 1,
    })]);
    await page.evaluate(({key,raw}) => localStorage.setItem(key, raw), {key,raw});
    await page.goto("/read/manga/qa-reader-manga/1");
    await expect(page.getByRole("img", { name: scenario === "newer local" ? "صفحة 3 من 5" : "صفحة 4 من 5", exact: true })).toBeVisible();
    await sessionReady(page);
    expect((await local(page))[0].pageIndex).toBe(scenario === "newer local" ? 2 : 3);
    await expect.poll(async () => (await db.readingProgress.findUniqueOrThrow({ where: { profileId_chapterId: { profileId: profile.id, chapterId: chapter.id } } })).pageIndex)
      .toBe(scenario === "newer local" ? 2 : 3);
  });
}
for (const format of ["webtoon", "novel"]) {
  test(`${format}: guest 45% resumes after font/layout, reloads, and allows subsequent scrolling`, async ({ page }, info) => {
    await preload(page, JSON.stringify([record(format)]));
    await page.route("**/api/auth/session", async route => { await new Promise(r => setTimeout(r, 1200)); await route.continue(); });
    await page.goto(`/read/${format}/qa-reader-${format}/1`);
    await expectRatio(page, 45);
    if (format === "novel") await expect(page.locator('article > div').first()).toHaveCSS("font-size", "26px");
    await sessionReady(page);
    expect((await local(page))[0].percent).toBeCloseTo(45, 0);
    await page.screenshot({ path: `${process.env.READER_QA_RUN_DIR}/${format}-${info.project.name}.png` });
    await page.reload();
    await expectRatio(page, 45);
    await sessionReady(page);
    await page.waitForTimeout(2700);
    await scrollTo(page, 70);
    await expect.poll(async () => Math.abs((await local(page))[0].percent - 70)).toBeLessThan(3);
    await page.waitForTimeout(1000);
    await expectRatio(page, 70);
    await page.getByRole("link", { name: "الفصل التالي (2)", exact: true }).click();
    await expect(page).toHaveURL(`/read/${format}/qa-reader-${format}/2`);
    await sessionReady(page);
    expect(await ratio(page)).toBeLessThan(3);
  });
  test(`${format}: authenticated resume with empty local storage`, async ({ page }) => {
    await serverProgress(format, 0, 45);
    await login(page);
    await page.evaluate(key => localStorage.removeItem(key), key);
    await page.goto(`/read/${format}/qa-reader-${format}/1`);
    await expectRatio(page, 45);
    await sessionReady(page);
    expect((await local(page))[0].percent).toBeCloseTo(45, 0);
  });
}

for (const format of ["manga", "webtoon", "novel"]) {
  test(`${format}: stalled session restores before release, preserves movement, and blocks writes`, async ({ page }) => {
    await login(page);
    const { profile, chapter } = await serverProgress(format, 2, 45);
    const raw = JSON.stringify([record(format, { updatedAt: Date.now() - 20000 })]);
    await page.evaluate(({key,raw}) => {
      localStorage.setItem(key, raw);
      localStorage.setItem("bunny.novel.fontSize.v1", "26");
    }, {key,raw});
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let sessionRequested = false;
    await page.route("**/api/auth/session", async route => {
      sessionRequested = true;
      await held;
      if (!page.isClosed()) await route.continue();
    });
    const server = () => db.readingProgress.findUniqueOrThrow({ where: { profileId_chapterId: { profileId: profile.id, chapterId: chapter.id } } });
    try {
      await page.goto(`/read/${format}/qa-reader-${format}/1`);
      await expect.poll(() => sessionRequested).toBe(true);
      if (format === "manga") {
        await expect(page.getByRole("img", { name: "صفحة 3 من 5", exact: true })).toBeVisible({ timeout: 5000 });
        await advanceManga(page);
        await expect(page.getByRole("img", { name: "صفحة 4 من 5", exact: true })).toBeVisible();
      } else {
        await expect.poll(async () => Math.abs(await ratio(page) - 45), { timeout: 5000 }).toBeLessThan(3);
        await scrollTo(page, 70);
        await expectRatio(page, 70);
      }
      await page.waitForTimeout(400);
      expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
      expect(await server()).toMatchObject({ pageIndex: 2, percent: 45 });
      const resolved = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/session");
      release();
      await resolved;
      if (format === "manga") {
        await expect(page.getByRole("img", { name: "صفحة 4 من 5", exact: true })).toBeVisible();
        await expect.poll(async () => (await local(page))[0].pageIndex).toBe(3);
        await expect.poll(async () => (await server()).pageIndex).toBe(3);
        await advanceManga(page);
        await expect.poll(async () => (await server()).pageIndex).toBe(4);
      } else {
        await expectRatio(page, 70);
        await expect.poll(async () => Math.abs((await local(page))[0].percent - 70)).toBeLessThan(3);
        await page.waitForTimeout(2700);
        await scrollTo(page, 75);
        await expect.poll(async () => Math.abs((await server()).percent - 75)).toBeLessThan(3);
      }
    } finally { release(); }
  });
}
