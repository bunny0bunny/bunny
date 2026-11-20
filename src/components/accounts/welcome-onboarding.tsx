"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, Check, ArrowLeft, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GENRES } from "@/lib/constants";
import { saveOnboarding } from "@/lib/account-actions";
import { safeAccountDestination } from "@/lib/account-destination";
import { AccountShell } from "@/components/accounts/account-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/lib/actions";
import { isProfileAvatarChoice } from "@/lib/avatars";
import { arabicError } from "@/lib/error-messages-ar";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { AvatarChoiceGrid, UPLOADED_AVATAR } from "@/components/accounts/avatar-choice-grid";
import { ProfileAvatarUploader } from "@/components/accounts/profile-avatar-uploader";
import { useSession } from "next-auth/react";

export function WelcomeOnboarding({
  nickname,
  isStaff,
  next,
  avatarSeed = "initials",
  avatarPath = null,
  uploadsEnabled = false,
}: {
  nickname: string;
  isStaff: boolean;
  next: string;
  avatarSeed?: string;
  avatarPath?: string | null;
  uploadsEnabled?: boolean;
}) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  // Step 1: name and picture. Step 2: favourite genres. Both can be skipped.
  const [step, setStep] = useState<"identity" | "genres">("identity");
  const [name, setName] = useState(nickname);
  const [uploadedPath, setUploadedPath] = useState<string | null>(avatarPath);
  const [choice, setChoice] = useState(avatarPath ? UPLOADED_AVATAR : avatarSeed);
  const fallbackSeed = choice === UPLOADED_AVATAR ? avatarSeed : choice;
  const safeNext = safeAccountDestination(next, isStaff ? "/studio" : "/");

  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleFinish = (skip = false) => {
    setError(null);
    startTransition(async () => {
      const res = await saveOnboarding({
        genres: skip ? [] : selectedGenres,
        skip,
        next: safeNext,
      });

      if (!res.ok) {
        setError(res.error ?? "تعذّر حفظ التفضيلات. يرجى المحاولة لاحقًا.");
        return;
      }

      const dest = safeAccountDestination(res.next, safeNext);
      router.push(dest);
      router.refresh();
    });
  };

  const saveIdentity = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateProfile({ nickname: name.trim(), avatarSeed: isProfileAvatarChoice(choice) ? choice : undefined });
      if (!res.ok) {
        setError(arabicError(res.error, "تعذّر حفظ الاسم والصورة."));
        return;
      }
      try { await updateSession?.({ name: name.trim() }); } catch {}
      setStep("genres");
    });
  };

  if (step === "identity") {
    return (
      <AccountShell title="اختر اسمك وصورتك" description="هكذا سيراك القرّاء الآخرون في التعليقات. تقدر تغيّرهم في أي وقت من صفحة حسابك.">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <AccountAvatar seed={fallbackSeed} src={choice === UPLOADED_AVATAR ? uploadedPath : null} name={name} className="size-16 border-2 border-primary/50" brandMarkSize="size-9" />
            <div className="min-w-0 flex-1">
              <Label htmlFor="welcome-name" className="mb-1.5 block text-xs text-muted-foreground">الاسم الظاهر</Label>
              <Input id="welcome-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-11 bg-card" />
            </div>
          </div>
          <AvatarChoiceGrid selected={choice} onSelect={setChoice} name={name} uploadedPath={uploadedPath} fallbackSeed={fallbackSeed} className="grid-cols-5 sm:grid-cols-6" />
          {uploadsEnabled && (
            <ProfileAvatarUploader disabled={isPending} onUploaded={(path) => { setUploadedPath(path); setChoice(UPLOADED_AVATAR); }} />
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{error}</p>
          )}
          <div className="flex flex-col gap-2.5">
            <Button type="button" disabled={isPending || name.trim().length < 2} onClick={saveIdentity} className="h-11 w-full gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90">
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              حفظ والمتابعة
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => { setError(null); setStep("genres"); }} className="h-11 w-full gap-2 border-border text-muted-foreground hover:text-foreground">
              <span>تخطي هذه الخطوة</span>
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
          </div>
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      title={`أهلاً بك، ${name.trim() || nickname}`}
      description="احفظ الأنواع التي تحب قراءتها ضمن تفضيلات حسابك، أو تخطَّ هذه الخطوة وابدأ التصفح."
      footer={
        isStaff ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">أنت مسجل كأحد أعضاء فريق العمل.</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleFinish(true)}
              className="h-11 w-full gap-2 text-primary hover:bg-primary/10"
            >
              <PenTool className="size-4" aria-hidden />
              <span>الانتقال مباشرة إلى استوديو المبدعين</span>
            </Button>
          </div>
        ) : (
          <p>
            <Link href="/" className="text-muted-foreground transition hover:text-foreground">
              تصفح المكتبة كزائر
            </Link>
          </p>
        )
      }
    >
      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            الأنواع المفضلة (اختياري)
          </label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => {
              const active = selectedGenres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGenre(g)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-primary/60 bg-primary/20 text-primary"
                      : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                  aria-pressed={active}
                >
                  {active && <Check className="size-3.5" aria-hidden />}
                  <span>{g}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          <Button
            type="button"
            disabled={isPending}
            onClick={() => handleFinish(false)}
            className="h-11 w-full gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {selectedGenres.length > 0 ? "حفظ التفضيلات والمتابعة" : "متابعة"}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleFinish(true)}
            className="h-11 w-full gap-2 border-border text-muted-foreground hover:text-foreground"
          >
            <span>تخطي هذه الخطوة</span>
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          </Button>
        </div>
      </div>
    </AccountShell>
  );
}
