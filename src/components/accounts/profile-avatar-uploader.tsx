"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sniffPage, MAX_PAGE_PIXELS } from "@/lib/media/formats";

const ERRORS: Record<string, string> = {
  rate_limit: "غيّرت صورتك كثيرًا خلال ساعة. حاول لاحقًا.",
  disabled: "رفع الصور متوقف مؤقتًا.",
  invalid_image: "الصورة غير صالحة. اختر صورة أخرى.",
  invalid_length: "الصورة أكبر من المسموح.",
  unauthenticated: "سجّل الدخول مرة أخرى ثم أعد المحاولة.",
  storage_failed: "تعذّر حفظ الصورة الآن. حاول بعد قليل.",
};
export function profileAvatarError(code?: string) { return (code && ERRORS[code]) || "تعذّر حفظ الصورة. حاول مرة أخرى."; }

/** Remove the uploaded picture; the reader's preset or initials show instead. */
export async function deleteProfileAvatar(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/profile-avatar", { method: "DELETE", headers: { "x-profile-avatar": "1" } });
    return (await response.json()) as { ok: boolean; error?: string };
  } catch { return { ok: false, error: "unavailable" }; }
}

/** Pick an image, crop it to a square on the device, and upload a small WebP. */
export function ProfileAvatarUploader({ disabled, onUploaded }: { disabled?: boolean; onUploaded(path: string): void }) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [position, setPosition] = useState({ x: 50, y: 50, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { bitmapRef.current?.close(); }, []);
  useEffect(() => {
    const context = bitmap && canvas.current?.getContext("2d");
    if (!bitmap || !context) return;
    const scale = Math.max(512 / bitmap.width, 512 / bitmap.height) * position.zoom;
    const width = bitmap.width * scale, height = bitmap.height * scale;
    context.clearRect(0, 0, 512, 512);
    context.drawImage(bitmap, -(width - 512) * position.x / 100, -(height - 512) * position.y / 100, width, height);
  }, [bitmap, position]);
  function discard() { bitmapRef.current?.close(); bitmapRef.current = null; setBitmap(null); }
  async function choose(file: File) {
    setError("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 6 * 1024 * 1024) throw new Error("اختر صورة PNG أو JPEG أو WebP حتى 6 ميجابايت.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let width: number, height: number;
      if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); width = view.getUint32(16); height = view.getUint32(20);
      } else ({ width, height } = sniffPage(bytes));
      if (!width || !height || width > 16000 || height > 16000 || width * height > MAX_PAGE_PIXELS) throw new Error("أبعاد الصورة كبيرة جدًا. اختر صورة أصغر.");
      const image = await createImageBitmap(file, { imageOrientation: "from-image" });
      bitmapRef.current?.close(); bitmapRef.current = image; setBitmap(image); setPosition({ x: 50, y: 50, zoom: 1 });
    } catch (cause) { setError(cause instanceof Error && /[؀-ۿ]/.test(cause.message) ? cause.message : "تعذّر فتح الصورة. اختر صورة صالحة."); }
  }
  async function save() {
    if (!canvas.current || !bitmap) return;
    setBusy(true); setError("");
    try {
      let blob: Blob | undefined;
      for (const quality of [0.9, 0.8, 0.65, 0.5]) {
        blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob((value) => (value ? resolve(value) : reject(new Error("تعذّر تجهيز الصورة."))), "image/webp", quality));
        if (blob.type !== "image/webp") throw new Error("المتصفح لا يدعم حفظ WebP. جرّب متصفحًا أحدث.");
        if (blob.size <= 256 * 1024) break;
      }
      if (!blob || blob.size > 256 * 1024) throw new Error("الصورة الناتجة كبيرة. اختر صورة أبسط.");
      const response = await fetch("/api/profile-avatar", { method: "POST", headers: { "x-profile-avatar": "1", "content-type": "image/webp" }, body: blob, signal: AbortSignal.timeout(60000) });
      const result = (await response.json()) as { ok: boolean; error?: string; avatarPath?: string | null };
      if (!response.ok || !result.ok || typeof result.avatarPath !== "string") throw new Error(profileAvatarError(result.error));
      discard(); onUploaded(result.avatarPath);
    } catch (cause) { setError(cause instanceof Error && /[؀-ۿ]/.test(cause.message) ? cause.message : profileAvatarError()); }
    finally { setBusy(false); }
  }
  const locked = disabled || busy;
  return (
    <div className="space-y-3" aria-busy={busy}>
      {!bitmap && (
        <label htmlFor={`${id}-file`} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 text-xs font-semibold text-foreground transition hover:border-primary/60 ${locked ? "pointer-events-none opacity-60" : ""}`}>
          <Upload className="size-4 text-primary" aria-hidden />
          ارفع صورة من جهازك
          <input id={`${id}-file`} type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choose(file); }} />
        </label>
      )}
      {bitmap && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <canvas ref={canvas} width={512} height={512} role="img" aria-label="معاينة قص الصورة" className="aspect-square w-40 max-w-full rounded-full border border-border bg-secondary" />
          {([{ key: "x", label: "الموضع الأفقي", min: 0, max: 100, step: 1 }, { key: "y", label: "الموضع الرأسي", min: 0, max: 100, step: 1 }, { key: "zoom", label: "التكبير", min: 1, max: 3, step: 0.05 }] as const).map((control) => (
            <label key={control.key} className="block max-w-xs text-xs text-muted-foreground">
              {control.label}
              <input type="range" min={control.min} max={control.max} step={control.step} value={position[control.key]} disabled={locked} onChange={(event) => setPosition({ ...position, [control.key]: Number(event.target.value) })} className="mt-1 block min-h-11 w-full" />
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={locked} onClick={() => void save()} className="h-11 text-xs">{busy ? "جارٍ الرفع…" : "استخدم هذه الصورة"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={locked} onClick={discard} className="h-11 text-xs">إلغاء</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
