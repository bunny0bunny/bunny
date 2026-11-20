"use client";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { PRESET_AVATARS } from "@/lib/avatars";

/** Sentinel choice for "keep my uploaded picture". */
export const UPLOADED_AVATAR = "uploaded";

/** Radio grid of the reader's own upload (if any), initials and the preset pictures. */
export function AvatarChoiceGrid({ selected, onSelect, name, uploadedPath, fallbackSeed, className = "grid-cols-4 sm:grid-cols-6 md:grid-cols-9" }: {
  selected: string; onSelect(choice: string): void; name: string; uploadedPath: string | null; fallbackSeed: string; className?: string;
}) {
  const choices = [...(uploadedPath ? [UPLOADED_AVATAR] : []), "initials", ...PRESET_AVATARS.map((a) => a.id)];
  return (
    <div role="radiogroup" aria-label="اختر صورة" className={`grid gap-2 ${className}`}>
      {choices.map((choice) => {
        const isSelected = selected === choice;
        const label = choice === UPLOADED_AVATAR ? "صورتي المرفوعة" : choice === "initials" ? "الحرف الأول من اسمك" : PRESET_AVATARS.find((a) => a.id === choice)?.labelAr ?? choice;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            title={label}
            onClick={() => onSelect(choice)}
            className={`flex aspect-square min-h-11 items-center justify-center rounded-full border-2 p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isSelected ? "border-primary ring-2 ring-primary/40" : "border-transparent opacity-80 hover:opacity-100"
            }`}
          >
            <AccountAvatar seed={choice === UPLOADED_AVATAR ? fallbackSeed : choice} src={choice === UPLOADED_AVATAR ? uploadedPath : null} name={name} className="size-full text-lg" brandMarkSize="size-6" />
          </button>
        );
      })}
    </div>
  );
}
