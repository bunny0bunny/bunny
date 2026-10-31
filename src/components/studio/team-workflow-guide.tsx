import Link from 'next/link';

export function TeamWorkflowGuide({ role }: { role: 'contributor' | 'editor' }) {
  return <details className="mb-6 rounded-xl border border-border bg-card p-4 text-sm">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">كيف أُعدّ فصلًا وأرسله للمراجعة؟</summary>
    <ol className="mt-2 list-inside list-decimal space-y-2 leading-7 text-muted-foreground">
      <li>اطلب من الإدارة إسناد العمل إلى حسابك؛ دور المساهم أو المحرر وحده لا يتيح رفع فصول لجميع الأعمال.</li>
      <li>أنشئ فصلًا داخل عمل مسند إليك، ثم ارفع PDF للأعمال المصورة أو أدخل نص الفصل للروايات.</li>
      <li>احفظ التعديلات، عاين الفصل، ثم أرسله للمراجعة. إذا طُلبت تعديلات، صحّح المسودة وأرسلها مجددًا.</li>
    </ol>
    <p className="mt-3 leading-7">{role === 'editor' ? 'يمكنك مراجعة الفصول المسندة إليك وطلب التعديلات والتوصية بالاعتماد. الاعتماد النهائي والنشر والجدولة للإدارة.' : 'يمكنك إعداد الفصول ورفعها وإرسالها للمراجعة. الاعتماد النهائي والنشر والجدولة للإدارة.'}</p>
    <p className="mt-2 leading-7 text-muted-foreground">ملف المترجم العام مخصص لعرض الأعمال والمتابعة، ولا يمنح صلاحية الرفع. الإدارة تربطه بالعمل بصورة مستقلة عن إسناد الحساب.</p>
    <Link href="/notifications" className="mt-2 inline-flex min-h-11 items-center text-primary underline underline-offset-4">إشعارات المراجعة والتعديلات</Link>
  </details>;
}
