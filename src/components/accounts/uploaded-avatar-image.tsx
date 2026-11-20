"use client";
import { useState, type ReactNode } from "react";

/** Shows an uploaded picture, falling back to the preset/initials if it fails to load. */
export function UploadedAvatarImage({ src, className, fallback }: { src: string; className: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(src)}
      className={`inline-block shrink-0 rounded-full bg-card object-cover ${className}`}
    />
  );
}
