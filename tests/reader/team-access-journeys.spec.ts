import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { isolatedDatabaseURL } from "./qa-env.mjs";

const db = new PrismaClient({ datasources: { db: { url: isolatedDatabaseURL() } } });

const FIXTURE_SLUG = "qa-journey-work";
const CONTRIBUTOR_EMAIL = "qa-journey-contributor@bunny.demo";
const STALE_EDITOR_EMAIL = "qa-journey-stale-editor@bunny.demo";

async function loginUser(page: Page, email: string, password: string) {
  const csrf = await page.request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const res = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password, json: "true" },
  });
  expect(res.ok()).toBe(true);
  const sessionRes = await page.request.get("/api/auth/session");
  const sessionData = await sessionRes.json();
  expect(sessionData?.user?.email).toBe(email);
}

test.afterAll(async () => {
  const series = await db.series.findUnique({ where: { slug: FIXTURE_SLUG } });
  if (series) {
    await db.seriesAssignment.deleteMany({ where: { seriesId: series.id } });
    await db.chapter.deleteMany({ where: { seriesId: series.id } });
    await db.series.delete({ where: { id: series.id } });
  }
  await db.profile.deleteMany({
    where: { email: { in: [CONTRIBUTOR_EMAIL, STALE_EDITOR_EMAIL] } },
  });
  await db.$disconnect();
});

test("Journey (a): admin grants and revokes series assignment via TeamAssignmentPanel; staff observes scoped draft/review permissions", async ({
  page: adminPage,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop only authority test");

  const seedAdmin = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });

  // 1. Setup dedicated series and contributor
  const series = await db.series.upsert({
    where: { slug: FIXTURE_SLUG },
    update: { titleAr: "عمل رحلة الاختبار أ" },
    create: {
      slug: FIXTURE_SLUG,
      titleAr: "عمل رحلة الاختبار أ",
      synopsisAr: "ملخص تجريبي مخصص لاختبار رحلة الإسناد والتحقق في بيئة المتصفح الحقيقية مع فريق العمل.",
      format: "manga",
      status: "ongoing",
      author: "مؤلف تجريبي",
      genresJson: JSON.stringify(["أكشن"]),
      accent: "#9B7BFF",
      coverPath: "/art/covers/warden-of-the-twilight-gate.webp",
    },
  });

  const existingChapter = await db.chapter.findFirst({ where: { seriesId: series.id, number: 1, deletedAt: null }, select: { id: true } });
  if (existingChapter) {
    await db.chapter.update({ where: { id: existingChapter.id }, data: { workflow: "draft", isPremiumDemo: false, scheduledFor: null } });
  } else {
    await db.chapter.create({ data: {
      seriesId: series.id,
      number: 1,
      titleAr: "الفصل الأول التجريبي",
      workflow: "draft",
      isPremiumDemo: false,
      scheduledFor: null,
      readingDirection: "rtl",
    } });
  }

  const contributor = await db.profile.upsert({
    where: { email: CONTRIBUTOR_EMAIL },
    update: { role: "contributor" as any },
    create: {
      email: CONTRIBUTOR_EMAIL,
      nickname: "مساهم الرحلة",
      passwordHash: seedAdmin.passwordHash,
      role: "contributor" as any,
    },
  });

  // Ensure no initial assignment
  await db.seriesAssignment.deleteMany({
    where: { profileId: contributor.id, seriesId: series.id },
  });

  // 2. Admin logs in and assigns the series to contributor via TeamAssignmentPanel
  await loginUser(adminPage, "admin@bunny.demo", "bunny-admin-2026");
  await adminPage.goto(`/admin/series/${series.id}`);
  await expect(adminPage.getByRole("heading", { name: "عمل رحلة الاختبار أ" })).toBeVisible();

  const assignmentCheckbox = adminPage.getByLabel("إسناد العمل إلى مساهم الرحلة");
  await expect(assignmentCheckbox).toBeVisible();
  await expect(assignmentCheckbox).not.toBeChecked();

  // Click to assign
  await assignmentCheckbox.click();
  await expect(assignmentCheckbox).toBeChecked();

  // Wait for DB assignment record
  await expect
    .poll(async () => {
      return db.seriesAssignment.findUnique({
        where: { profileId_seriesId: { profileId: contributor.id, seriesId: series.id } },
      });
    })
    .not.toBeNull();

  // 3. In a separate browser context, staff logs in and verifies scoped workspace
  const staffContext = await browser.newContext();
  try {
    const staffPage = await staffContext.newPage();
    await loginUser(staffPage, CONTRIBUTOR_EMAIL, "bunny-admin-2026");

    await staffPage.goto(`/admin/series/${series.id}`);
    await expect(staffPage.getByRole("heading", { name: "عمل رحلة الاختبار أ" })).toBeVisible();

    // Staff sees draft/review controls only
    const workflowTrigger = staffPage.getByLabel("حالة سير العمل");
    await expect(workflowTrigger).toBeVisible();
    await workflowTrigger.click();

    await expect(staffPage.getByRole("option", { name: "مسودة" })).toBeVisible();
    await expect(staffPage.getByRole("option", { name: "مراجعة" })).toBeVisible();
    await expect(staffPage.getByRole("option", { name: "منشور" })).toHaveCount(0);

    // Actually select review workflow and assert DB transition
    await staffPage.getByRole("option", { name: "مراجعة" }).click();
    await expect
      .poll(async () => {
        const ch = await db.chapter.findFirst({
          where: { seriesId: series.id, number: 1, deletedAt: null },
        });
        return ch?.workflow;
      })
      .toBe("review");

    // Premium demo toggle and scheduling controls are absent for staff
    await expect(staffPage.getByTitle("قفل/فتح العرض التجريبي للفصل")).toHaveCount(0);
    await expect(staffPage.getByLabel(/جدولة نشر الفصل/)).toHaveCount(0);

    // SeriesForm metadata editing section is hidden for staff
    await expect(staffPage.getByLabel("نموذج بيانات العمل")).toHaveCount(0);

    // 4. Admin revokes assignment
    await assignmentCheckbox.click();
    await expect(assignmentCheckbox).not.toBeChecked();

    await expect
      .poll(async () => {
        return db.seriesAssignment.findUnique({
          where: { profileId_seriesId: { profileId: contributor.id, seriesId: series.id } },
        });
      })
      .toBeNull();

    // 5. Staff reloads and loses access (404 not found)
    await staffPage.goto(`/admin/series/${series.id}`);
    await expect(staffPage.getByRole("heading", { name: "هذه الرفّ فارغ" })).toBeVisible();
    await expect(staffPage.getByRole("heading", { name: "عمل رحلة الاختبار أ" })).toHaveCount(0);
    await expect(staffPage.getByText("الفصل الأول التجريبي")).toHaveCount(0);
  } finally {
    await staffContext.close();
  }
});

test("Journey (b): Stale JWT demotion immediately locks out privileged admin and studio routes", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop only authority test");

  const seedAdmin = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });

  // 1. Ensure series exists
  const series = await db.series.upsert({
    where: { slug: FIXTURE_SLUG },
    update: { titleAr: "عمل رحلة الاختبار أ" },
    create: {
      slug: FIXTURE_SLUG,
      titleAr: "عمل رحلة الاختبار أ",
      synopsisAr: "ملخص تجريبي مخصص لاختبار رحلة الإسناد والتحقق في بيئة المتصفح الحقيقية مع فريق العمل.",
      format: "manga",
      status: "ongoing",
      author: "مؤلف تجريبي",
      genresJson: JSON.stringify(["أكشن"]),
      accent: "#9B7BFF",
      coverPath: "/art/covers/warden-of-the-twilight-gate.webp",
    },
  });

  // 2. Setup editor account and initial assignment
  const staleEditor = await db.profile.upsert({
    where: { email: STALE_EDITOR_EMAIL },
    update: { role: "editor" as any },
    create: {
      email: STALE_EDITOR_EMAIL,
      nickname: "محرر مسحوب الصلاحية",
      passwordHash: seedAdmin.passwordHash,
      role: "editor" as any,
    },
  });

  await db.seriesAssignment.upsert({
    where: { profileId_seriesId: { profileId: staleEditor.id, seriesId: series.id } },
    update: {},
    create: { profileId: staleEditor.id, seriesId: series.id },
  });

  // 3. Editor logs in with valid editor credentials
  const editorContext = await browser.newContext();
  try {
    const editorPage = await editorContext.newPage();
    await loginUser(editorPage, STALE_EDITOR_EMAIL, "bunny-admin-2026");

    // Assert /api/auth/session role is editor before demotion
    const sessionBefore = await editorPage.request.get("/api/auth/session");
    const dataBefore = await sessionBefore.json();
    expect(dataBefore?.user?.role).toBe("editor");

    // Verify initial access to privileged routes
    await editorPage.goto(`/admin/series/${series.id}`);
    await expect(editorPage.getByRole("heading", { name: "عمل رحلة الاختبار أ" })).toBeVisible();

    // 4. Demote editor in the database to reader
    await db.profile.update({
      where: { id: staleEditor.id },
      data: { role: "reader" as any },
    });
    await db.seriesAssignment.deleteMany({
      where: { profileId: staleEditor.id },
    });

    // Assert /api/auth/session role is STILL "editor" (proving stale JWT cookie persists)
    const sessionAfter = await editorPage.request.get("/api/auth/session");
    const dataAfter = await sessionAfter.json();
    expect(dataAfter?.user?.role).toBe("editor");

    // 5. Existing browser context with stale JWT tries privileged pages
    // (a) Admin series detail
    await editorPage.goto(`/admin/series/${series.id}`);
    await expect(editorPage.getByText("لا تملك صلاحية الوصول")).toBeVisible();

    // (b) Admin chapters list
    await editorPage.goto("/admin/chapters");
    await expect(editorPage.getByText("لا تملك صلاحية الوصول")).toBeVisible();

    // (c) Creator Studio
    await editorPage.goto("/studio");
    await expect(editorPage).toHaveURL(/admin.*denied=1/);
    await expect(editorPage.getByText("لا تملك صلاحية الوصول")).toBeVisible();
  } finally {
    await editorContext.close();
  }
});
