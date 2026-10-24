import { NextResponse } from "next/server";
import { executeDuePublications } from "@/lib/editorial";
import { currentProfileOrNull } from "@/lib/queries";
import { isAdminRole } from "@/lib/team-access";
import { withDatabaseScope } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withDatabaseScope(() => publishDue(request));
}

async function publishDue(request: Request) {
  // Check authorization via:
  // 1. Cron secret: Authorization Bearer token matching nonempty EDITORIAL_CRON_SECRET
  // 2. Or logged-in admin profile session

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const cronSecret = process.env.EDITORIAL_CRON_SECRET?.trim();

  let isAuthorizedCron = false;
  if (cronSecret && cronSecret.length > 0 && authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && (parts[0] === "Bearer" || parts[0] === "bearer")) {
      if (parts[1] === cronSecret) {
        isAuthorizedCron = true;
      }
    }
  }

  if (isAuthorizedCron) {
    // Authorized cron job executes with system: true
    const result = await executeDuePublications(20, { system: true });
    return NextResponse.json({
      ok: true,
      mode: "cron",
      publishedCount: result.publishedCount,
      errors: result.errors,
    });
  }

  // If not authorized cron, check database admin session
  const profile = await currentProfileOrNull();
  if (profile && isAdminRole(profile.role)) {
    // Normal admin via session uses no system: true
    const result = await executeDuePublications(20, { system: false });
    return NextResponse.json({
      ok: true,
      mode: "admin_session",
      publishedCount: result.publishedCount,
      errors: result.errors,
    });
  }

  // Not authorized
  return NextResponse.json(
    { ok: false, error: "غير مصرح بالوصول إلى نقطة نشر الفصول المجدولة." },
    { status: 401 }
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "عمليات التعديل والنشر غير مسموحة عبر طريقة GET." },
    { status: 405 }
  );
}
