/**
 * Maps machine error codes returned by server actions to Arabic copy.
 * Messages that are already Arabic pass through unchanged, so callers can
 * wrap every `res.error` without checking its origin.
 */
const MESSAGES: Record<string, string> = {
  unauthenticated: "انتهت جلستك. سجّل الدخول مرة أخرى ثم أعد المحاولة.",
  forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  not_found: "لم يعد هذا العنصر موجودًا. حدّث الصفحة.",
  conflict: "تغيّرت البيانات منذ فتحت الصفحة. حدّث الصفحة ثم أعد المحاولة.",
  invalid: "البيانات المدخلة غير صالحة.",
  invalid_target: "لا يمكن تطبيق هذا الإجراء على هذا الحساب.",
  last_admin: "لا يمكن تنفيذ ذلك: يجب أن يبقى في الموقع مدير واحد نشط على الأقل.",
  invitation_not_pending: "هذه الدعوة لم تعد قائمة (قُبلت أو أُلغيت أو انتهت).",
  invitation_not_allowed: "لا يمكن إرسال دعوة لهذا الحساب بهذا الدور.",
  rate_limited: "محاولات كثيرة في وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
  rate_limit: "محاولات كثيرة في وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
};

const ARABIC = /[؀-ۿ]/;

export function arabicError(code: string | null | undefined, fallback = "تعذّر إتمام العملية. حاول مرة أخرى."): string {
  if (!code) return fallback;
  if (ARABIC.test(code)) return code;
  return MESSAGES[code] ?? fallback;
}
