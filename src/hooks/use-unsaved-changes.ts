"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { shouldGuardLink } from "@/lib/unsaved-text";

const WARNING = "لديك تغييرات غير محفوظة. هل تريد مغادرة الصفحة؟";

/** Covers browser unload and ordinary Next links. Programmatic exits use confirmLeave. */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useLayoutEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      if (shouldGuardLink(event, link.target, link.href, window.location.href) && !window.confirm(WARNING)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, []);
  return {
    confirmLeave: () => !dirtyRef.current || window.confirm(WARNING),
    markSaved: () => { dirtyRef.current = false; },
  };
}
