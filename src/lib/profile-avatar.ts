import "server-only";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db, withDatabaseScope } from "@/lib/db";
import { withSerializableTx, type EditorialResult } from "@/lib/editorial";
import { getTrustedAppOrigin } from "@/lib/account-mail";
import { getMediaStorage } from "@/lib/media/storage";
import { sniffPage } from "@/lib/media/formats";
import { readIdentityAvatar } from "@/lib/public-identities/avatar-policy";
import { profileAvatarKey, profileAvatarPath } from "./profile-avatar-policy";

const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function respond(result: EditorialResult): Response {
  if (result.ok) return Response.json({ ok: true, ...((result.data as object) ?? {}) }, { headers: responseHeaders });
  const error = result.error ?? "unavailable";
  const status = error === "unauthenticated" ? 401 : error === "forbidden" ? 403 : error === "not_found" || error === "disabled" ? 404 : error === "rate_limit" ? 429 : error === "storage_failed" || error === "unavailable" ? 503 : 400;
  return Response.json({ ok: false, error }, { status, headers: responseHeaders });
}
function invalidate() {
  try {
    for (const route of ["/profile", "/admin/users", "/admin/moderation"]) revalidatePath(route);
    revalidatePath("/series/[slug]", "page");
  } catch { /* No cache context in tests. */ }
}
async function reserve(tx: Prisma.TransactionClient, actorId: string) {
  // Separate bucket from team logos so one never spends the other's quota.
  const windowMs = 3600000, bucket = Math.floor(Date.now() / windowMs), keyHash = `profile-avatar:${actorId}:${bucket}`;
  const previous = await tx.accountRateLimit.findUnique({ where: { keyHash } });
  if ((previous?.count ?? 0) >= 10) return false;
  await tx.accountRateLimit.upsert({ where: { keyHash }, create: { keyHash, count: 1, windowEnd: new Date((bucket + 1) * windowMs) }, update: { count: { increment: 1 } } });
  return true;
}
async function deleteQuietly(key: string | null) {
  if (!key) return;
  try { await (await getMediaStorage()).deleteObject(key); } catch { /* A cleanup outage never undoes a committed change. */ }
}

/** The signed-in reader changes or removes their own picture. Checks precede body buffering; the profile is rechecked after storage. */
export async function changeOwnProfileAvatar(request: Request, remove = false): Promise<Response> {
  try {
    if (request.headers.get("origin") !== getTrustedAppOrigin() || request.headers.get("x-profile-avatar") !== "1") return respond({ ok: false, error: "forbidden" });
    if (!remove && process.env.MEDIA_UPLOADS_ENABLED !== "1") return respond({ ok: false, error: "disabled" });
    return await withDatabaseScope(async () => {
      let profileId = "";
      const check = await withSerializableTx(async (tx, actor) => {
        if (!actor.id) return { ok: false, error: "unauthenticated" };
        profileId = actor.id;
        if (!remove && !(await reserve(tx, actor.id))) return { ok: false, error: "rate_limit" };
        return { ok: true };
      }, { invalidate: false });
      if (!check.ok) return respond(check);
      let key: string | null = null;
      if (!remove) {
        if (request.headers.get("content-type")?.split(";")[0] !== "image/webp") return respond({ ok: false, error: "invalid_image" });
        let bytes: Uint8Array;
        try {
          bytes = await readIdentityAvatar(request);
          const image = sniffPage(bytes);
          if (image.mime !== "image/webp" || image.width !== image.height || image.width > 512) throw Error("invalid_image");
        } catch (error) { return respond({ ok: false, error: error instanceof Error && error.message === "invalid_length" ? "invalid_length" : "invalid_image" }); }
        key = profileAvatarKey(profileId, `${crypto.randomUUID()}.webp`, process.env.MEDIA_STORAGE_PREFIX || "prod");
        try { await (await getMediaStorage()).putPage(key, bytes, "image/webp"); } catch { return respond({ ok: false, error: "storage_failed" }); }
      }
      let oldKey: string | null = null;
      const saved = await withSerializableTx(async (tx, actor) => {
        if (actor.id !== profileId) return { ok: false, error: "unauthenticated" };
        const current = await tx.profile.findUnique({ where: { id: profileId }, select: { avatarKey: true } });
        if (!current) return { ok: false, error: "not_found" };
        oldKey = current.avatarKey;
        if (remove && !oldKey) return { ok: true, data: { avatarPath: null } };
        await tx.profile.update({ where: { id: profileId }, data: { avatarKey: key } });
        await tx.accountAudit.create({ data: { actorId: profileId, targetId: profileId, action: remove ? "profile_avatar_removed" : "profile_avatar_changed", metadata: {} } });
        return { ok: true, data: { avatarPath: profileAvatarPath(profileId, key) } };
      }, { invalidate: false });
      if (!saved.ok) { if (key) await deleteQuietly(key); return respond(saved); }
      if (oldKey && oldKey !== key && profileAvatarPath(profileId, oldKey)) await deleteQuietly(oldKey);
      invalidate();
      return respond(saved);
    });
  } catch { return respond({ ok: false, error: "unavailable" }); }
}

/** Admin moderation: remove someone's uploaded picture. Their preset or initials show instead. */
export async function removeProfileAvatarAsAdmin(targetId: string): Promise<EditorialResult> {
  if (typeof targetId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,95}$/.test(targetId)) return { ok: false, error: "invalid_input" };
  let oldKey: string | null = null;
  const result = await withSerializableTx(async (tx, actor) => {
    if (actor.role !== "admin" || !actor.id) return { ok: false, error: "forbidden" };
    const target = await tx.profile.findUnique({ where: { id: targetId }, select: { avatarKey: true } });
    if (!target) return { ok: false, error: "not_found" };
    oldKey = target.avatarKey;
    if (!oldKey) return { ok: true };
    await tx.profile.update({ where: { id: targetId }, data: { avatarKey: null } });
    await tx.accountAudit.create({ data: { actorId: actor.id, targetId, action: "profile_avatar_removed_by_admin", metadata: {} } });
    return { ok: true };
  }, { invalidate: false });
  if (result.ok && oldKey && profileAvatarPath(targetId, oldKey)) { await deleteQuietly(oldKey); invalidate(); }
  return result;
}

/** Serves only the current picture of an active account, through a short-lived signed URL. */
export async function getProfileAvatar(profileId: string, file: string): Promise<Response> {
  try {
    return await withDatabaseScope(async () => {
      const missing = new Response(null, { status: 404, headers: responseHeaders });
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,95}$/.test(profileId)) return missing;
      const profile = await db.profile.findUnique({ where: { id: profileId }, select: { disabledAt: true, avatarKey: true } });
      if (!profile || profile.disabledAt || profileAvatarPath(profileId, profile.avatarKey) !== `/api/profile-avatars/${profileId}/${file}`) return missing;
      const expected = profileAvatarKey(profileId, file, process.env.MEDIA_STORAGE_PREFIX || "prod");
      if (profile.avatarKey !== expected) return missing;
      const location = await (await getMediaStorage()).signGet(expected, { expiresIn: 300 });
      // A page of comments shows many avatars; let the browser reuse the redirect while the signature is valid.
      return new Response(null, { status: 307, headers: { "Cache-Control": "private, max-age=240", "X-Content-Type-Options": "nosniff", Location: location } });
    });
  } catch { return new Response(null, { status: 503, headers: responseHeaders }); }
}
