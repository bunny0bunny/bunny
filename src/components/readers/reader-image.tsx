"use client";

import Image from "next/image";
import { useState } from "react";

export function ReaderImage({ src, fallbackImagePath, alt, width, height, sizes, eager = false }: {
  src: string; fallbackImagePath?: string; alt: string; width: number; height: number; sizes: string; eager?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [fallbackSource, setFallbackSource] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fallback = fallbackImagePath && /^\/api\/media\/[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(fallbackImagePath) ? fallbackImagePath : undefined;
  const usingFallback = Boolean(fallback && fallbackSource === src);
  const imageSource = usingFallback ? fallback! : src;
  const failed = failedSource === src;
  return <div className="relative w-full" style={{ aspectRatio: `${width}/${height}` }}>
    {!failed ? <Image key={`${imageSource}:${attempt}`} src={imageSource} alt={alt} fill sizes={sizes} className="object-contain"
      unoptimized={Boolean(fallback) || imageSource.startsWith("/api/media/")}
      loading={eager ? "eager" : "lazy"} onError={() => {
        if (fallback && !usingFallback && /^https:\/\//i.test(src)) {
          setFallbackSource(src);
          setFailedSource(null);
        } else setFailedSource(src);
      }} /> :
      <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-4 text-center"
        onClick={event => event.stopPropagation()}>
        <p className="text-sm font-semibold">تعذّر تحميل {alt}</p>
        <button type="button" className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => { setFailedSource(null); setAttempt(value => value + 1); }}>إعادة المحاولة</button>
      </div>}
  </div>;
}
