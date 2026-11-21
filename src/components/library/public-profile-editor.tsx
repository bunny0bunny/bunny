"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updatePublicProfile } from "@/lib/public-profile-actions";
import { cleanHandle, COVER_THEMES, MAX_FEATURED_BADGES, MAX_FEATURED_SERIES, type CoverTheme } from "@/lib/public-profile-policy";

type Work = { id: string; title: string; coverPath: string };
type Badge = { id: string; labelAr: string };

export function PublicProfileEditor(props: {
  profileId: string;
  handle: string | null;
  profilePublic: boolean;
  coverTheme: CoverTheme;
  library: Work[];
  featuredSeriesIds: string[];
  earnedBadges: Badge[];
  featuredBadgeIds: string[];
}) {
  const [handle, setHandle] = useState(props.handle ?? "");
  const [isPublic, setIsPublic] = useState(props.profilePublic);
  const [cover, setCover] = useState<CoverTheme>(props.coverTheme);
  const [works, setWorks] = useState<string[]>(props.featuredSeriesIds);
  const [badges, setBadges] = useState<string[]>(props.featuredBadgeIds);
  const [saved, setSaved] = useState<{ href: string | null } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const handleCheck = cleanHandle(handle);
  const previewHref = `/u/${(handleCheck.ok && handleCheck.handle) || props.handle || props.profileId}`;

  const toggle = (list: string[], id: string, max: number) =>
    list.includes(id) ? list.filter(x => x !== id) : list.length >= max ? list : [...list, id];

  function save() {
    setError(""); setSaved(null);
    if (!handleCheck.ok) { setError(handleCheck.error); return; }
    start(async () => {
      const result = await updatePublicProfile({ handle: handle || null, profilePublic: isPublic, coverTheme: cover, featuredSeriesIds: works, featuredBadgeIds: badges });
      if (result.ok) setSaved({ href: result.href }); else setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/40 p-3">
        <div>
          <Label htmlFor="profile-public" className="text-sm font-semibold">بروفايل عام</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">يظهر لأي حد: الاسم والصورة والنبذة والأنواع والشارات والمفضلة وتعليقاتك العامة. بريدك وسجل قراءتك لا يظهران أبدًا.</p>
        </div>
        <Switch id="profile-public" checked={isPublic} onCheckedChange={setIsPublic} />
      </div>

      <div>
        <Label htmlFor="profile-handle" className="text-sm font-semibold">اسم المستخدم (رابط بروفايلك)</Label>
        <div className="mt-2 flex items-center gap-2" dir="ltr">
          <span className="shrink-0 text-sm text-muted-foreground">/u/</span>
          <Input id="profile-handle" value={handle} onChange={e => setHandle(e.target.value)} placeholder="your_name" maxLength={24} autoComplete="off" spellCheck={false} className="text-left" aria-invalid={!handleCheck.ok} />
        </div>
        <p className={`mt-1.5 text-xs ${handleCheck.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {handleCheck.ok ? "حروف إنجليزية صغيرة وأرقام و _ (اختياري). بدونه يكون الرابط برقم حسابك." : handleCheck.error}
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">غلاف البروفايل</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(Object.keys(COVER_THEMES) as CoverTheme[]).map(key => (
            <button key={key} type="button" onClick={() => setCover(key)} aria-pressed={cover === key}
              className={`relative h-14 overflow-hidden rounded-xl border-2 transition ${cover === key ? "border-primary" : "border-transparent hover:border-border"}`}>
              <span className={`absolute inset-0 ${COVER_THEMES[key].className}`} aria-hidden />
              <span className="relative text-[11px] font-semibold text-white drop-shadow">{COVER_THEMES[key].labelAr}</span>
              {cover === key && <Check className="absolute end-1 top-1 size-4 text-white" aria-hidden />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">المفضلة عندي <span className="font-normal text-muted-foreground">({works.length}/{MAX_FEATURED_SERIES})</span></legend>
        {props.library.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">أضف أعمالًا إلى مكتبتك أولًا، ثم اختر منها مفضلتك هنا.</p> :
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {props.library.map(work => {
              const index = works.indexOf(work.id);
              return <button key={work.id} type="button" onClick={() => setWorks(w => toggle(w, work.id, MAX_FEATURED_SERIES))} aria-pressed={index >= 0} title={work.title}
                className={`relative aspect-[2/3] overflow-hidden rounded-lg border-2 transition ${index >= 0 ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                <Image src={work.coverPath || "/art/covers/no-cover.svg"} alt={work.title} fill sizes="80px" className="object-cover" />
                {index >= 0 && <span className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{index + 1}</span>}
              </button>;
            })}
          </div>}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">شارات مميزة <span className="font-normal text-muted-foreground">({badges.length}/{MAX_FEATURED_BADGES})</span></legend>
        {props.earnedBadges.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">اكتسب شارة أولًا لتعرضها هنا.</p> :
          <div className="mt-2 flex flex-wrap gap-2">
            {props.earnedBadges.map(b => <button key={b.id} type="button" onClick={() => setBadges(list => toggle(list, b.id, MAX_FEATURED_BADGES))} aria-pressed={badges.includes(b.id)}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs transition ${badges.includes(b.id) ? "border-gold/60 bg-gold/15 text-gold" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {badges.includes(b.id) && <Check className="size-3" aria-hidden />}{b.labelAr}</button>)}
          </div>}
        <p className="mt-1.5 text-xs text-muted-foreground">لو ما اخترتش، بتظهر أعلى شاراتك تلقائيًا.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden />}حفظ البروفايل العام</Button>
        {isPublic && <Link href={previewHref} className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline" target="_blank">عرض بروفايلي <ExternalLink className="size-3.5" aria-hidden /></Link>}
        <p aria-live="polite" className="text-sm">
          {error && <span className="text-destructive">{error}</span>}
          {saved && <span className="text-success">{saved.href ? "اتحفظ. بروفايلك ظاهر للناس." : "اتحفظ. بروفايلك خاص الآن."}</span>}
        </p>
      </div>
    </div>
  );
}
