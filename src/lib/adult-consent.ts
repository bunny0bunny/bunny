type ConsentStorage = Pick<Storage, "getItem" | "setItem">;
const browserStorage = () => window.sessionStorage;
const consentKey = (seriesId: string) => `bunyora:adult-consent:v1:${seriesId}`;
export function hasAdultConsent(seriesId: string, storage: () => ConsentStorage = browserStorage): boolean {
  try { return storage().getItem(consentKey(seriesId)) === "accepted"; } catch { return false; }
}
export function rememberAdultConsent(seriesId: string, storage: () => ConsentStorage = browserStorage): boolean {
  try { storage().setItem(consentKey(seriesId), "accepted"); return true; } catch { return false; }
}
