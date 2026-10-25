export type MutationResult = { ok: true; id: string; duplicate?: boolean } | { ok: false; error: string; code?: string; uncertain?: boolean };
export async function requestMutation(url: string, body: unknown, fetcher: typeof fetch = fetch, timeoutMs = 30_000): Promise<MutationResult> {
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = (async (): Promise<MutationResult> => {
      const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Bunny-Request": "1" }, signal: controller.signal, body: JSON.stringify(body) });
      const result = await response.json();
      if (response.ok && result.ok === true && typeof result.id === "string") return result;
      return { ok: false, code: result.code, uncertain: response.status >= 500, error: typeof result.error === "string" ? result.error : "تعذّر حفظ التغيير. أعد تحميل الصفحة للتحقق ثم حاول مجددًا." };
    })();
    const timeout = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(new Error("content-request-deadline"));
      }, timeoutMs);
    });
    return await Promise.race([operation, timeout]);
  } catch {
    return { ok: false, uncertain: true, error: "تعذّر تأكيد الحفظ. تحقق من اتصالك ثم أعد المحاولة يدويًا؛ سيُستخدم معرّف الطلب نفسه." };
  } finally {
    clearTimeout(deadline);
  }
}
export function createSubmission(submissionId: string) {
  return (input: { title: string; category: string; referenceUrl?: string; message?: string }, fetcher?: typeof fetch) => requestMutation("/api/content-requests", { ...input, submissionId }, fetcher);
}
