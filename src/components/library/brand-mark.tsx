import Image from "next/image";

/** Optimized versions of the founder's supplied logo; original art preserved. */
export function BrandMark({ className = "size-11", alt = "", resolution = 128 }: { className?: string; alt?: string; resolution?: 128 | 256 }) {
  return (
    <Image
      src={`/brand/bunny-mark-${resolution}.webp`}
      width={resolution}
      height={resolution}
      alt={alt}
      className={`shrink-0 object-contain ${className}`}
      unoptimized
    />
  );
}
