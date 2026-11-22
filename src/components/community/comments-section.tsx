"use client";

import { useSyncExternalStore, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Flag, SendHorizonal, ShieldAlert, Heart, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { deleteOwnComment, editOwnComment, loadMoreComments, postComment, reportComment, toggleCommentLike } from "@/lib/actions";
import { arabicError } from "@/lib/error-messages-ar";
import type { CommentView } from "@/lib/queries";
import { timeAgoAr as sharedTimeAgo } from "@/lib/time-ago";

/**
 * Relative Arabic time label. Deterministic two-pass rendering via
 * useSyncExternalStore: React uses the SERVER snapshot (null → empty label)
 * during hydration, so SSR HTML and the first client paint match exactly
 * (no React #418 mismatch), then upgrades to the live client snapshot
 * (refreshed every 60 s). Replaces the previous Date.now()-during-render
 * bug logged during the Neon migration QA.
 */
function subscribeMinute(callback: () => void): () => void {
  const id = setInterval(callback, 60_000);
  return () => clearInterval(id);
}
const getClientNow = (): number | null => Date.now();
const getServerNow = (): number | null => null;

function timeAgoAr(date: Date, now: number | null): string {
  return now === null ? "" : sharedTimeAgo(date, { now, precision: "day" });
}

const PAGE_SIZE = 30;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const REPORT_REASONS = ["إساءة أو كراهية", "حرق للأحداث", "رسائل مزعجة أو إعلانات", "محتوى غير لائق"];

/**
 * Community comments (Release B): public list with "load more", signed-in
 * posting, author edit (15 min) and delete, and a confirmed report flow that
 * queues the comment for moderators without hiding it.
 */
export function CommentsSection({
  seriesSlug,
  seriesTitle,
  chapterNumber,
  comments,
}: {
  seriesSlug: string;
  seriesTitle: string;
  chapterNumber?: number;
  comments: CommentView[];
}) {
  const { status, data } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [extra, setExtra] = useState<CommentView[]>([]);
  const [hasMore, setHasMore] = useState(comments.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Map<string, string>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<{ id: string; text: string } | null>(null);
  const myId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const seen = new Set<string>();
  const list = [...comments, ...extra].filter((c) => !removed.has(c.id) && !seen.has(c.id) && (seen.add(c.id), true));
  // Optimistic like state (Release E): local mirror of {liked, count} per comment.
  const [likes, setLikes] = useState<Map<string, { liked: boolean; count: number }>>(
    () => new Map(comments.map((c) => [c.id, { liked: c.likedByMe, count: c.likeCount }]))
  );
  // Hydration-safe time anchor (see timeAgoAr docstring above).
  const now = useSyncExternalStore(subscribeMinute, getClientNow, getServerNow);

  const submit = () => {
    setError("");
    if (body.trim().length < 2) {
      setError("التعليق قصير جدًا");
      return;
    }
    startTransition(async () => {
      const res = await postComment({ seriesSlug, chapterNumber: chapterNumber ?? null, body });
      if (!res.ok) {
        setError(arabicError(res.error, "تعذّر نشر التعليق"));
        return;
      }
      setBody("");
      router.refresh();
    });
  };

  const startReport = (commentId: string) => {
    if (status !== "authenticated") {
      router.push(loginHref);
      return;
    }
    setItemError(null);
    setReportReason(REPORT_REASONS[0]);
    setReportingId(commentId);
  };

  const confirmReport = (commentId: string) => {
    startTransition(async () => {
      const res = await reportComment({ commentId, reasonAr: reportReason });
      if (!res.ok) {
        setItemError({ id: commentId, text: arabicError(res.error, "تعذّر إرسال البلاغ.") });
        return;
      }
      setReported((s) => new Set(s).add(commentId));
      setReportingId(null);
    });
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const res = await loadMoreComments({ seriesSlug, chapterNumber: chapterNumber ?? null, offset: comments.length + extra.length });
    setLoadingMore(false);
    if (!res.ok) {
      setError(arabicError(res.error, "تعذّر تحميل المزيد من التعليقات."));
      return;
    }
    setExtra((prev) => [...prev, ...res.comments]);
    setHasMore(res.comments.length >= PAGE_SIZE);
  };

  const saveEdit = (commentId: string) => {
    const next = editBody.trim();
    startTransition(async () => {
      const res = await editOwnComment({ commentId, body: next });
      if (!res.ok) {
        setItemError({ id: commentId, text: arabicError(res.error, "تعذّر حفظ التعديل.") });
        return;
      }
      setEdited((m) => new Map(m).set(commentId, next));
      setEditingId(null);
      router.refresh();
    });
  };

  const removeOwn = (commentId: string) => {
    startTransition(async () => {
      const res = await deleteOwnComment({ commentId });
      if (!res.ok) {
        setItemError({ id: commentId, text: arabicError(res.error, "تعذّر حذف التعليق.") });
        return;
      }
      setRemoved((s) => new Set(s).add(commentId));
      setConfirmDeleteId(null);
      router.refresh();
    });
  };

  const toggleLike = (commentId: string) => {
    if (status !== "authenticated") {
      router.push(loginHref);
      return;
    }
    const prev = likes.get(commentId) ?? { liked: false, count: 0 };
    const next = { liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) };
    setLikes((m) => new Map(m).set(commentId, next)); // optimistic
    startTransition(async () => {
      const res = await toggleCommentLike({ commentId });
      if (!res.ok || typeof res.liked !== "boolean" || typeof res.likeCount !== "number") {
        setLikes((m) => new Map(m).set(commentId, prev)); // roll back on failure
        return;
      }
      setLikes((m) => new Map(m).set(commentId, { liked: res.liked!, count: res.likeCount! }));
    });
  };

  return (
    <section aria-label="التعليقات" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">التعليقات {list.length > 0 && <span className="text-sm font-normal text-muted-foreground">({list.length}{hasMore ? "+" : ""})</span>}</h2>
      </div>

      {status === "authenticated" ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <label htmlFor="comment-body" className="mb-2 block text-sm font-medium">
            شاركنا رأيك في «{seriesTitle}»
          </label>
          <Textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="اكتب تعليقًا محترمًا…"
            className="resize-none"
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{data?.user?.name} · يظهر تعليقك للجميع</span>
            <Button size="sm" disabled={pending} onClick={submit} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <SendHorizonal className="size-3.5" aria-hidden />
              نشر
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          <Link href={loginHref} className="text-primary hover:underline">
            سجّل الدخول
          </Link>{" "}
          للانضمام إلى النقاش.
        </p>
      )}

      <ul className="space-y-3">
        {list.map((c) => {
          const mine = myId !== null && c.author.id === myId;
          const canEdit = mine && now !== null && now - new Date(c.createdAt).getTime() < EDIT_WINDOW_MS;
          const shownBody = edited.get(c.id) ?? c.body;
          return (
          <li key={c.id} className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-start gap-3">
              <AccountAvatar seed={c.author.avatarSeed} src={c.author.avatarPath} name={c.author.nickname} className="size-9 text-sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {c.author.profileHref
                    ? <Link href={c.author.profileHref} className="text-sm font-semibold text-foreground hover:text-primary hover:underline">{c.author.nickname}</Link>
                    : <span className="text-sm font-semibold text-foreground">{c.author.nickname}</span>}
                  {c.author.role !== "reader" && (
                    <span className="flex items-center gap-1 rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold">
                      <ShieldAlert className="size-3" aria-hidden />
                      فريق بانيورا
                    </span>
                  )}
                  <time dateTime={new Date(c.createdAt).toISOString()} className="text-[11px] text-muted-foreground">{timeAgoAr(c.createdAt, now)}</time>
                  {c.chapterNumber !== null && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      عن الفصل {c.chapterNumber}
                    </span>
                  )}
                </div>
                {editingId === c.id ? (
                  <div className="mt-1.5 space-y-2">
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} maxLength={2000} aria-label="تعديل التعليق" className="resize-none" />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={pending || editBody.trim().length < 2} onClick={() => saveEdit(c.id)} className="h-9">حفظ التعديل</Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditingId(null)} className="h-9">إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{shownBody}</p>
                )}
                {(() => {
                  const likeState = likes.get(c.id) ?? { liked: c.likedByMe, count: c.likeCount };
                  return (
                    <div className="mt-2.5 flex items-center gap-1">
                      <button
                        onClick={() => toggleLike(c.id)}
                        aria-pressed={likeState.liked}
                        aria-label={likeState.liked ? "إلغاء الإعجاب بالتعليق" : "الإعجاب بالتعليق"}
                        title={likeState.liked ? "إلغاء الإعجاب" : "أعجبني"}
                        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                          likeState.liked
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                            : "border-border/70 text-muted-foreground hover:border-rose-500/30 hover:text-rose-400"
                        }`}
                      >
                        <Heart className={`size-3.5 ${likeState.liked ? "fill-rose-400" : ""}`} aria-hidden />
                        {likeState.count > 0 && <span>{likeState.count}</span>}
                      </button>
                      {canEdit && editingId !== c.id && (
                        <button onClick={() => { setItemError(null); setEditBody(shownBody); setEditingId(c.id); }} className="flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground">
                          <Pencil className="size-3.5" aria-hidden /> تعديل
                        </button>
                      )}
                      {mine && confirmDeleteId !== c.id && (
                        <button onClick={() => { setItemError(null); setConfirmDeleteId(c.id); }} className="flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-danger">
                          <Trash2 className="size-3.5" aria-hidden /> حذف
                        </button>
                      )}
                    </div>
                  );
                })()}
                {confirmDeleteId === c.id && (
                  <div role="alertdialog" aria-label="تأكيد حذف التعليق" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-2 text-xs">
                    <span className="font-medium text-danger">حذف تعليقك نهائيًا؟</span>
                    <Button size="sm" variant="destructive" disabled={pending} onClick={() => removeOwn(c.id)} className="h-9 px-3">نعم، احذف</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmDeleteId(null)} className="h-9 px-2">إلغاء</Button>
                  </div>
                )}
                {reportingId === c.id && (
                  <div role="alertdialog" aria-label="الإبلاغ عن التعليق" className="mt-2 space-y-2 rounded-xl border border-border bg-background/60 p-3 text-xs">
                    <p className="font-medium">لماذا تبلّغ عن هذا التعليق؟ سيراجعه فريق الإشراف.</p>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="سبب البلاغ">
                      {REPORT_REASONS.map((r) => (
                        <button key={r} role="radio" aria-checked={reportReason === r} onClick={() => setReportReason(r)} className={`min-h-9 rounded-full border px-3 ${reportReason === r ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>{r}</button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={pending} onClick={() => confirmReport(c.id)} className="h-9">إرسال البلاغ</Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setReportingId(null)} className="h-9">إلغاء</Button>
                    </div>
                  </div>
                )}
                {reported.has(c.id) && reportingId !== c.id && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">شكرًا، وصل بلاغك لفريق الإشراف.</p>}
                {itemError?.id === c.id && <p role="alert" className="mt-2 text-xs text-danger">{itemError.text}</p>}
              </div>
              {!mine && (
                <button
                  onClick={() => startReport(c.id)}
                  disabled={reported.has(c.id)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-danger disabled:opacity-50"
                  title={reported.has(c.id) ? "تم إرسال البلاغ" : "إبلاغ عن تعليق مخالف"}
                  aria-label="إبلاغ عن تعليق مخالف"
                >
                  <Flag className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </li>
          );
        })}
        {list.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
            لا تعليقات بعد — كن أول من يشارك رأيه.
          </li>
        )}
      </ul>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={loadMore} className="min-h-11">
            {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد من التعليقات"}
          </Button>
        </div>
      )}
    </section>
  );
}
