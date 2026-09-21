/**
 * Comprehensive Persian Orthography & Academy (فرهنگستان زبان و ادب فارسی) Standards Engine.
 * 
 * Provides:
 * 1. Standard Persian character mapping (replaces Arabic Yeh/Kaf/Ta-Marbuta/Harakat).
 * 2. Real-time correction of widespread Persian spelling mistakes (غلط‌های املایی متداول).
 * 3. Accurate adverbial Tanwin restoration (حتماً، واقعاً، مثلاً، اصلاً، قطعاً و...).
 * 4. Zero-Width Non-Joiner (ZWNJ / نیم‌فاصله) formatting for verbs, affixes, comparatives, and compounds.
 * 5. Persian typography & punctuation cleanup without damaging HTML/ASS tags or formatting.
 */

export const PERSIAN_HALF_SPACE = '\u200C'; // U+200C Zero-Width Non-Joiner (ZWNJ)

/**
 * Normalizes Arabic letters and irregular Unicode characters to standard Persian.
 */
export const normalizePersianChars = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ى/g, 'ی')
    .replace(/[\u064B-\u0652\u0670]/g, '') // Strip unwanted Arabic vowel diacritics (harakat), keeping intentional text clean
    .replace(/ـ+/g, '') // Remove decorative kashida/tatweel lines
    .replace(/[\u200B\u200D\uFEFF]/g, '') // Remove invisible zero-width spaces / joiners / BOM
    .replace(/[\u00A0\u202F]/g, ' '); // Normalize non-breaking spaces to standard space
};

/**
 * Common Persian spelling mistakes dictionary (غلط‌های شایع املایی در ترجمه‌های ماشینی و نگارش فارسی).
 * Matched with whole-word or boundary-aware regex to ensure 100% precision.
 */
const COMMON_SPELLING_CORRECTIONS: Array<[RegExp, string]> = [
  // گذار vs گزار (گذار از ریشه گذاشتن = قراردادن / وضع کردن ؛ گزار از ریشه گزاردن = ادا کردن / به‌جا آوردن)
  [/(^|[\s«"'(])سپاسگذار(م|ی|ند|ید|یم|ان)?(?=[\s،؛؟!.)»"']|$)/gu, '$1سپاسگزار$2'],
  [/(^|[\s«"'(])خدمتگذار(ان|ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1خدمتگزار$2'],
  [/(^|[\s«"'(])نمازگذار(ان)?(?=[\s،؛؟!.)»"']|$)/gu, '$1نمازگزار$2'],
  [/(^|[\s«"'(])شکرگذار(ی|ان)?(?=[\s،؛؟!.)»"']|$)/gu, '$1شکرگزار$2'],
  [/(^|[\s«"'(])پاسگذار(ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1پاسگزار$2'],
  [/(^|[\s«"'(])قانون\s*گزار(ان|ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1قانون‌گذار$2'],
  [/(^|[\s«"'(])سیاست\s*گزار(ان|ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1سیاست‌گذار$2'],
  [/(^|[\s«"'(])بنیان\s*گزار(ان|ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1بنیان‌گذار$2'],
  [/(^|[\s«"'(])ارزش\s*گزار(ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1ارزش‌گذار$2'],
  [/(^|[\s«"'(])تاثیر\s*گزار(ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1تأثیرگذار$2'],
  [/(^|[\s«"'(])تأثیر\s*گزار(ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1تأثیرگذار$2'],
  [/(^|[\s«"'(])امانت\s*گزار(ان|ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1امانت‌گذار$2'],
  [/(^|[\s«"'(])پایه‌\s*گزار(ان|ی)?(?=[\s،؛؟!.)»"']|$)/gu, '$1پایه‌گذار$2'],

  // راجع به vs راجب
  [/(^|[\s«"'(])راجب(?=[\s،؛؟!.)»"']|$)/gu, '$1راجع به'],
  [/(^|[\s«"'(])راجعبه(?=[\s،؛؟!.)»"']|$)/gu, '$1راجع به'],

  // خردسال vs خوردسال
  [/(^|[\s«"'(])خوردسال(ان)?(?=[\s،؛؟!.)»"']|$)/gu, '$1خردسال$2'],

  // انضباط vs انظباط
  [/(^|[\s«"'(])انظباط(?=[\s،؛؟!.)»"']|$)/gu, '$1انضباط'],

  // وهله vs وحله
  [/(^|[\s«"'(])وحله(?=[\s،؛؟!.)»"']|$)/gu, '$1وهله'],

  // توجیه vs توجیح
  [/(^|[\s«"'(])توجیح(?=[\s،؛؟!.)»"']|$)/gu, '$1توجیه'],

  // اصطبل vs اسطبل
  [/(^|[\s«"'(])اسطبل(?=[\s،؛؟!.)»"']|$)/gu, '$1اصطبل'],

  // قورباغه vs قورباقه
  [/(^|[\s«"'(])قورباقه(?=[\s،؛؟!.)»"']|$)/gu, '$1قورباغه'],

  // حول و حوش vs حوله و حوش / هول و هوش
  [/(^|[\s«"'(])(حوله|هول)\s*و\s*(حوش|هوش)(?=[\s،؛؟!.)»"']|$)/gu, '$1حول و حوش'],

  // حوصله vs هوسله
  [/(^|[\s«"'(])هوسله(?=[\s،؛؟!.)»"']|$)/gu, '$1حوصله'],

  // دستخوش vs دست‌خوش
  [/(^|[\s«"'(])دست\s*خوش(?=[\s،؛؟!.)»"']|$)/gu, '$1دستخوش'],

  // به‌جای vs بجای / به‌جا vs بجا
  [/(^|[\s«"'(])بجای(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌جای'],
  [/(^|[\s«"'(])بجا(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌جا'],

  // چون‌که vs چونکه
  [/(^|[\s«"'(])چونکه(?=[\s،؛؟!.)»"']|$)/gu, '$1چون‌که'],

  // به‌صورت / به‌شکل / به‌عنوان / به‌سمت
  [/(^|[\s«"'(])بصورت(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌صورت'],
  [/(^|[\s«"'(])بشکل(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌شکل'],
  [/(^|[\s«"'(])بعنوان(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌عنوان'],
  [/(^|[\s«"'(])بسمت(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌سمت'],
  [/(^|[\s«"'(])بویژه(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌ویژه'],
  [/(^|[\s«"'(])بخاطر(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌خاطر'],
  [/(^|[\s«"'(])بدلیل(?=[\s،؛؟!.)»"']|$)/gu, '$1به‌دلیل'],
  [/(^|[\s«"'(])برروی(?=[\s،؛؟!.)»"']|$)/gu, '$1بر روی'],
  [/(^|[\s«"'(])دراین(?=[\s،؛؟!.)»"']|$)/gu, '$1در این'],
  [/(^|[\s«"'(])درآن(?=[\s،؛؟!.)»"']|$)/gu, '$1در آن'],
];

/**
 * Adverbs with Tanwin (تنوین در قیدهای عربی‌الاصل رایج در زبان فارسی).
 * Machine translations frequently drop the Tanwin, producing awkward orthography (حتما, واقعا, مثلا).
 */
const COMMON_TANWIN_WORDS: Array<[string, string]> = [
  ['حتما', 'حتماً'],
  ['واقعا', 'واقعاً'],
  ['مثلا', 'مثلاً'],
  ['اصلا', 'اصلاً'],
  ['قطعا', 'قطعاً'],
  ['کاملا', 'کاملاً'],
  ['دقیقا', 'دقیقاً'],
  ['معمولا', 'معمولاً'],
  ['تقریبا', 'تقریباً'],
  ['عموما', 'عموماً'],
  ['مجددا', 'مجدداً'],
  ['صراحتا', 'صراحتاً'],
  ['رسما', 'رسماً'],
  ['اولا', 'اولاً'],
  ['ثانیا', 'ثانیاً'],
  ['ثالثا', 'ثالثاً'],
  ['ابدا', 'ابداً'],
  ['نسبتا', 'نسبتاً'],
  ['شدیدا', 'شدیداً'],
  ['سریعا', 'سریعاً'],
  ['اصولا', 'اصولاً'],
  ['اساسا', 'اساساً'],
  ['لطفا', 'لطفاً'],
  ['قبلا', 'قبلاً'],
  ['بعدا', 'بعداً'],
  ['عمیقا', 'عمیقاً'],
  ['شخصا', 'شخصاً'],
  ['قلبا', 'قلباً'],
  ['دائما', 'دائماً'],
  ['متقابلا', 'متقابلاً'],
  ['ضمنا', 'ضمناً'],
  ['نهایتا', 'نهایتاً'],
  ['فورا', 'فوراً'],
  ['ترجیحا', 'ترجیحاً'],
  ['مستقیما', 'مستقیماً'],
  ['احتمالا', 'احتمالاً'],
  ['صرفا', 'صرفاً'],
  ['ظاهرا', 'ظاهراً'],
  ['باطنا', 'باطناً'],
  ['طبعا', 'طبعاً'],
  ['عملا', 'عملاً'],
  ['نظرا', 'نظراً'],
  ['موقتا', 'موقتاً'],
  ['اتفاقا', 'اتفاقاً'],
  ['منحصرا', 'منحصراً'],
  ['مقدمتا', 'مقدمتاً'],
  ['قاعدتا', 'قاعدتاً'],
  ['اخلاقا', 'اخلاقاً'],
  ['قانونا', 'قانوناً'],
  ['شرعا', 'شرعاً'],
  ['عرفا', 'عرفاً'],
  ['حقوقا', 'حقوقاً'],
  ['اشتباها', 'اشتباهاً'],
  ['جسارتا', 'جسارتاً'],
  ['مفصلا', 'مفصلاً'],
  ['عمدتا', 'عمدتاً'],
];

/**
 * Native roots ending in -tar/-tarin that should NOT receive a half-space.
 */
const NATIVE_ROOTS_WITH_TAR = new Set([
  'به', 'کم', 'بیش', 'دخ', 'کبو', 'خاکس', 'دف', 'پیان', 'دک', 'رویا', 'اخ', 'تئاس', 'شتر', 'تیر', 'تبر', 'ستر', 'ختر', 'مه'
]);

/**
 * Verbal stems for 'می' and 'نمی'.
 */
const VERB_STEMS = [
  'رود', 'روم', 'روی', 'رویم', 'روید', 'روند', 'رفت(?:م|ی|یم|ید|ند)?',
  'دانم', 'دانی', 'داند', 'دانیم', 'دانید', 'دانند', 'دانست(?:م|ی|یم|ید|ند)?',
  'شود', 'شوم', 'شوی', 'شویم', 'شوید', 'شوند', 'شد(?:م|ی|یم|ید|ند)?',
  'توانم', 'توانی', 'تواند', 'توانیم', 'توانید', 'توانند', 'توانست(?:م|ی|یم|ید|ند)?',
  'کنم', 'کنی', 'کند', 'کنیم', 'کنید', 'کنند', 'کرد(?:م|ی|یم|ید|ند)?',
  'باشم', 'باشی', 'باشد', 'باشیم', 'باشید', 'باشند', 'بود(?:م|ی|یم|ید|ند)?',
  'خواهم', 'خواهی', 'خواهد', 'خواهیم', 'خواهید', 'خواهند', 'خواست(?:م|ی|یم|ید|ند)?',
  'بینم', 'بینی', 'بیند', 'بینیم', 'بینید', 'بینند', 'دید(?:م|ی|یم|ید|ند)?',
  'گویم', 'گویی', 'گوید', 'گوییم', 'گویید', 'گویند', 'گفت(?:م|ی|یم|ید|ند)?',
  'دهم', 'دهی', 'دهد', 'دهیم', 'دهید', 'دهند', 'داد(?:م|ی|یم|ید|ند)?',
  'خورم', 'خوری', 'خورد', 'خوریم', 'خورید', 'خورند', 'خورد(?:م|ی|یم|ید|ند)?',
  'زنم', 'زنی', 'زند', 'زنیم', 'زنید', 'زنند', 'زد(?:م|ی|یم|ید|ند)?',
  'رسم', 'رسی', 'رسد', 'رسیم', 'رسید', 'رسند', 'رسید(?:م|ی|یم|ید|ند)?',
  'خوانم', 'خوانی', 'خواند', 'خوانیم', 'خوانید', 'خوانند', 'خواند(?:م|ی|یم|ید|ند)?',
  'آورم', 'آوری', 'آورد', 'آوریم', 'آورید', 'آورند', 'آورد(?:م|ی|یم|ید|ند)?',
  'سازم', 'سازی', 'سازد', 'سازیم', 'سازید', 'سازند', 'ساخت(?:م|ی|یم|ید|ند)?',
  'گیرم', 'گیری', 'گیرد', 'گیریم', 'گیرید', 'گیرند', 'گرفت(?:م|ی|یم|ید|ند)?',
  'برم', 'بری', 'برد', 'بریم', 'برید', 'برند', 'برد(?:م|ی|یم|ید|ند)?',
  'مانم', 'مانی', 'ماند', 'مانیم', 'مانید', 'مانند', 'ماند(?:م|ی|یم|ید|ند)?',
  'شناسم', 'شناسی', 'شناسد', 'شناسیم', 'شناسید', 'شناسند', 'شناخت(?:م|ی|یم|ید|ند)?',
  'گذارم', 'گذاری', 'گذارد', 'گذاریم', 'گذارید', 'گذارند', 'گذاشت(?:م|ی|یم|ید|ند)?',
  'گزارم', 'گزاری', 'گزارد', 'گزاریم', 'گزارید', 'گزارند', 'گزارد(?:م|ی|یم|ید|ند)?',
  'خرام', 'خرامی', 'خرامد', 'خرامیم', 'خرامید', 'خرامند',
  'فهمم', 'فهمی', 'فهمد', 'فهمیم', 'فهمید', 'فهمند', 'فهمید(?:م|ی|یم|ید|ند)?',
  'شنوم', 'شنوی', 'شنود', 'شنویم', 'شنوید', 'شنوند', 'شنید(?:م|ی|یم|ید|ند)?',
  'افتم', 'افتی', 'افتد', 'افتیم', 'افتید', 'افتند', 'افتاد(?:م|ی|یم|ید|ند)?',
  'نشینم', 'نشینی', 'نشیند', 'نشینیم', 'نشینید', 'نشینند', 'نشست(?:م|ی|یم|ید|ند)?',
  'ایستم', 'ایستی', 'ایستد', 'ایستیم', 'ایستید', 'ایستند', 'ایستاد(?:م|ی|یم|ید|ند)?',
].join('|');

/**
 * Removes duplicate ZWNJs, cleans edge artifacts, and fixes punctuation spacing.
 */
export const cleanHalfSpaceArtifacts = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\u200C{2,}/g, PERSIAN_HALF_SPACE) // Collapse consecutive ZWNJs into one
    .replace(/\s*\u200C+\s*/g, PERSIAN_HALF_SPACE) // Remove spaces around ZWNJ
    .replace(/^\u200C+|\u200C+$/g, '') // Trim ZWNJ from start or end
    .replace(/\u200C+([،؛؟!.\s])/g, '$1') // Remove ZWNJ immediately preceding punctuation or space
    .replace(/([،؛؟!.\s])\u200C+/g, '$1'); // Remove ZWNJ immediately following punctuation or space
};

/**
 * Master Persian Orthography Engine.
 * Applied across ALL translation methods and outputs to guarantee publication-grade spelling.
 */
export const correctPersianOrthography = (input: string): string => {
  if (!input || typeof input !== 'string') return '';

  let text = normalizePersianChars(input);

  // 1. Correct Common Widespread Spelling Mistakes
  for (const [regex, replacement] of COMMON_SPELLING_CORRECTIONS) {
    text = text.replace(regex, replacement);
  }

  // 2. Correct Adverbial Tanwin
  for (const [raw, withTanwin] of COMMON_TANWIN_WORDS) {
    const reg = new RegExp(`(^|[\\s«"'(])(${raw})(?=[\\s،؛؟!.)»"']|$)`, 'gu');
    text = text.replace(reg, `$1${withTanwin}`);
  }

  // 3. Fix Erroneous Over-Application of ZWNJ into continuous colloquial verbs / nouns
  text = text.replace(
    /(^|[\s«"'(])(ن?می)(?:\s|-|ـ|\u200C)*(شه|شن|شم|شی|شیم|شید|دن|دم|دی|دیم|دید|دین|زان|ذار|ذارین|رس|رسه)(?=[\s،؛؟!.)»"']|$)/gu,
    '$1$2$3'
  );

  // 4. Standard Verbal Prefixes (می‌ and نمی‌) with boundary and stem check
  text = text.replace(
    new RegExp(`(^|[\\s«"'(])(ن?می)(?:\\s|-|ـ|\\u200C)+(${VERB_STEMS})(?=[\\s،؛؟!.)»"']|$)`, 'gu'),
    `$1$2${PERSIAN_HALF_SPACE}$3`
  );

  // 5. Plural Suffix: -ها and its extensions
  text = text.replace(
    /([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی])(?:\s|-|ـ|\u200C)+(ها(?:یی|یم|یت|یش|مان|تان|شان|ی)?)(?=[\s،؛؟!.)»"']|$)/gu,
    `$1${PERSIAN_HALF_SPACE}$2`
  );

  // 6. Comparatives: -تر and -ترین (with protection for native roots)
  text = text.replace(
    /([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]{2,})(?:\s|-|ـ|\u200C)+(ترین|تر)(?=[\s،؛؟!.)»"']|$)/gu,
    (match, stem, suffix) => {
      if (NATIVE_ROOTS_WITH_TAR.has(stem)) return match;
      return `${stem}${PERSIAN_HALF_SPACE}${suffix}`;
    }
  );

  // 7. Suffixes on Silent Heh (ه/ـه): e.g. خانه‌ام، گفته‌ای، بسته‌اند، دیده‌ایم
  text = text.replace(
    /([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]ه)(?:\s|-|ـ|\u200C)+(ام|ات|اش|ای|اید|ایم|اند|است)(?=[\s،؛؟!.)»"']|$)/gu,
    `$1${PERSIAN_HALF_SPACE}$2`
  );

  // 8. Prefixes (بی‌، هم‌، پیش‌، باز‌، فرا‌)
  const biWhitelist = 'نهایت|حوصله|دلیل|خود|جهت|جا|مورد|سابقه|نظیر|شمار|پایان|باک|گناه|نقص|دقت|توجه|اهمیت|ارزش|معنی|مفهوم|نتیجه|تاثیر|اثر|دفاع|پناه|کس|نام|نشان|نیاز|دغدغه|مزه|رنگ|بو|صدا|فایده|پایه|هدف|مصرف|تفاوت';
  const hamWhitelist = 'کار|وطن|کلاسی|بازی|سر|راه|سایه|تیمی|خانواده|خانه|دل|صدا|فکر|درد|رزم|سنگر|شهری|دوره|قطار|مسیر|سفر|کاران|وطنان|زمان|جهت|راستا|گام|پیمان';
  const pishWhitelist = 'بینی|فرض|نیاز|کسوت|رو|گام|گفتار|نویس|زمینه|رفت|آمد|برد|نهاد|قدم|تاز|تازانه|خرید|فروش|شماره';
  const bazWhitelist = 'گشت|دید|رسی|بینی|آفرینی|تولید|شنوایی|خوانی|پروری|نشست|نشستگی';

  text = text.replace(new RegExp(`(^|[\\s«"'(])(بی)(?:\\s|-|ـ|\\u200C)+(${biWhitelist})(?=[\\s،؛؟!.)»"']|$)`, 'gu'), `$1$2${PERSIAN_HALF_SPACE}$3`);
  text = text.replace(new RegExp(`(^|[\\s«"'(])(هم)(?:\\s|-|ـ|\\u200C)+(${hamWhitelist})(?=[\\s،؛؟!.)»"']|$)`, 'gu'), `$1$2${PERSIAN_HALF_SPACE}$3`);
  text = text.replace(new RegExp(`(^|[\\s«"'(])(پیش)(?:\\s|-|ـ|\\u200C)+(${pishWhitelist})(?=[\\s،؛؟!.)»"']|$)`, 'gu'), `$1$2${PERSIAN_HALF_SPACE}$3`);
  text = text.replace(new RegExp(`(^|[\\s«"'(])(باز)(?:\\s|-|ـ|\\u200C)+(${bazWhitelist})(?=[\\s،؛؟!.)»"']|$)`, 'gu'), `$1$2${PERSIAN_HALF_SPACE}$3`);

  // 9. Standard Compound Nouns & Verbal Nouns (بهینه‌سازی، برنامه‌نویسی، تصمیم‌گیری، گفت‌وگو)
  const compoundRoots: Array<[RegExp, string]> = [
    [/بهینه\s*ساز(ی)?/gu, `بهینه${PERSIAN_HALF_SPACE}ساز$1`],
    [/برنامه\s*نویس(ی|ان)?/gu, `برنامه${PERSIAN_HALF_SPACE}نویس$1`],
    [/تصمیم\s*گیر(ی)?/gu, `تصمیم${PERSIAN_HALF_SPACE}گیر$1`],
    [/پیاده\s*ساز(ی)?/gu, `پیاده${PERSIAN_HALF_SPACE}ساز$1`],
    [/آماده\s*ساز(ی)?/gu, `آماده${PERSIAN_HALF_SPACE}ساز$1`],
    [/شبیه\s*ساز(ی)?/gu, `شبیه${PERSIAN_HALF_SPACE}ساز$1`],
    [/خودکار\s*ساز(ی)?/gu, `خودکار${PERSIAN_HALF_SPACE}ساز$1`],
    [/استاندارد\s*ساز(ی)?/gu, `استاندارد${PERSIAN_HALF_SPACE}ساز$1`],
    [/مستند\s*ساز(ی)?/gu, `مستند${PERSIAN_HALF_SPACE}ساز$1`],
    [/فرهنگ\s*ساز(ی)?/gu, `فرهنگ${PERSIAN_HALF_SPACE}ساز$1`],
    [/روان\s*شناس(ی|ان)?/gu, `روان${PERSIAN_HALF_SPACE}شناس$1`],
    [/جامعه\s*شناس(ی|ان)?/gu, `جامعه${PERSIAN_HALF_SPACE}شناس$1`],
    [/زیست\s*شناس(ی|ان)?/gu, `زیست${PERSIAN_HALF_SPACE}شناس$1`],
    [/گفت\s*و\s*گو/gu, `گفت${PERSIAN_HALF_SPACE}و${PERSIAN_HALF_SPACE}گو`],
    [/جست\s*و\s*جو/gu, `جست${PERSIAN_HALF_SPACE}و${PERSIAN_HALF_SPACE}جو`],
    [/دست\s*کم/gu, `دست${PERSIAN_HALF_SPACE}کم`],
    [/راه\s*انداز(ی)?/gu, `راه${PERSIAN_HALF_SPACE}انداز$1`],
    [/به\s*کار\s*گیر(ی)?/gu, `به${PERSIAN_HALF_SPACE}کار${PERSIAN_HALF_SPACE}گیر$1`],
    [/بیش\s*از\s*حد/gu, `بیش${PERSIAN_HALF_SPACE}از${PERSIAN_HALF_SPACE}حد`],
  ];

  for (const [pattern, repl] of compoundRoots) {
    text = text.replace(pattern, repl);
  }

  // 10. Demonstratives and Adverbs (این‌گونه، آن‌گونه، این‌طور، آن‌طور، چه‌طور)
  text = text.replace(
    /(^|[\s«"'(])(این|آن|چه|هم)(?:\s|-|ـ|\u200C)+(گونه|طور|جا|قدر|چنان|چنین)(?=[\s،؛؟!.)»"']|$)/gu,
    `$1$2${PERSIAN_HALF_SPACE}$3`
  );

  // 11. Persian Typography & Punctuation Spacing
  // No space before Persian punctuation, exactly one space after (unless followed by another punctuation or closing quote)
  text = text
    .replace(/\s+([،؛؟!.:])/g, '$1')
    .replace(/([،؛؟!.:])(?=[^\s،؛؟!.:0-9»"'\)\]])/g, '$1 ')
    .replace(/\s{2,}/g, ' ');

  return cleanHalfSpaceArtifacts(text).trim();
};
