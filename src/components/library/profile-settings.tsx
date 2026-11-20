"use client";

import { arabicError } from "@/lib/error-messages-ar";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Loader2, KeyRound, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/lib/actions";
import { changeAccountPassword } from "@/lib/account-actions";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { isProfileAvatarChoice } from "@/lib/avatars";
import { AvatarChoiceGrid, UPLOADED_AVATAR as UPLOADED } from "@/components/accounts/avatar-choice-grid";
import { ProfileAvatarUploader, deleteProfileAvatar, profileAvatarError } from "@/components/accounts/profile-avatar-uploader";


export function ProfileSettings({
  nickname,
  bio,
  avatarSeed,
  avatarPath = null,
  uploadsEnabled = false,
}: {
  nickname: string;
  bio: string;
  avatarSeed?: string | null;
  avatarPath?: string | null;
  uploadsEnabled?: boolean;
}) {
  const router = useRouter();
  const { update: updateSession } = useSession();

  // Profile details state
  const [name, setName] = useState(nickname);
  const [userBio, setUserBio] = useState(bio);
  // Older colour seeds still render; they are only re-sent once the reader picks a new picture.
  const [uploadedPath, setUploadedPath] = useState<string | null>(avatarPath);
  const [selectedSeed, setSelectedSeed] = useState<string>(
    avatarPath ? UPLOADED : avatarSeed || "initials"
  );
  // The preset behind an uploaded picture (shown if the upload is removed).
  const fallbackSeed = selectedSeed === UPLOADED ? avatarSeed || "initials" : selectedSeed;
  const [profileMsg, setProfileMsg] = useState("");
  const [profileError, setProfileError] = useState("");
  const [pendingProfile, startProfileTransition] = useTransition();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingPassword, startPasswordTransition] = useTransition();

  const handleSaveProfile = () => {
    setProfileMsg("");
    setProfileError("");

    if (name.trim().length < 2 || name.trim().length > 40) {
      setProfileError("الاسم يجب أن يكون بين حرفين و٤٠ حرفًا.");
      return;
    }

    startProfileTransition(async () => {
      // Picking a preset while an uploaded picture exists replaces the upload.
      if (uploadedPath && selectedSeed !== UPLOADED) {
        const removed = await deleteProfileAvatar();
        if (!removed.ok) {
          setProfileError(profileAvatarError(removed.error));
          return;
        }
        setUploadedPath(null);
      }
      const res = await updateProfile({
        nickname: name.trim(),
        bio: userBio.trim(),
        avatarSeed: isProfileAvatarChoice(selectedSeed) ? selectedSeed : undefined,
      } as unknown);

      if (!res.ok) {
        setProfileError(arabicError(res.error, "تعذّر حفظ التغييرات."));
        return;
      }

      setProfileMsg("تم حفظ بيانات الحساب بنجاح ✓");
      try {
        await updateSession?.({ name: name.trim() });
      } catch {}
      router.refresh();
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg("");
    setPasswordError("");

    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError("كلمة المرور الجديدة يجب أن تكون بين ١٢ و١٢٨ حرفًا.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("كلمتا المرور غير متطابقتين.");
      return;
    }

    startPasswordTransition(async () => {
      const res = await changeAccountPassword({
        currentPassword,
        password: newPassword,
      });

      if (!res.ok) {
        setPasswordError(arabicError(res.error, "تعذّر تغيير كلمة المرور. تأكد من كلمة المرور الحالية."));
        return;
      }

      setPasswordMsg("تم تغيير كلمة المرور بنجاح. يتم تسجيل الخروج لإلغاء الجلسات القديمة...");
      setTimeout(async () => {
        await signOut({ redirect: false });
        router.push("/login");
        router.refresh();
      }, 1200);
    });
  };

  return (
    <div className="space-y-6">
      {/* Profile Info & Avatar Selection */}
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 block text-xs font-semibold text-foreground">صورتك في الموقع</legend>
          <div className="mb-3 flex items-center gap-3">
            <AccountAvatar seed={fallbackSeed} src={selectedSeed === UPLOADED ? uploadedPath : null} name={name} className="size-16 border-2 border-primary/50 shadow-sm" brandMarkSize="size-9" />
            <p className="text-xs leading-6 text-muted-foreground">تظهر بجانب اسمك في التعليقات وقائمة الحساب. اختر صورة جاهزة أو ارفع صورتك.</p>
          </div>
          <AvatarChoiceGrid selected={selectedSeed} onSelect={setSelectedSeed} name={name} uploadedPath={uploadedPath} fallbackSeed={fallbackSeed} />
          {uploadsEnabled && (
            <div className="mt-3">
              <ProfileAvatarUploader
                disabled={pendingProfile}
                onUploaded={(path) => {
                  setUploadedPath(path);
                  setSelectedSeed(UPLOADED);
                  setProfileMsg("تم حفظ صورتك ✓");
                  router.refresh();
                }}
              />
            </div>
          )}
        </fieldset>

        <div>
          <Label htmlFor="pf-name" className="mb-1.5 block text-xs text-muted-foreground">
            الاسم الظاهر
          </Label>
          <Input
            id="pf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="h-11 bg-card"
          />
        </div>

        <div>
          <Label htmlFor="pf-bio" className="mb-1.5 block text-xs text-muted-foreground">
            نبذة قصيرة (اختياري)
          </Label>
          <Textarea
            id="pf-bio"
            value={userBio}
            onChange={(e) => setUserBio(e.target.value)}
            rows={2}
            maxLength={300}
            className="resize-none bg-card"
          />
        </div>

        {profileError && (
          <p role="alert" className="text-xs text-danger">
            {profileError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={pendingProfile || name.trim().length < 2}
            onClick={handleSaveProfile}
            className="h-11 bg-primary px-5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            {pendingProfile ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            حفظ البيانات
          </Button>
          {profileMsg && (
            <span className="text-xs font-medium text-emerald-400" aria-live="polite">
              {profileMsg}
            </span>
          )}
        </div>
      </div>

      {/* Password Change Section */}
      <div className="border-t border-border/50 pt-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-foreground">
          <KeyRound className="size-4 text-primary" aria-hidden />
          تغيير كلمة المرور
        </h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          عند تغيير كلمة المرور، سيتم تسجيل خروجك لإلغاء جميع الجلسات القديمة وتأمين حسابك.
        </p>

        <form onSubmit={handleChangePassword} className="space-y-3" aria-label="نموذج تغيير كلمة المرور">
          <div>
            <Label htmlFor="curr-pass" className="mb-1.5 block text-xs text-muted-foreground">
              كلمة المرور الحالية
            </Label>
            <Input
              id="curr-pass"
              type={showPassword ? "text" : "password"}
              dir="ltr"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
              className="h-11 bg-card pe-10 text-left"
              autoComplete="current-password"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="new-pass" className="mb-1.5 block text-xs text-muted-foreground">
                كلمة المرور الجديدة
              </Label>
              <span className="text-[10px] text-muted-foreground">١٢ حرفًا على الأقل</span>
            </div>
            <div className="relative">
              <Input
                id="new-pass"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-11 bg-card pe-10 text-left"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground transition hover:text-foreground"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="conf-new-pass" className="mb-1.5 block text-xs text-muted-foreground">
              تأكيد كلمة المرور الجديدة
            </Label>
            <Input
              id="conf-new-pass"
              type={showPassword ? "text" : "password"}
              dir="ltr"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="h-11 bg-card text-left"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </div>

          {passwordError && (
            <p role="alert" className="text-xs text-danger">
              {passwordError}
            </p>
          )}

          {passwordMsg && (
            <p role="status" className="text-xs text-emerald-400">
              {passwordMsg}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={pendingPassword || !currentPassword || newPassword.length < 12}
            className="h-11 bg-secondary text-xs font-semibold text-foreground hover:bg-secondary/80"
          >
            {pendingPassword ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
            تحديث كلمة المرور
          </Button>
        </form>
      </div>
    </div>
  );
}
