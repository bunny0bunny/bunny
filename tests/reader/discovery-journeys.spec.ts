import { test, expect } from "@playwright/test";

test("discovery journey: search accepts typing and follows browser history", async ({ page }) => {
  await page.goto("/explore");
  const search = page.getByRole("searchbox", { name: "البحث في المكتبة", exact: true });
  await search.fill("اختبار القارئ manga");
  await expect(search).toHaveValue("اختبار القارئ manga");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("link", { name: "اختبار القارئ manga", exact: true })).toBeVisible();
  await search.fill("اختبار القارئ novel");
  await search.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("اختبار القارئ novel");
  await page.goBack();
  await expect(search).toHaveValue("اختبار القارئ manga");
  await page.getByRole("button", { name: "مسح نص البحث", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
});

test("discovery journey: work tabs and chapter search remain usable", async ({ page }) => {
  await page.goto("/series/qa-reader-manga");
  const chapters = page.getByRole("tabpanel", { name: /^الفصول/ });
  await chapters.getByRole("searchbox").fill("رحلة الاختبار 2");
  const publishedList = chapters.getByRole("list", { name: "قائمة الفصول", exact: true });
  await expect(publishedList.getByRole("listitem")).toHaveCount(1);
  await expect(publishedList.getByRole("link")).toHaveAttribute("href", "/read/manga/qa-reader-manga/2");
  await page.getByRole("tab", { name: "عن العمل", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "عن العمل", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "عن العمل", exact: true }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "التقييمات والمجتمع", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "التقييمات والمجتمع", exact: true })).toBeVisible();
});

for (const chapterNumber of [1, 6]) {
  test(`discovery journey: guest resume validates chapter ${chapterNumber} before linking`, async ({ page }) => {
    await page.addInitScript(chapterNumber => {
      localStorage.setItem("bunny.progress.v1", JSON.stringify([{
        seriesSlug: "qa-reader-manga", seriesTitle: "اختبار", chapterNumber,
        chapterTitle: "اختبار", pageIndex: 2, percent: 45, total: 5, format: "manga",
        coverPath: "", accent: "", updatedAt: Date.now(),
      }]));
    }, chapterNumber);
    const response = page.waitForResponse(r => r.url().endsWith("/api/reading-targets") && r.request().method() === "POST");
    await page.goto("/");
    const body = await (await response).json();
    const hero = page.getByRole("region", { name: "وحدة القراءة الرئيسية", exact: true });
    if (chapterNumber === 1) {
      expect(body.readable).toHaveLength(1);
      await expect(hero.getByRole("link", { name: "كمّل القراءة", exact: true })).toHaveAttribute("href", "/read/manga/qa-reader-manga/1");
    } else {
      expect(body.readable).toHaveLength(0);
      await expect(hero.getByRole("link", { name: "كمّل القراءة", exact: true })).toHaveCount(0);
    }
  });
}

test("discovery journey: typing in chapter comments does not navigate the manga reader", async ({ page }) => {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", { form: {
    csrfToken, email: "reader@bunny.demo", password: "bunny-reader-2026", json: "true",
  } });
  await page.goto("/read/manga/qa-reader-manga/1");
  await expect(page.getByRole("button", { name: "وضع القراءة العميقة", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^تعليقات الفصل/ }).click();
  const input = page.getByRole("dialog").getByRole("textbox");
  await input.fill("feedback");
  await input.press("ArrowLeft");
  await input.press("f");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/read\/manga\/qa-reader-manga\/1$/);
  await page.getByRole("dialog").getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(page.getByRole("button", { name: "وضع القراءة العميقة", exact: true })).toBeVisible();
});
