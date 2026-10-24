"use client";

import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useSessionTextDraft } from "@/hooks/use-session-text-draft";
import { createSubmissionGate } from "@/lib/unsaved-text";
import { useId, useRef, useState, useTransition } from "react";
import type { ChapterRevision } from '@prisma/client';
import { PdfUploadPanel } from "./pdf-upload-panel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Eye,
  Send,
  Calendar,
  Lock,
  Layers,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Loader2,
  CalendarClock,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  updateDraftSnapshotAction,
  submitForReviewAction,
  returnForChangesAction,
  recommendApprovalAction,
  approveRevisionAction,
  publishRevisionNowAction,
  scheduleRevisionAction,
  cancelScheduledRevisionAction,
  withdrawPublishedChapterAction,
  openOrCreateDraftAction,
} from "@/lib/editorial-actions";

type PageItem = {
  pageIndex: number;
  imagePath: string;
  width: number;
  height: number;
};

export type WorkingRevision = {
  id: string;
  chapterId: string;
  revisionNumber: number;
  version: number;
  pendingUploadId?: string | null;
  status: "draft" | "review" | "changes_requested" | "approved" | "scheduled" | "published" | "withdrawn";
  titleAr: string;
  readingDirection: "rtl" | "ltr";
  isPremiumDemo: boolean;
  novelBody: string | null;
  pagesJson: any;
  scheduledFor: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toWorkingRevision(revision: ChapterRevision): WorkingRevision {
  const iso = (value: Date | string | null) => typeof value === 'string' ? value : value?.toISOString() ?? null;
  return { ...revision, createdAt: iso(revision.createdAt)!, updatedAt: iso(revision.updatedAt)!, scheduledFor: iso(revision.scheduledFor), approvedAt: iso(revision.approvedAt) };
}

type PublishedRevision = {
  id: string;
  revisionNumber: number;
  version: number;
  titleAr: string;
  novelBody: string | null;
  pagesJson: any;
  publishedAt: string | null;
} | null;

type EditorialEvent = {
  id: string;
  action: string;
  reasonAr: string | null;
  createdAt: string;
  actorName: string;
  metadata?: any;
};

type ChapterMeta = {
  id: string;
  number: number;
  titleAr: string;
  seriesId: string;
  seriesTitleAr: string;
  seriesSlug: string;
  format: "manga" | "webtoon" | "novel";
  workflow: string;
  isPublishedPublicly: boolean;
};

function localDatetime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  changes_requested: "طُلبت تعديلات",
  approved: "معتمد",
  scheduled: "مجدول",
  published: "منشور",
  withdrawn: "مسحوب",
};

const STATUS_VARIANTS: Record<string, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  review: "border-gold/40 bg-gold/10 text-gold",
  changes_requested: "border-danger/40 bg-danger/10 text-danger",
  approved: "border-success/40 bg-success/10 text-success",
  scheduled: "border-primary/40 bg-primary/10 text-primary",
  published: "border-success/60 bg-success/20 text-success font-semibold",
  withdrawn: "border-danger/60 bg-danger/20 text-danger font-semibold",
};

const ACTION_LABELS: Record<string, string> = {
  lazy_initialize: "تهيئة مسار المراجعات الأولي",
  fork_draft: "إنشاء مسودة مراجعة جديدة",
  update_draft: "تحديث مسودة المحتوى",
  edit_revoked_approval: "تعديل محتوى ألغى الاعتماد والجدولة",
  submit_for_review: "إرسال للمراجعة التحريرية",
  return_for_changes: "إعادة لطلب تعديلات",
  recommend_approval: "توصية باعتماد النسخة",
  approve_revision: "اعتماد رسمي من الإدارة",
  schedule_revision: "جدولة موعد النشر",
  cancel_schedule: "إلغاء الجدولة وإعادة الاعتماد",
  publish_now: "نشر فوري في المكتبة",
  publish_due_scheduled: "نشر تلقائي مجدول",
  withdraw_chapter: "سحب الفصل من العرض العام",
};

export function EditorialEditor({
  chapter,
  initialRevision,
  publishedSnapshot,
  events,
  currentActorRole,
  currentActorId,
  uploadsEnabled,
}: {
  chapter: ChapterMeta;
  initialRevision: WorkingRevision;
  publishedSnapshot: PublishedRevision;
  events: EditorialEvent[];
  currentActorId: string;
  currentActorRole: "contributor" | "editor" | "admin";
  uploadsEnabled: boolean;
}) {
  const editorId = useId();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [uploadBusy, setUploadBusy] = useState(false);
  const uploadBusyRef = useRef(false);
  const actionGate = useRef(createSubmissionGate());
  const [actionUncertain, setActionUncertain] = useState(false);

  // Working state
  const [revision, setRevision] = useState<WorkingRevision>(initialRevision);
  const [titleAr, setTitleAr] = useState(initialRevision.titleAr);
  const [readingDirection, setReadingDirection] = useState<"rtl" | "ltr">(initialRevision.readingDirection);
  const [isPremiumDemo, setIsPremiumDemo] = useState(initialRevision.isPremiumDemo);
  const [novelBody, setNovelBody] = useState(initialRevision.novelBody ?? "");

  // Pages for visual chapters (existing pages reorder / remove)
  const [pages, setPages] = useState<PageItem[]>(() => {
    if (Array.isArray(initialRevision.pagesJson)) {
      return initialRevision.pagesJson.map((p: any, idx: number) => ({
        pageIndex: idx,
        imagePath: p.imagePath,
        width: p.width,
        height: p.height,
      }));
    }
    return [];
  });

  // Modal / inline input states
  const [returnReason, setReturnReason] = useState("");
  const [recommendNote, setRecommendNote] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [scheduleDatetime, setScheduleDatetime] = useState(
    initialRevision.scheduledFor
      ? localDatetime(initialRevision.scheduledFor)
      : ""
  );

  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "history">("edit");
  const [previewedRevision, setPreviewedRevision] = useState<string | null>(null);
  const [conflictOccurred, setConflictOccurred] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdmin = currentActorRole === "admin";
  const isEditor = currentActorRole === "editor" || isAdmin;
  const isVisual = chapter.format !== "novel";
  const isReadOnlyStatus = revision.status === "published" || revision.status === "withdrawn";
  const uploadBlocked = uploadBusy || Boolean(revision.pendingUploadId);
  const actionsBlocked = isPending || uploadBlocked || actionUncertain;
  const importedPages = pages.some((page) => page.imagePath.startsWith("/api/media/"));
  const hasUnsavedChanges = titleAr.trim() !== revision.titleAr || readingDirection !== revision.readingDirection || isPremiumDemo !== revision.isPremiumDemo ||
    (chapter.format === "novel" ? novelBody !== (revision.novelBody ?? "") : JSON.stringify(pages.map(({ pageIndex, imagePath, width, height }) => [pageIndex, imagePath, width, height])) !== JSON.stringify((Array.isArray(revision.pagesJson) ? revision.pagesJson as typeof pages : []).map(({ pageIndex, imagePath, width, height }) => [pageIndex, imagePath, width, height])));


  useUnsavedChanges(hasUnsavedChanges || Boolean(returnReason || recommendNote || withdrawReason));
  const draftRecovery = useSessionTextDraft(
    { actorId: currentActorId, chapterId: chapter.id, revisionId: revision.id, version: revision.version },
    { titleAr, novelBody: chapter.format === "novel" ? novelBody : "" },
    hasUnsavedChanges,
  );

  function runAction(action: () => Promise<void>) {
    if (!actionGate.current.begin()) return;
    startTransition(async () => {
      let uncertain = false;
      try { await action(); }
      catch {
        uncertain = true;
        setActionUncertain(true);
        setConflictOccurred(true);
        setErrorMessage("انقطع الاتصال وتعذّر تأكيد نتيجة الإجراء. تعديلاتك ما زالت هنا؛ تحقق من آخر نسخة محفوظة بإعادة تحميل الصفحة قبل تكرار الإجراء.");
      } finally { actionGate.current.finish(uncertain); }
    });
  }

  // Reorder pages
  function movePage(index: number, direction: "up" | "down") {
    if (actionsBlocked || importedPages || isReadOnlyStatus) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === pages.length - 1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const updated = [...pages];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    // Re-index
    const reindexed = updated.map((p, i) => ({ ...p, pageIndex: i }));
    setPages(reindexed);
  }

  function removePage(index: number) {
    if (actionsBlocked || importedPages || isReadOnlyStatus) return;
    if (pages.length <= 1) {
      toast({ title: "تنبيه", description: "يجب الإبقاء على صفحة واحدة على الأقل.", variant: "destructive" });
      return;
    }
    const updated = pages.filter((_, i) => i !== index).map((p, i) => ({ ...p, pageIndex: i }));
    setPages(updated);
  }

  function guardUpload() {
    if (actionUncertain) return true;
    if (uploadBusyRef.current || revision.pendingUploadId || isPending) {
      setErrorMessage("أكمل رفع PDF أو ألغِ المحاولة الحالية قبل تعديل النسخة أو تنفيذ إجراءات المراجعة والنشر.");
      return true;
    }
    return false;
  }

  function applyUploadRevision(next: WorkingRevision) {
    setRevision(next);
    setTitleAr(next.titleAr);
    setReadingDirection(next.readingDirection);
    setIsPremiumDemo(next.isPremiumDemo);
    setNovelBody(next.novelBody ?? "");
    setPages(Array.isArray(next.pagesJson) ? next.pagesJson.map((page: PageItem, index: number) => ({ ...page, pageIndex: index })) : []);
    setScheduleDatetime(next.scheduledFor ? localDatetime(next.scheduledFor) : "");
    setErrorMessage(null);
    router.refresh();
  }

  // Save draft
  async function handleSaveDraft() {
    if (guardUpload()) return;
    setErrorMessage(null);
    runAction(async () => {
      const res = await updateDraftSnapshotAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
        titleAr,
        readingDirection,
        isPremiumDemo: isAdmin ? isPremiumDemo : undefined,
        novelBody: chapter.format === "novel" ? novelBody : undefined,
        pages: isVisual ? pages : undefined,
      });

      if (!res.ok) {
        if (res.error?.includes("غير متزامنة") || res.error?.includes("conflict")) {
          setConflictOccurred(true);
        }
        setErrorMessage(res.error ?? "تعذّر حفظ التعديلات");
        toast({ title: "فشل الحفظ", description: res.error, variant: "destructive" });
        return;
      }

      draftRecovery.clear();
      setConflictOccurred(false);
      if (res.revision) {
        setRevision(res.revision as any);
        toast({ title: "تم الحفظ بنجاح", description: `تم تحديث مسودة المراجعة إلى النسخة ${res.revision.version}.` });
      }
      router.refresh();
    });
  }

  // Fork / Open new draft if terminal
  async function handleOpenNewDraft() {
    if (guardUpload()) return;
    setErrorMessage(null);
    runAction(async () => {
      const res = await openOrCreateDraftAction({ chapterId: chapter.id });
      if (!res.ok) {
        setErrorMessage(res.error ?? "تعذّر فتح مسودة جديدة");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      if (res.revision) {
        const rev = res.revision as any;
        setRevision(rev);
        setTitleAr(rev.titleAr);
        setReadingDirection(rev.readingDirection);
        setIsPremiumDemo(rev.isPremiumDemo);
        setNovelBody(rev.novelBody ?? "");
        if (Array.isArray(rev.pagesJson)) {
          setPages(rev.pagesJson.map((p: any, idx: number) => ({ pageIndex: idx, imagePath: p.imagePath, width: p.width, height: p.height })));
        }
        toast({ title: "مسودة جديدة جاهزة", description: `تم فتح مراجعة جديدة (#${rev.revisionNumber}).` });
      }
      router.refresh();
    });
  }

  // Submit for review
  async function handleSubmitForReview() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage("احفظ تغييرات المسودة أولًا."); return; }
    setErrorMessage(null);
    runAction(async () => {
      const res = await submitForReviewAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
      });
      if (!res.ok) {
        if (res.error?.includes("غير متزامنة")) setConflictOccurred(true);
        setErrorMessage(res.error ?? "تعذّر إرسال المراجعة");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      if (res.revision) setRevision(res.revision as any);
      toast({ title: "أُرسلت للمراجعة", description: "النسخة الآن بانتظار فحص المحرر أو الإدارة." });
      router.refresh();
    });
  }

  // Return for changes
  async function handleReturnForChanges() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage("احفظ تغييرات المسودة أولًا."); return; }
    if (!returnReason.trim()) {
      setErrorMessage("سبب طلب التعديلات مطلوب.");
      return;
    }
    setErrorMessage(null);
    runAction(async () => {
      const res = await returnForChangesAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
        reason: returnReason.trim(),
      });
      if (!res.ok) {
        if (res.error?.includes("غير متزامنة")) setConflictOccurred(true);
        setErrorMessage(res.error ?? "تعذّر إعادة النسخة");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      if (res.revision) setRevision(res.revision as any);
      setReturnReason("");
      toast({ title: "أُعيدت النسخة للمساهم", description: "تم تسجيل الملاحظات وإعادة الحالة إلى طلب تعديلات." });
      router.refresh();
    });
  }

  // Recommend approval
  async function handleRecommendApproval() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage("احفظ تغييرات المسودة أولًا."); return; }
    setErrorMessage(null);
    runAction(async () => {
      const res = await recommendApprovalAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
        note: recommendNote.trim() || undefined,
      });
      if (!res.ok) {
        if (res.error?.includes("غير متزامنة")) setConflictOccurred(true);
        setErrorMessage(res.error ?? "تعذّر تسجيل التوصية");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "سُجلت التوصية", description: "تمت إضافة توصية بالاعتماد لصالح الإدارة." });
      if (res.revision) setRevision(toWorkingRevision(res.revision));
      setRecommendNote("");
      router.refresh();
    });
  }

  // Approve revision (Admin)
  async function handleApproveRevision() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage("احفظ تغييرات المسودة أولًا."); return; }
    setErrorMessage(null);
    runAction(async () => {
      const res = await approveRevisionAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
      });
      if (!res.ok) {
        if (res.error?.includes("غير متزامنة")) setConflictOccurred(true);
        setErrorMessage(res.error ?? "تعذّر اعتماد النسخة");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      if (res.revision) setRevision(res.revision as any);
      toast({ title: "تم الاعتماد الرسمي", description: "النسخة معتمدة وجاهزة للنشر الفوري أو الجدولة." });
      router.refresh();
    });
  }

  // Publish now (Admin)
  async function handlePublishNow() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage("احفظ تغييرات المسودة أولًا."); return; }
    setErrorMessage(null);
    runAction(async () => {
      const res = await publishRevisionNowAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
      });
      if (!res.ok) {
        if (res.error?.includes("غير متزامنة")) setConflictOccurred(true);
        setErrorMessage(res.error ?? "تعذّر نشر النسخة");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      if (res.revision) setRevision(res.revision as any);
      toast({ title: "تم النشر بنجاح!", description: "الفصل متاح الآن لجمهور القراء في المكتبة." });
      router.refresh();
    });
  }

  // Schedule revision (Admin)
  async function handleSchedule() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage("احفظ تغييرات المسودة أولًا."); return; }
    if (!scheduleDatetime) {
      setErrorMessage("يرجى تحديد موعد الجدولة المستقبلي.");
      return;
    }
    const targetDate = new Date(scheduleDatetime);
    if (targetDate.getTime() <= Date.now()) {
      setErrorMessage("موعد الجدولة يجب أن يكون تاريخًا ووقتًا في المستقبل.");
      return;
    }
    setErrorMessage(null);
    runAction(async () => {
      const res = await scheduleRevisionAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
        scheduledFor: targetDate.toISOString(),
      });
      if (!res.ok) {
        if (res.error?.includes("غير متزامنة")) setConflictOccurred(true);
        setErrorMessage(res.error ?? "تعذّر جدولة النسخة");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      if (res.revision) setRevision(res.revision as any);
      toast({ title: "تمت الجدولة بنجاح", description: `سيُنشر الفصل تلقائيًا في ${targetDate.toLocaleString("ar-EG")}.` });
      router.refresh();
    });
  }

  // Cancel schedule (Admin)
  async function handleCancelSchedule() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage("احفظ تغييرات المسودة أولًا."); return; }
    setErrorMessage(null);
    runAction(async () => {
      const res = await cancelScheduledRevisionAction({
        revisionId: revision.id,
        expectedVersion: revision.version,
      });
      if (!res.ok) {
        if (res.error?.includes("غير متزامنة")) setConflictOccurred(true);
        setErrorMessage(res.error ?? "تعذّر إلغاء الجدولة");
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        return;
      }
      if (res.revision) setRevision(res.revision as any);
      toast({ title: "أُلغيت الجدولة", description: "عادت النسخة إلى حالة معتمدة بانتظار قرار النشر." });
      router.refresh();
    });
  }

  // Withdraw chapter (Admin)
  async function handleWithdraw() {
    if (guardUpload()) return;
    if (hasUnsavedChanges) { setErrorMessage('احفظ تغييرات المسودة قبل سحب الفصل.'); return; }
    if (!publishedSnapshot) {
      setErrorMessage("لا توجد نسخة منشورة حاليًا لسحبها.");
      return;
    }
    if (!withdrawReason.trim()) {
      setErrorMessage("سبب سحب الفصل إلزامي للتوثيق والتدقيق.");
      return;
    }
    setErrorMessage(null);
    runAction(async () => {
      const res = await withdrawPublishedChapterAction({
        chapterId: chapter.id,
        expectedRevisionId: publishedSnapshot.id,
        expectedVersion: publishedSnapshot.version,
        reason: withdrawReason.trim(),
      });
      if (!res.ok) {
        setErrorMessage(res.error ?? "تعذّر سحب الفصل");
        toast({ title: "خطأ في السحب", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "تم سحب الفصل", description: "أُخفي الفصل من واجهة القراء وأُعيد إلى حالة المسودة." });
      setWithdrawReason("");
      if (res.revision?.id === revision.id) setRevision(toWorkingRevision(res.revision));
      // Withdrawal also invalidates any separate working draft and its version.
      // Reload both the publication projection and the working copy together.
      window.location.reload();
    });
  }

  return (
    <div className="space-y-6">
      {draftRecovery.recovered && !isReadOnlyStatus && (
        <div role="status" className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
          <p>وُجد نص غير محفوظ في هذا التبويب لنفس إصدار الفصل. استعده أو تجاهله؛ لم تُستبدل النسخة المحفوظة.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={actionsBlocked} onClick={() => {
              if (hasUnsavedChanges && !window.confirm("استبدال النص الحالي بالنص المستعاد؟")) return;
              const recovered = draftRecovery.recovered;
              if (!recovered) return;
              setTitleAr(recovered.titleAr);
              if (chapter.format === "novel") setNovelBody(recovered.novelBody);
              draftRecovery.dismiss();
            }}>استعادة النص</Button>
            <Button type="button" variant="ghost" disabled={actionsBlocked} onClick={draftRecovery.dismiss}>تجاهل النص المستعاد</Button>
          </div>
        </div>
      )}
      {/* Conflict / Reload Banner */}
      {conflictOccurred && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-foreground">
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-5 shrink-0 text-gold" aria-hidden />
            <div>
              <p className="text-sm font-bold">تعارض في إصدار النسخة (Conflict)</p>
              <p className="text-xs text-muted-foreground">
                تغيّرت النسخة منذ فتح النموذج. تعديلاتك ما زالت هنا؛ انسخ ما تحتاجه قبل إعادة تحميل آخر نسخة محفوظة.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
            className="min-h-[44px] gap-2 border-gold/40 text-gold hover:bg-gold/20"
          >
            <RefreshCw className="size-4" aria-hidden />
            إعادة تحميل الصفحة
          </Button>
        </div>
      )}

      {/* General Error Message */}
      {hasUnsavedChanges && <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">لديك تغييرات غير محفوظة. احفظ المسودة قبل المراجعة أو الاعتماد أو النشر.</p>}
      {errorMessage && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3.5 text-xs text-danger">
          {errorMessage}
        </div>
      )}

      {/* Status & Revision Meta Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className={`px-3 py-1 text-xs ${STATUS_VARIANTS[revision.status] ?? ""}`}>
            {STATUS_LABELS[revision.status] ?? revision.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            مراجعة رقم <strong>#{revision.revisionNumber}</strong> (الإصدار v{revision.version})
          </span>
          {revision.approvedAt && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              معتمد رسميًا
            </span>
          )}
          {revision.scheduledFor && (
            <span className="flex items-center gap-1 text-xs text-primary" dir="ltr">
              <CalendarClock className="size-3.5" aria-hidden />
              {new Date(revision.scheduledFor).toLocaleString("ar-EG")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* If published or withdrawn, allow opening new working draft */}
          {isReadOnlyStatus && (
            <Button
              onClick={handleOpenNewDraft}
              disabled={actionsBlocked}
              className="min-h-[44px] gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              فتح مسودة جديدة لهذا الفصل
            </Button>
          )}

          {/* Tab switches */}
          <div className="flex rounded-lg border border-border/60 bg-secondary/40 p-1">
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => { if (!uploadBusyRef.current) setActiveTab("edit"); }}
              className={`min-h-[44px] rounded-md px-3 text-xs font-medium transition disabled:cursor-wait disabled:opacity-50 ${
                activeTab === "edit" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              المحتوى والإعدادات
            </button>
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => { if (!uploadBusyRef.current) { setPreviewedRevision(`${revision.id}:${revision.version}`); setActiveTab("preview"); } }}
              className={`min-h-[44px] rounded-md px-3 text-xs font-medium transition disabled:cursor-wait disabled:opacity-50 ${
                activeTab === "preview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              معاينة النسخة
            </button>
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => { if (!uploadBusyRef.current) setActiveTab("history"); }}
              className={`min-h-[44px] rounded-md px-3 text-xs font-medium transition disabled:cursor-wait disabled:opacity-50 ${
                activeTab === "history" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              سجل التدقيق ({events.length})
            </button>
          </div>
        </div>
      </div>

      {/* Live Snapshot vs Working Draft Notification */}
      {publishedSnapshot && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold text-foreground">
                النسخة المنشورة حاليًا في المكتبة العامة: مراجعة #{publishedSnapshot.revisionNumber} (الإصدار v{publishedSnapshot.version})
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {publishedSnapshot.publishedAt
                  ? `تاريخ النشر: ${new Date(publishedSnapshot.publishedAt).toLocaleDateString("ar-EG")}`
                  : "منشور حاليًا للقراء"}
              </p>
            </div>
            {isAdmin && (
              <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Input
                  placeholder="سبب السحب الإلزامي…"
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  className="min-h-[44px] w-full bg-card text-xs sm:w-64"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleWithdraw}
                  disabled={actionsBlocked || !withdrawReason.trim()}
                  className="min-h-[44px] gap-1.5"
                >
                  سحب الفصل من العرض
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: EDIT FORM */}
      {activeTab === "edit" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content Area */}
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
              <h2 className="text-base font-bold text-foreground">بيانات النسخة التحريرية</h2>

              <div className="space-y-1.5">
                <label htmlFor={`${editorId}-title`} className="text-sm font-medium">عنوان الفصل *</label>
                <Input
                  id={`${editorId}-title`}
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  disabled={isReadOnlyStatus || actionsBlocked}
                  className="min-h-[44px] bg-background"
                  placeholder="أدخل عنوان الفصل…"
                />
              </div>

              {chapter.format === "manga" && (
                <div className="space-y-1.5">
                  <label htmlFor={`${editorId}-direction`} className="text-sm font-medium">اتجاه القراءة</label>
                  <select
                    id={`${editorId}-direction`}
                    value={readingDirection}
                    onChange={(e) => setReadingDirection(e.target.value as "rtl" | "ltr")}
                    disabled={isReadOnlyStatus || actionsBlocked}
                    className="min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="rtl">من اليمين إلى اليسار (يابانية / RTL)</option>
                    <option value="ltr">من اليسار إلى اليمين (LTR)</option>
                  </select>
                </div>
              )}

              {isAdmin && (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={isPremiumDemo}
                    onChange={(e) => setIsPremiumDemo(e.target.checked)}
                    disabled={isReadOnlyStatus || actionsBlocked}
                    className="size-5 rounded border-border accent-primary"
                  />
                  <span>قفل الفصل (تجربة حصرية / Premium Demo)</span>
                </label>
              )}
            </div>

            {isVisual && <PdfUploadPanel
              onPreview={() => { if (!uploadBusyRef.current) { setPreviewedRevision(`${revision.id}:${revision.version}`); setActiveTab('preview'); } }}
              previewOpened={previewedRevision === `${revision.id}:${revision.version}`}
              firstPageImagePath={pages[0]?.imagePath}
              coverEditorHref={isAdmin ? `/admin/series/${chapter.seriesId}#series-cover` : undefined}
              revisionId={revision.id}
              version={revision.version}
              pendingUploadId={revision.pendingUploadId}
              uploadsEnabled={uploadsEnabled}
              disabled={isReadOnlyStatus || isPending || actionUncertain}
              unsaved={hasUnsavedChanges}
              onSaveDraft={handleSaveDraft}
              onBusyChange={(value) => { uploadBusyRef.current = value; setUploadBusy(value); }}
              onStarted={(uploadId, version) => {
                setRevision((current) => ({ ...current, version, pendingUploadId: uploadId, status: "draft", approvedAt: null, approvedById: null, scheduledFor: null }));
                setScheduleDatetime("");
              }}
              onRevision={applyUploadRevision}
            />}

            {/* Novel Body or Pages Tool */}
            {chapter.format === "novel" ? (
              <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-foreground">نص الرواية</h2>
                  <span className="text-xs text-muted-foreground">
                    {novelBody.split(/\s+/).filter(Boolean).length} كلمة
                  </span>
                </div>
                <Textarea
                  value={novelBody}
                  onChange={(e) => setNovelBody(e.target.value)}
                  disabled={isReadOnlyStatus || actionsBlocked}
                  rows={14}
                  className="min-h-[200px] bg-background leading-relaxed"
                  placeholder="اكتب أو الصق نص الفصل هنا… (كل سطر جديد يمثل فقرة منفصلة)"
                />
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-foreground">صفحات الفصل ({pages.length})</h2>
                  <p className="text-xs text-muted-foreground">
                    {importedPages ? "صفحات PDF للمعاينة؛ استبدل الملف كاملًا لتعديلها." : "يمكن ترتيب صفحات العرض القديمة أو حذفها، أو استبدالها بملف PDF كامل."}
                  </p>
                </div>

                {pages.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    لا توجد صفحات في هذه النسخة.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {pages.map((p, index) => (
                      <div
                        key={p.imagePath + index}
                        className="group relative overflow-hidden rounded-xl border border-border/60 bg-background p-2.5 transition hover:border-primary/40"
                      >
                        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-secondary/50">
                          <img
                            src={p.imagePath}
                            alt={`صفحة ${index + 1}`}
                            className="size-full object-cover"
                            loading="lazy"
                          />
                          <span className="absolute bottom-2 end-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur-sm">
                            {index + 1}
                          </span>
                        </div>

                        {!isReadOnlyStatus && !importedPages && (
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => movePage(index, "up")}
                                disabled={index === 0 || actionsBlocked}
                                className="min-h-[44px] min-w-[44px]"
                                title="تحريك لأعلى"
                                aria-label={`تحريك الصفحة ${index + 1} لأعلى`}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => movePage(index, "down")}
                                disabled={index === pages.length - 1 || actionsBlocked}
                                className="min-h-[44px] min-w-[44px]"
                                title="تحريك لأسفل"
                                aria-label={`تحريك الصفحة ${index + 1} لأسفل`}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removePage(index)}
                              disabled={actionsBlocked}
                              className="min-h-[44px] min-w-[44px] text-danger hover:bg-danger/10"
                              title="حذف الصفحة من النسخة"
                              aria-label={`حذف الصفحة ${index + 1}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Workflow Actions Sidebar */}
          <div className="space-y-6">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
              <h3 className="text-sm font-bold text-foreground">إجراءات سير العمل</h3>

              {/* Save Draft Action */}
              {!isReadOnlyStatus && (
                <Button
                  onClick={handleSaveDraft}
                  disabled={actionsBlocked}
                  className="min-h-[44px] w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  حفظ المسودة
                </Button>
              )}

              {/* Submit For Review (Draft or Changes Requested) */}
              {(revision.status === "draft" || revision.status === "changes_requested") && (
                <Button
                  onClick={handleSubmitForReview}
                  disabled={actionsBlocked || hasUnsavedChanges}
                  variant="outline"
                  className="min-h-[44px] w-full gap-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Send className="size-4" />
                  إرسال للمراجعة التحريرية
                </Button>
              )}

              {/* Editor / Admin Review Actions */}
              {isEditor && revision.status === "review" && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/20 p-3">
                  <h4 className="text-xs font-semibold text-foreground">قرارات المراجعة التحريرية</h4>

                  {/* Return for changes */}
                  <div className="space-y-1.5">
                    <Input
                      placeholder="سبب طلب التعديلات (إلزامي)…"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="min-h-[44px] bg-background text-xs"
                    />
                    <Button
                      onClick={handleReturnForChanges}
                      disabled={actionsBlocked || hasUnsavedChanges || !returnReason.trim()}
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] w-full border-danger/40 text-danger hover:bg-danger/10"
                    >
                      إعادة للمساهم مع الملاحظات
                    </Button>
                  </div>

                  {/* Recommend approval */}
                  <div className="space-y-1.5 pt-2">
                    <Input
                      placeholder="ملاحظة التوصية (اختياري)…"
                      value={recommendNote}
                      onChange={(e) => setRecommendNote(e.target.value)}
                      className="min-h-[44px] bg-background text-xs"
                    />
                    <Button
                      onClick={handleRecommendApproval}
                      disabled={actionsBlocked || hasUnsavedChanges}
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] w-full border-gold/40 text-gold hover:bg-gold/10"
                    >
                      توصية الإدارة بالاعتماد
                    </Button>
                  </div>
                </div>
              )}

              {/* Admin Authority Actions */}
              {isAdmin && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/30 p-3">
                  <h4 className="text-xs font-semibold text-foreground">صلاحيات الإدارة</h4>

                  {/* Approve */}
                  {(revision.status === "draft" || revision.status === "review" || revision.status === "changes_requested") && (
                    <Button
                      onClick={handleApproveRevision}
                      disabled={actionsBlocked || hasUnsavedChanges}
                      variant="outline"
                      className="min-h-[44px] w-full gap-2 border-success/40 text-success hover:bg-success/10"
                    >
                      <CheckCircle2 className="size-4" />
                      اعتماد النسخة رسميًا
                    </Button>
                  )}

                  {/* Publish Now */}
                  {(revision.status === "approved" || revision.status === "scheduled") && (
                    <Button
                      onClick={handlePublishNow}
                      disabled={actionsBlocked || hasUnsavedChanges}
                      className="min-h-[44px] w-full gap-2 bg-success text-white hover:bg-success/90"
                    >
                      <Sparkles className="size-4" />
                      نشر النسخة الآن في المكتبة
                    </Button>
                  )}

                  {/* Schedule */}
                  {(revision.status === "approved" || revision.status === "scheduled") && (
                    <div className="space-y-2 pt-2">
                      <label htmlFor={`${editorId}-schedule`} className="text-[11px] font-medium text-muted-foreground">تاريخ ووقت النشر المجدول</label>
                      <Input
                        id={`${editorId}-schedule`}
                        type="datetime-local"
                        value={scheduleDatetime}
                        onChange={(e) => setScheduleDatetime(e.target.value)}
                        className="min-h-[44px] bg-background text-xs"
                        dir="ltr"
                      />
                      <Button
                        onClick={handleSchedule}
                        disabled={actionsBlocked || hasUnsavedChanges || !scheduleDatetime}
                        variant="outline"
                        className="min-h-[44px] w-full gap-2 border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <Calendar className="size-4" />
                        {revision.status === "scheduled" ? "تعديل موعد الجدولة" : "جدولة نشر النسخة"}
                      </Button>
                    </div>
                  )}

                  {/* Cancel Schedule */}
                  {revision.status === "scheduled" && (
                    <Button
                      onClick={handleCancelSchedule}
                      disabled={actionsBlocked || hasUnsavedChanges}
                      variant="ghost"
                      className="min-h-[44px] w-full text-xs text-muted-foreground hover:text-danger"
                    >
                      إلغاء الجدولة وإعادة للاعتماد
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Hint Notice */}
            <div className="rounded-xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">ملاحظة بشأن التعديلات المعتمدة:</p>
              <p className="mt-1">
                أي تعديل على محتوى نسخة معتمدة أو مجدولة يلغي اعتمادها وجدولتها تلقائيًا ويعيدها لحالة «مسودة» لضمان نزاهة النشر.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PREVIEW */}
      {activeTab === "preview" && (
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <header className="mb-6 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold text-foreground">
              الفصل {chapter.number}: {titleAr}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              العمل: {chapter.seriesTitleAr} · التنسيق: {chapter.format === 'manga' ? 'صفحات مصوّرة' : chapter.format === 'webtoon' ? 'تمرير رأسي' : 'نص روائي'}{isVisual ? ` · اتجاه القراءة: ${readingDirection === 'rtl' ? 'من اليمين لليسار' : 'من اليسار لليمين'}` : ''}
            </p>
          </header>

          {chapter.format === "novel" ? (
            <div className="max-w-3xl space-y-4 leading-8 text-foreground">
              {novelBody ? (
                novelBody.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i} className="text-base text-foreground/90">
                    {para}
                  </p>
                ))
              ) : (
                <p className="text-sm italic text-muted-foreground">لا يوجد نص مدخل بعد في هذه النسخة.</p>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {pages.length === 0 && <p role="status" className="py-8 text-center text-sm leading-7 text-muted-foreground">مفيش صفحات جاهزة للمعاينة. ارجع للمحتوى وارفع ملف الفصل، وبعد اكتماله افتح المعاينة الخاصة.</p>}
              {pages.map((p, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-border bg-background">
                  <img
                    src={p.imagePath}
                    alt={`صفحة ${i + 1}`}
                    className="w-full object-contain"
                  />
                  <div className="bg-secondary/30 p-2 text-center text-xs text-muted-foreground">
                    صفحة {i + 1} من {pages.length}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT HISTORY TIMELINE */}
      {activeTab === "history" && (
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <h2 className="mb-4 text-base font-bold text-foreground">سجل الأحداث والتدقيق التحريري</h2>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد أحداث مسجلة بعد لهذا الفصل.</p>
          ) : (
            <ol className="relative space-y-4 border-s border-border/60 ms-3">
              {events.map((ev) => (
                <li key={ev.id} className="ms-6">
                  <span className="absolute -start-3 flex size-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <History className="size-3.5" aria-hidden />
                  </span>
                  <div className="rounded-xl border border-border/40 bg-background p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground">
                        {ACTION_LABELS[ev.action] ?? ev.action}
                      </p>
                      <time className="text-[11px] text-muted-foreground" dir="ltr">
                        {new Date(ev.createdAt).toLocaleString("ar-EG")}
                      </time>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      المسؤول: <strong className="text-foreground">{ev.actorName}</strong>
                    </p>
                    {ev.reasonAr && (
                      <p className="mt-2 rounded-lg bg-secondary/50 p-2 text-xs text-foreground">
                        «{ev.reasonAr}»
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
