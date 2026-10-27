export function AdultBadge({ className = "" }: { className?: string }) {
  return <span aria-label="محتوى للبالغين فقط، 18 عامًا أو أكثر" className={`inline-flex shrink-0 items-center rounded-md border border-red-300/60 bg-red-700 px-2 py-1 text-xs font-bold text-white ${className}`}><bdi dir="ltr">+18</bdi></span>;
}
