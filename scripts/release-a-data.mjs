/**
 * Bunny Library — Release A content manifest (single source for art generation + DB seed).
 * ALL content is original fiction created for this demo (docs/DECISIONS.md D-05).
 * No real titles, franchises, or copyrighted material.
 */

export const SERIES = [
  {
    slug: "warden-of-the-twilight-gate",
    titleAr: "حارس بوابة الشفق",
    titleOriginal: "Twilight Gate Warden",
    format: "manga",
    motif: "gate",
    status: "ongoing",
    author: "يوسف الأندلسي",
    translator: "نورة السبيعي",
    accent: "#9B7BFF",
    isFeatured: true,
    ratingAvg: 4.7,
    ratingCount: 214,
    reads: 18240,
    synopsisAr:
      "على أطراف مدينة سَرْدُونيا العائمة تقف بوابة قديمة تُغلق وجهيها عند الغروب، ولا يمرّ منها إلا ما يحمل ختم الحارس. حين ورث «راوِي» الختم عن جدّه المفقود، اكتشف أن كل ليلة تمرّ دون حراسة تسرق من العالم ذكرى واحدة. بين زملاء فريق الحرس المنهكين، وكائنات تسكن ما بين الظل والنسيان، يتعلم راوِي أن الحارس الحقيقي لا يقاتل الوحوش، بل يحرس ما تبقّى من بابٍ يوماً. مانجا أكشن فانتازية بإيقاع بطيء في الهمس وسريع في القتال، عن الوصايا التي نرثها ومن نقرر أن نكون لها.",
    genres: ["فانتازيا", "أكشن", "غموض"],
    tags: ["بوابات", "وصايا", "مدينة عائمة", "حراسة ليلية"],
    chapters: [
      { number: 1, titleAr: "الختم الذي لا ينام", pages: 12, workflow: "published" },
      { number: 2, titleAr: "ما لا يعبر عند الغروب", pages: 11, workflow: "published" },
      { number: 3, titleAr: "ضوء بارد على السلالم", pages: 10, workflow: "published" },
      { number: 4, titleAr: "حارس بلا ذكرى", pages: 12, workflow: "published" },
      { number: 5, titleAr: "الطاحن تحت البوابة", pages: 9, workflow: "review" },
    ],
  },
  {
    slug: "mint-leaf-cafe",
    titleAr: "مقهى أوراق النعناع",
    titleOriginal: "Mint Leaf Café",
    format: "manga",
    motif: "cafe",
    status: "completed",
    author: "آية ميزونو",
    translator: "ليان عبدالحميد",
    accent: "#5FCB9B",
    isFeatured: false,
    ratingAvg: 4.5,
    ratingCount: 168,
    reads: 12980,
    synopsisAr:
      "في زقاح لا يظهر على الخرائط، مقهى صغير يفتح فقط في ساعات المطر. «نُور» وردت لتُصلح ماضيها فورثت مقهى خالتها، ومعه دفترًا يضم طلبات الزبائن التي لم تعد… طلبتُ القهوة التي أحببتُها عاماً مضى، فيعدّها لك المقهى كما لو أنك لم تغب. مانجا دافئة عن شريحة من الحياة: أربعة مقاعد، لوحة سوداء تُكتب عليها عبارات قصيرة، ومطر لا يتوقف. قصص تتشابك على حافة الكوب وتنتهي حين يصفو المطر والقلب معاً.",
    genres: ["شريحة من الحياة", "دراما"],
    tags: ["مقهى", "مطر", "دفتر الطلبات", "دفء"],
    chapters: [
      { number: 1, titleAr: "يوم المطر الأول", pages: 10, workflow: "published" },
      { number: 2, titleAr: "الزبون الذي أعاد كتابة اللوحة", pages: 9, workflow: "published" },
      { number: 3, titleAr: "نعناع مضاعف، سكر مفرد", pages: 10, workflow: "published" },
      { number: 4, titleAr: "آخر فنجان قبل الإقفال", pages: 11, workflow: "published" },
    ],
  },
  {
    slug: "harbor-of-the-missing",
    titleAr: "ملف حالة: مرسى الغائبين",
    titleOriginal: "Case File: Harbor of the Missing",
    format: "manga",
    motif: "harbor",
    status: "ongoing",
    author: "سليم قدري",
    translator: "نورة السبيعي",
    accent: "#7FA8C9",
    isFeatured: false,
    ratingAvg: 4.3,
    ratingCount: 97,
    reads: 9310,
    synopsisAr:
      "مدينة مرساة تفقد ثلاثة من أبنائها كل عام في ليلة العشرين من نوفمبر، ثم تعود بعد عشر سنوات… دون أن تُكبر يوماً. المحققة «هَيَم» تفتح الملف الذي أغلقته جدّتها قبل نصف قرن، فتجد أن كل حقيبة غائبين تحوي صورةً واحدة مكررة: صورة الفانوس الأزرق على رصيفٍ غير موجود في خرائط المدينة. غموض بطيء الاحتراق عن ذاكرة المدن وحقائقها المرفوضة، وأرشيفٍ يعرف اسمك قبل أن تعرفه.",
    genres: ["غموض", "إثارة"],
    tags: ["أرشيف", "فوانيس", "قضايا مغلقة"],
    chapters: [
      { number: 1, titleAr: "الحقيبة رقم ١٧", pages: 11, workflow: "published" },
      { number: 2, titleAr: "الفانوس الأزرق", pages: 10, workflow: "published" },
      { number: 3, titleAr: "شهادة بلا وجه", pages: 9, workflow: "published" },
      { number: 4, titleAr: "رصيف غير مرسوم", pages: 10, workflow: "draft" },
    ],
  },
  {
    slug: "wedding-of-the-red-moon",
    category: "manga",
    titleAr: "زفاف القمر الأحمر",
    titleOriginal: "Wedding of the Red Moon",
    format: "webtoon",
    motif: "redmoon",
    status: "ongoing",
    author: "لينا هوانغ",
    translator: "دانة القحطاني",
    accent: "#E56B6F",
    isFeatured: true,
    ratingAvg: 4.8,
    ratingCount: 351,
    reads: 26470,
    synopsisAr:
      "في ليلة يكتمل القمر بلون الدم، تُتزوج فتاة القرية من حارس القصر الذي لم يرَ أحدٌ وجهه قط. «سُها» قبلت الزواج لتنقذ أختها من اللعنة، لكنها اكتشفت في الليلة الأولى أن العريس يتبادل معها الوجهين: نصف ليلٍ إنساناً حزيناً، ونصف ليلٍ ظلّاً جائعاً. عقد الزواج يكتب نفسه بمدى الحياة، وشرط إبطاله واحد: أن تحبّ ظلّه كما أحبّ إنسانه. ويبتون رومانسي فانتازي بلوحة ليلية دافئة، عن العهود التي تُبرم مع الظلال.",
    genres: ["رومانسي", "فانتازيا", "دراما"],
    tags: ["عقد قديم", "قمر أحمر", "ظلال", "قصر"],
    chapters: [
      { number: 1, titleAr: "ليلة العقد", panels: 7, workflow: "published" },
      { number: 2, titleAr: "نصفان لوجه واحد", panels: 7, workflow: "published" },
      { number: 3, titleAr: "شاي قبل الفجر", panels: 6, workflow: "published" },
      { number: 4, titleAr: "ما يكتبه العقد", panels: 7, workflow: "published" },
      { number: 5, titleAr: "الظل يروي حكايته", panels: 7, workflow: "published", isPremiumDemo: true },
      { number: 6, titleAr: "زهرة في قصر بلا شمس", panels: 6, workflow: "review" },
    ],
  },
  {
    slug: "city-pulse-zero",
    category: "manhwa",
    titleAr: "نبض المدينة صفر",
    titleOriginal: "City Pulse Zero",
    format: "webtoon",
    motif: "city",
    status: "ongoing",
    author: "عمر الدوسري",
    translator: "دانة القحطاني",
    accent: "#9B7BFF",
    isFeatured: true,
    ratingAvg: 4.4,
    ratingCount: 189,
    reads: 15320,
    synopsisAr:
      "في «حيّد الصفر»، تنبض المدينة بذبذبة كهربائية تُدار بالساعات لا بالقلوب. حين تعطب الشبكة خمس دقائق كاملة — أول انقطاع منذ ستين عاماً — يرى الفني «زياد» شيئاً في الشارع لم يصممه أحد: باباً. بعد ذلك، كل عطلٍ يصلحه يقترب المدينة من تذكّر ما قبل النبض. خيال علمي ويبتون سريع الإيقاع عن مدن تُدار بالخوف من الظلام، وأول ضوءٍ يُشعلها صاخباً.",
    genres: ["خيال علمي", "أكشن", "غموض"],
    tags: ["مدينة", "ذبذبة", "أبواب", "فني صيانة"],
    chapters: [
      { number: 1, titleAr: "انقطاع في حيّ الصفر", panels: 7, workflow: "published" },
      { number: 2, titleAr: "الباب في منتصف الشارع", panels: 7, workflow: "published" },
      { number: 3, titleAr: "خريطة لا تعترف بالباب", panels: 6, workflow: "published" },
      { number: 4, titleAr: "ذراع نزع الأمان", panels: 7, workflow: "published" },
    ],
  },
  {
    slug: "zainab-wardrobe",
    category: "manhwa",
    titleAr: "خزانة زينب",
    titleOriginal: "Zainab's Wardrobe",
    format: "webtoon",
    motif: "wardrobe",
    status: "hiatus",
    author: "مريم العمري",
    translator: "ليان عبدالحميد",
    accent: "#DDBB77",
    isFeatured: false,
    ratingAvg: 4.6,
    ratingCount: 142,
    reads: 11880,
    synopsisAr:
      "خزانة الجدة زينب لا تُفتح إلا في آخر خميس من السنة، وفيها أثوابٌ لمناسبات لم تحدث بعد: ثوب زفاف أختٍ لم تُبَع بعد، وجبة ختام لم تُعلن، وثوب حجٍّ بوسادة مكتوب عليها «لمن يبقى». حين ترث حفيدتها البيت القديم والخزانة، تبدأ أختام المناسبات بالكتابة على أكمامها هي. ويبتون تاريخي عائلي، دافئ ومؤلم أحياناً، عن الذكرى المحفوظة في القماش.",
    genres: ["تاريخي", "دراما"],
    tags: ["خزانة", "أثواب", "وصايا", "بيت العائلة"],
    chapters: [
      { number: 1, titleAr: "آخر خميس من السنة", panels: 6, workflow: "published" },
      { number: 2, titleAr: "ثوب بلا مناسبة", panels: 6, workflow: "published" },
      { number: 3, titleAr: "وسادة مكتوب عليها «لمن يبقى»", panels: 7, workflow: "published" },
    ],
  },
];

export const COLLECTIONS = [
  {
    slug: "after-midnight",
    titleAr: "مغامرات ما بعد منتصف الليل",
    descriptionAr: "قصص تبدأ حين يخفت الضجيج: بوابات، مدن تتنفس، وظلال تتفاوض. اختر عنوانك ودع الليل يتولى الباقي.",
    theme: "violet",
    displayOrder: 1,
    isFeatured: true,
    seriesSlugs: ["warden-of-the-twilight-gate", "city-pulse-zero", "wedding-of-the-red-moon", "harbor-of-the-missing"],
  },
  {
    slug: "warm-pages",
    titleAr: "أوراق دافئة",
    descriptionAr: "مقاهٍ تُفتح في المطر، خزائن تُفتح مرة في السنة، وأشياء صغيرة تعرف اسمك. قراءة هادئة لمساءٍ طويل.",
    theme: "gold",
    displayOrder: 2,
    isFeatured: true,
    seriesSlugs: ["mint-leaf-cafe", "zainab-wardrobe"],
  },
];

/** Seeded reading progress for the demo reader account (drives the Continue Reading hero). */
export const DEMO_PROGRESS = [
  { seriesSlug: "wedding-of-the-red-moon", chapterNumber: 2, pageIndex: 4, percent: 62 },
  { seriesSlug: "warden-of-the-twilight-gate", chapterNumber: 1, pageIndex: 5, percent: 41 },
  { seriesSlug: "city-pulse-zero", chapterNumber: 1, pageIndex: 1, percent: 18 },
];

export const DEMO_ACCOUNTS = [
  { email: "admin@bunny.demo", nickname: "أمين المكتبة", role: "admin", password: "bunny-admin-2026" },
  { email: "editor@bunny.demo", nickname: "محرر التحرير", role: "editor", password: "bunny-editor-2026" },
  { email: "reader@bunny.demo", nickname: "قارئ باني", role: "reader", password: "bunny-reader-2026" },
];

/** Deterministic PRNG so art is reproducible across regenerations. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
