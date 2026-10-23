"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Loader2, Plus, Search, PenTool } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateChapterMeta, upsertSeries, createChapter } from "@/lib/actions";
import { SeriesCoverEditor, uploadSeriesCover } from './series-cover-editor';
import { UploadRequestError } from '@/lib/media/upload-request';
import { CATEGORIES, CATEGORY_LABELS, FORMATS, FORMAT_LABELS, GENRES, SERIES_STATUSES, STATUS_LABELS, WORKFLOWS, WORKFLOW_LABELS, type Category, type Format } from "@/lib/constants";

export function AdminLogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      className={compact ? "size-9 text-muted-foreground" : "w-full justify-start gap-2.5 text-muted-foreground hover:text-danger"}
      onClick={() => signOut({ callbackUrl: "/" })}
      aria-label="تسجيل الخروج"
    >
      <LogOut className="size-4" aria-hidden />
      {!compact && "تسجيل الخروج"}
    </Button>
  );
}

export function SeriesFilters({ initial }: { initial: { q?: string; format?: string; status?: string } }) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q ?? "");
  const push = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { q, format: initial.format, status: initial.status, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.replace(`/admin/series?${params.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          push({});
        }}
      >
        <Search className="absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالعنوان…"
          className="w-52 bg-card ps-8"
          aria-label="بحث في الأعمال"
        />
      </form>
      <Select value={initial.format ?? "all"} onValueChange={(v) => push({ format: v === "all" ? null : v })}>
        <SelectTrigger size="sm" className="w-[130px] bg-card" aria-label="النوع">
          <SelectValue placeholder="النوع" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الأنواع</SelectItem>
          {FORMATS.map((f) => <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={initial.status ?? "all"} onValueChange={(v) => push({ status: v === "all" ? null : v })}>
        <SelectTrigger size="sm" className="w-[140px] bg-card" aria-label="الحالة">
          <SelectValue placeholder="الحالة" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الحالات</SelectItem>
          {SERIES_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

type SeriesFormValues = {
  id?: string;
  coverPath?: string;
  titleAr: string;
  titleOriginal: string;
  slug: string;
  synopsisAr: string;
  category?: Category | null;
  format: Format;
  status: "ongoing" | "completed" | "hiatus";
  author: string;
  translator: string;
  genres: string[];
  isFeatured: boolean;
};

export function SeriesForm({ initial }: { initial?: SeriesFormValues }) {
  const formId = useId();
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<SeriesFormValues>(
    initial ?? {
      titleAr: "",
      titleOriginal: "",
      slug: "",
      synopsisAr: "",
      category: null,
      format: "manga",
      status: "ongoing",
      author: "",
      translator: "",
      genres: [],
      isFeatured: false,
    }
  );
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [cover, setCover] = useState<Blob | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);

  const set = <K extends keyof SeriesFormValues>(k: K, v: SeriesFormValues[K]) =>
    setValues((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || pending || coverBusy || recoveryRequired) return;
    setLoading(true);
    setErrors(null);
    let id = createdId;
    let savingMetadata = false;
    try {
      if (!id) {
        savingMetadata = true;
        const res = await upsertSeries(values);
        savingMetadata = false;
        if (!res.ok || !res.id) { setErrors(res.error ?? 'تعذّر حفظ بيانات العمل.'); return; }
        id = res.id;
        if (!values.id) setCreatedId(id);
      }
      if (cover) {
        const saved = await uploadSeriesCover(id, values.coverPath ?? '', cover);
        setValues(previous => ({ ...previous, coverPath: saved.coverPath }));
        setCover(null);
      }
      toast({ title: 'تم الحفظ', description: 'اتحفظت بيانات العمل. ظهوره في الكتالوج مرتبط بوجود فصل منشور.' });
      startTransition(() => { router.push(`/admin/series/${id}`); router.refresh(); });
    } catch (cause) {
      const unknown = savingMetadata || (cause instanceof UploadRequestError && (cause.ambiguous || cause.code === 'conflict'));
      setRecoveryRequired(unknown);
      setErrors(unknown ? 'تعذّر تأكيد نتيجة الحفظ. أعد تحميل الصفحة وافحص العمل قبل إعادة المحاولة.' : `${!values.id && id ? 'اتعمل العمل واتحفظت بياناته، لكن الغلاف ما اتحفظش. تقدر تعيد حفظ الغلاف من غير إنشاء عمل جديد. ' : ''}${cause instanceof UploadRequestError && cause.code === 'invalid_media' ? 'صورة الغلاف غير مدعومة. اختار صورة تانية.' : 'تعذّر حفظ الغلاف. الغلاف السابق محفوظ؛ حاول مرة أخرى أو افتح إدارة العمل.'}`);
    } finally { setLoading(false); }
  }

  const field = "bg-card";
  return (
    <form onSubmit={submit} className="space-y-5" aria-label="نموذج بيانات العمل">
      <div className="grid items-start gap-7 lg:grid-cols-[240px_minmax(0,1fr)]">
      <SeriesCoverEditor key={values.coverPath ?? ''} seriesId={values.id ?? createdId ?? undefined} currentCover={values.coverPath ?? ''} disabled={loading || pending || recoveryRequired} onPrepared={setCover} onBusyChange={setCoverBusy} />
      <fieldset disabled={loading || pending || Boolean(createdId) || recoveryRequired} className="min-w-0 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-title`} className="text-sm font-medium">العنوان العربي *</label>
          <Input id={`${formId}-title`} required value={values.titleAr} onChange={(e) => set("titleAr", e.target.value)} className={field} placeholder="مثال: حارس بوابة الشفق" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-original`} className="text-sm font-medium">العنوان الأصلي (اختياري)</label>
          <Input id={`${formId}-original`} dir="ltr" value={values.titleOriginal} onChange={(e) => set("titleOriginal", e.target.value)} className={`${field} text-left`} placeholder="Original title" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-slug`} className="text-sm font-medium">المعرّف (slug) *</label>
          <Input id={`${formId}-slug`} dir="ltr" required value={values.slug} onChange={(e) => set("slug", e.target.value)} className={`${field} text-left`} placeholder="twilight-gate-warden" disabled={Boolean(values.id)} />
          <p className="text-[11px] text-muted-foreground">أحرف لاتينية صغيرة وأرقام وشرطات — لا يمكن تعديله لاحقًا.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-category`} className="text-sm font-medium">تصنيف المحتوى *</label>
          <Select
            value={values.category ?? (initial ? "none" : "")}
            onValueChange={(v) => set("category", v === "none" ? null : (v as Category))}
          >
            <SelectTrigger id={`${formId}-category`} className={`${field} w-full`}><SelectValue placeholder="اختر تصنيف العمل" /></SelectTrigger>
            <SelectContent>
              {initial && <SelectItem value="none">غير مصنّف</SelectItem>}
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">فئة وهوية المحتوى (مانجا، مانهوا، روايات، كوميك).</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-format`} className="text-sm font-medium">طريقة القراءة (الصيغة) *</label>
          <Select value={values.format} onValueChange={(v) => set("format", v as SeriesFormValues["format"])}>
            <SelectTrigger id={`${formId}-format`} className={`${field} w-full`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">أسلوب عرض الصفحات أو التمرير أو النص في القارئ.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-status`} className="text-sm font-medium">حالة العمل *</label>
          <Select value={values.status} onValueChange={(v) => set("status", v as SeriesFormValues["status"])}>
            <SelectTrigger id={`${formId}-status`} className={`${field} w-full`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {SERIES_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-author`} className="text-sm font-medium">المؤلف *</label>
          <Input id={`${formId}-author`} required value={values.author} onChange={(e) => set("author", e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-translator`} className="text-sm font-medium">المترجم</label>
          <Input id={`${formId}-translator`} value={values.translator} onChange={(e) => set("translator", e.target.value)} className={field} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-synopsis`} className="text-sm font-medium">الملخص العربي *</label>
        <textarea
          id={`${formId}-synopsis`}
          required
          value={values.synopsisAr}
          onChange={(e) => set("synopsisAr", e.target.value)}
          rows={5}
          className={`w-full rounded-xl border border-input ${field} px-3 py-2.5 text-sm leading-8 outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          placeholder="ملخص جذاب بالعربية…"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">التصنيفات * (اختر واحدة أو أكثر)</label>
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => {
            const active = values.genres.includes(g);
            return (
              <button
                type="button"
                key={g}
                onClick={() => set("genres", active ? values.genres.filter((x) => x !== g) : [...values.genres, g])}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  active ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={values.isFeatured}
          onChange={(e) => set("isFeatured", e.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        عمل مميّز (يظهر في الواجهة بشكل أبرز)
      </label>
      </fieldset>
      </div>

      {errors && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{errors}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading || pending || coverBusy || recoveryRequired} className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          {(loading || pending) && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {createdId ? 'إعادة حفظ الغلاف' : values.id ? "حفظ التعديلات" : "إنشاء العمل"}
        </Button>
        {createdId && <Button type="button" variant="outline" onClick={() => { router.push(`/admin/series/${createdId}`); router.refresh(); }}>فتح إدارة العمل</Button>}
        {recoveryRequired && <Button type="button" variant="outline" onClick={() => createdId ? (router.push(`/admin/series/${createdId}`), router.refresh()) : window.location.reload()}>إعادة تحميل الحالة</Button>}
        <Button type="button" variant="outline" className="border-border" onClick={() => router.back()}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

type ChapterRow = {
  id: string;
  number: number;
  titleAr: string;
  workflow: "draft" | "review" | "published";
  isPremiumDemo: boolean;
  scheduledFor?: string | null;
};

export function ChapterWorkflowControls({
  chapter,
  isAdmin = false,
}: {
  chapter: ChapterRow;
  isAdmin?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
        {WORKFLOW_LABELS[chapter.workflow]}
      </span>
      {chapter.isPremiumDemo && (
        <span className="rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-xs text-gold">
          مقفل
        </span>
      )}
      {chapter.scheduledFor && (
        <span className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground" dir="ltr">
          {new Date(chapter.scheduledFor).toLocaleDateString("ar-EG")}
        </span>
      )}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="min-h-[44px] gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
      >
        <Link href={`/studio/chapters/${chapter.id}`}>
          <PenTool className="size-4" aria-hidden />
          إدارة النسخة
        </Link>
      </Button>
    </div>
  );
}

export const ChapterWorkflowActions = ChapterWorkflowControls;

export function ChapterForm({
  seriesOptions,
  isAdmin = false,
}: {
  seriesOptions: { id: string; titleAr: string; format: Format }[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [seriesId, setSeriesId] = useState(seriesOptions[0]?.id ?? "");
  const [number, setNumber] = useState("1");
  const [titleAr, setTitleAr] = useState("");
  const [workflow, setWorkflow] = useState<"draft" | "review">("draft");
  const [readingDirection, setReadingDirection] = useState<"rtl" | "ltr">("rtl");

  const [novelBody, setNovelBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = seriesOptions.find((s) => s.id === seriesId);
  const isManga = selected?.format === "manga";
  const isNovel = selected?.format === "novel";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await createChapter({
      seriesId,
      number: Number(number),
      titleAr,
      workflow: isNovel ? workflow : "draft",
      isPremiumDemo: false,
      readingDirection: isManga ? readingDirection : "rtl",

      scheduledFor: null,
      novelBody: isNovel ? novelBody : undefined,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "حدث خطأ");
      return;
    }
    toast({
      title: "أُنشئ الفصل بنجاح",
      description: "جاري الانتقال إلى استوديو التحرير لإدارة النسخة واعتمادها…",
    });
    if (res.id) {
      router.push(`/studio/chapters/${res.id}`);
    } else {
      router.push("/admin/chapters");
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-xl" aria-label="نموذج فصل جديد">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">العمل *</label>
        <Select value={seriesId} onValueChange={setSeriesId}>
          <SelectTrigger className="min-h-[44px] bg-card"><SelectValue placeholder="اختر العمل" /></SelectTrigger>
          <SelectContent>
            {seriesOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.titleAr} — {FORMAT_LABELS[s.format]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">رقم الفصل *</label>
          <Input type="number" min={1} required value={number} onChange={(e) => setNumber(e.target.value)} className="min-h-[44px] bg-card" />
        </div>

      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">عنوان الفصل *</label>
        <Input required value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className="min-h-[44px] bg-card" placeholder="مثال: أضواء على الحدود" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">حالة سير العمل المبدئية *</label>
          <Select value={isNovel ? workflow : "draft"} disabled={!isNovel} onValueChange={(v) => setWorkflow(v as "draft" | "review")}>
            <SelectTrigger className="min-h-[44px] bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">مسودة (الافتراضي)</SelectItem>
              <SelectItem value="review">مراجعة</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{isNovel ? "النشر والجدولة يتمان عبر استوديو التحرير بعد اعتماد النسخة." : "يُنشأ فصل مصوّر فارغ كمسودة. ارفع PDF في الاستوديو، ثم افحص المعاينة وأرسله للمراجعة."}</p>
        </div>
        {isManga && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">اتجاه القراءة</label>
            <Select value={readingDirection} onValueChange={(v) => setReadingDirection(v as "rtl" | "ltr")}>
              <SelectTrigger className="min-h-[44px] bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rtl">يمين ← يسار (يابانية)</SelectItem>
                <SelectItem value="ltr">يسار → يمين</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {isNovel && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">نص الفصل *</label>
          <Textarea
            value={novelBody}
            onChange={(e) => setNovelBody(e.target.value)}
            rows={10}
            required
            className="bg-card leading-8"
            placeholder="اكتب فصول الرواية هنا… (فقرات مفصولة بأسطر جديدة)"
          />
          <p className="text-[11px] text-muted-foreground">{novelBody.split(/\s+/).filter(Boolean).length} كلمة — كل سطر جديد يبدأ فقرة.</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <Button type="submit" disabled={loading} className="min-h-[44px] gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        إنشاء الفصل والمتابعة للاستوديو
      </Button>
    </form>
  );
}
