"use client";

import { useEffect, useRef, useState } from "react";
import { decodeTextDraft, encodeTextDraft, textDraftKey, decodeFormTextDraft, encodeFormTextDraft, formTextDraftKey, type FormTextDraftScope, type TextDraft, type TextDraftScope } from "@/lib/unsaved-text";

/** One storage implementation for both revision text and creation/metadata form text. */
function useSessionDraft<T>(key: string, identity: string, decode: (raw: string | null) => T | null, encoded: string, dirty: boolean, enabled = true) {
  const [offer, setOffer] = useState<{ identity: string; text: T } | null>(null);
  const loadedIdentity = useRef<string | null>(null);
  const unresolvedIdentity = useRef<string | null>(null);
  useEffect(() => {
    let recovered: T | null = null;
    if (enabled) try { recovered = decode(sessionStorage.getItem(key)); } catch { /* Privacy mode: exit warnings still work. */ }
    loadedIdentity.current = identity;
    // Block the following write effect in this same commit before state updates render the offer.
    unresolvedIdentity.current = recovered ? identity : null;
    // Synchronize an existing tab value; restoration itself remains an explicit event.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOffer(recovered ? { identity, text: recovered } : null);
  }, [key, identity, enabled]);
  useEffect(() => {
    if (!enabled || !dirty || loadedIdentity.current !== identity || unresolvedIdentity.current === identity) return;
    try { sessionStorage.setItem(key, encoded); } catch { /* Quota/privacy mode: preserve live inputs and exit warning. */ }
  }, [key, identity, encoded, dirty, enabled, offer]);
  const clear = () => { unresolvedIdentity.current = null; try { sessionStorage.removeItem(key); } catch {} setOffer(null); };
  return { recovered: offer?.identity === identity ? offer.text : null, dismiss: clear, clear };
}

/** Tab-scoped, actor/version-bound text only. Never persists media or upload state. */
export function useSessionTextDraft(scope: TextDraftScope, text: TextDraft, dirty: boolean) {
  const key = textDraftKey(scope);
  return useSessionDraft(key, key, raw => decodeTextDraft(raw, scope), encodeTextDraft(scope, text), dirty, Boolean(scope.actorId));
}

export function useSessionFormDraft(scope: FormTextDraftScope, fields: Record<string, string>, dirty: boolean) {
  const key = formTextDraftKey(scope);
  return useSessionDraft(key, `${key}:${scope.serverSnapshot}`, raw => decodeFormTextDraft(raw, scope, Object.keys(fields)), encodeFormTextDraft(scope, fields), dirty, Boolean(scope.actorId));
}
