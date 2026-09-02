# roadmap.md — پیشنهادهای بهبود SubMaster Pro

## اولویت خیلی بالا

### 1. حذف ذخیره API Key از state پروژه

در حال حاضر schema پروژه فیلد `apiKeyUsed` دارد و هنگام auto-save ممکن است مقدار کلید معتبر در localStorage ذخیره شود. پیشنهاد می‌شود:

- این فیلد از `ProjectState` حذف شود یا همیشه مقدار masked مثل `...1234` داشته باشد.
- migration برای پاک‌سازی پروژه‌های ذخیره‌شده قبلی اضافه شود.
- settings مربوط به API key جدا از backup پروژه نگهداری شود.

### 2. اضافه کردن تست‌های واحد برای parser و stringify [انجام شده]

توابع parse و generate هسته نرم‌افزار هستند و باید تست شوند:

- parse/stringify برای SRT، VTT و ASS.
- تبدیل زمان‌ها با `timeToMs`، `msToTime` و `msToAssTime`.
- edge caseهای line ending، متن چندخطی، تگ ASS، cue بدون شماره و زمان‌های کوتاه.

پیشنهاد ابزار: Vitest + Testing Library.

### 3. استفاده از AbortController برای لغو فوری درخواست‌ها [انجام شده]

Pause و cancel فعلی loop را بعد از پایان request جاری متوقف می‌کند، اما request شبکه فعال را abort نمی‌کند. پیشنهاد:

- ساخت یک `AbortController` برای هر batch.
- ارسال `signal` به fetchهای LM Studio/OpenAI-compatible.
- بررسی امکان abort در SDK Gemini یا wrap کردن request در کنترل سطح بالاتر.
- نمایش وضعیت «در حال لغو درخواست جاری» به کاربر.

### 4. اصلاح محاسبه resume و lastProcessedIndex [انجام شده]

در save state، مقدار `lastProcessedIndex` با `findIndex(...)-1` محاسبه می‌شود که برای اولین ترجمه یا gapهای وسط فایل می‌تواند دقیق نباشد. پیشنهاد:

- ذخیره bitmap یا set از block idهای ترجمه‌شده.
- محاسبه resume بر اساس اولین chunk ناقص، نه فقط اولین translatedText.
- ذخیره metadata chunkها برای resume پایدار بین تغییر الگوریتم chunking.

## اولویت بالا

### 5. جایگزینی localStorage با IndexedDB

برای فایل‌های بزرگ، چند پروژه و حافظه ترجمه 10هزار آیتمی، localStorage محدود و synchronous است. پیشنهاد:

- استفاده از IndexedDB با wrapperهایی مثل Dexie.
- ذخیره پروژه‌ها، بلوک‌ها، حافظه ترجمه و history به صورت object store جداگانه.
- امکان compact و cleanup خودکار.

### 6. ایجاد job queue واقعی برای ترجمه [انجام شده]

در حال حاضر orchestration ترجمه داخل `App.tsx` است. بهتر است یک لایه service مستقل ایجاد شود:

- `TranslationJobRunner`
- وضعیت job: queued/running/paused/cancelled/failed/completed
- event emitter یا callback برای progress.
- retry policy قابل تنظیم.
- امکان اجرای موازی محدود برای فایل‌های کوچک، با رعایت rate limit.

### 7. جدا کردن منطق business از UI

`App.tsx` مسئول state، persistence، orchestration، export، undo/redo و translation loop است. پیشنهاد:

- ساخت hookهای جداگانه مثل `useProjectFiles`، `useTranslationRunner`، `useUndoRedo`، `useProjectPersistence`.
- انتقال عملیات فایل به serviceهای domain.
- کاهش اندازه `App.tsx` و افزایش testability.

### 8. validation دقیق‌تر خروجی مدل [انجام شده]

اعتبارسنجی فعلی خوب است، اما می‌تواند بهتر شود:

- تشخیص ترجمه‌های تکراری پشت‌سرهم.
- تشخیص عدم تناسب طول ترجمه با duration.
- تشخیص باقی‌ماندن زبان مبدأ بر اساس target language.
- scoring کیفیت و نمایش آن در UI.
- retry selective فقط برای idهای مشکل‌دار.

### 9. پشتیبانی رسمی از target languageهای غیر فارسی [انجام شده]

در types، چند target language تعریف شده، اما pipeline اصلی و promptها عمدتاً فارسی‌محور هستند. پیشنهاد:

- افزودن `targetLanguage` به settings اصلی.
- parameterize کردن `responseSchema.description` و system prompts.
- جدا کردن `formatPersianSubtitle` از formatter عمومی.
- ساخت formatter مخصوص زبان‌های RTL/LTR.

## اولویت متوسط

### 10. بهبود امنیت و CORS با backend سبک اختیاری

برای سرویس‌های OpenAI-compatible، فراخوانی مستقیم از مرورگر می‌تواند با CORS یا افشای key مشکل داشته باشد. پیشنهاد:

- ساخت یک proxy/serverless function رسمی.
- نگهداری API key در session backend یا encrypted storage.
- rate limit و audit logging سمت server.

### 11. اضافه کردن export/import کامل پروژه با نسخه schema

Backup JSON بهتر است versioned باشد:

- `schemaVersion`
- `appVersion`
- migration برای نسخه‌های قدیمی.
- انتخاب import mode: replace یا append.
- validation فایل backup قبل از import.

### 12. بهبود مدیریت history

برای فایل‌های بزرگ، history می‌تواند سنگین شود. پیشنهاد:

- سقف history قابل تنظیم.
- فشرده‌سازی تغییرات پشت‌سرهم روی یک block.
- نگهداری history در IndexedDB.
- undo ساختاری برای حذف/ادغام/بهینه‌سازی به جای پاک کردن history.

### 13. گزارش کیفیت قبل از export

قبل از export، یک گزارش نهایی نمایش داده شود:

- تعداد cueهای ترجمه‌نشده.
- تعداد خطاهای CPS/CPL/gap.
- طولانی‌ترین خط‌ها.
- cueهای مشکوک به ترجمه ماشینی یا انگلیسی ناخواسته.
- پیشنهاد auto-fix یا retranslate selected.

### 14. بهینه‌سازی حافظه ترجمه

حافظه فعلی exact-match است. پیشنهاد:

- normalize بهتر متن: حذف whitespace اضافی، lowercase برای زبان‌های Latin، حذف punctuation کم‌اثر.
- fuzzy matching با threshold.
- ذخیره metadata: provider، model، timestamp، topic، tone.
- امکان export/import حافظه ترجمه.

### 15. بهبود parsing فرمت ASS/SSA

Parser فعلی برای ASS ساده است و بر اساس split با comma کار می‌کند. در ASS، متن dialogue می‌تواند comma داشته باشد و format events ممکن است سفارشی باشد. پیشنهاد:

- parse کردن خط `Format:` برای پیدا کردن index ستون‌های Start/End/Text.
- حفظ style و actor/effect در metadata.
- خروجی ASS با امکان حفظ template اصلی.

## اولویت پایین‌تر ولی مفید

### 16. Web Worker برای پردازش فایل‌های بزرگ

Parse، stringify، zip و validation فایل‌های بزرگ می‌تواند UI را قفل کند. پیشنهاد:

- انتقال parse و QC به Web Worker.
- progress event برای parse و export.
- streaming ZIP در صورت امکان.

### 17. telemetry محلی و debug panel

برای عیب‌یابی، یک پنل debug اختیاری اضافه شود:

- آخرین diagnosticها.
- زمان هر batch.
- تعداد retryها.
- provider/model فعال.
- cache hit rate حافظه ترجمه.

### 18. کنترل دقیق‌تر rate limit

به جای delay ثابت بین batchها:

- token bucket یا leaky bucket per provider.
- تنظیم concurrency و delay بر اساس مدل.
- backoff با jitter.
- ذخیره وضعیت rate-limited key با زمان انقضا.

### 19. snapshot و diff ترجمه

برای بازبینی انسانی:

- نمایش diff بین ترجمه قبلی و retranslation.
- snapshot قبل از auto-fix.
- approve/reject گروهی تغییرات.

### 20. مستندسازی کاربر نهایی

README فعلی بسیار عمومی است. پیشنهاد:

- راهنمای نصب و تنظیم Gemini/LM Studio/OpenRouter.
- توضیح workflow ترجمه، pause/resume و export.
- نمونه فایل‌های ورودی/خروجی.
- توضیح محدودیت‌های امنیتی localStorage.

## پیشنهاد فازبندی اجرا

### فاز 1: پایداری و امنیت

- حذف ذخیره API key در پروژه.
- افزودن تست parser/time/stringify.
- اضافه کردن AbortController.
- اصلاح resume metadata.

### فاز 2: معماری و مقیاس‌پذیری

- جدا کردن translation runner از `App.tsx`.
- مهاجرت persistence به IndexedDB.
- job queue و retry policy مستقل.

### فاز 3: کیفیت ترجمه و QC

- validation پیشرفته‌تر.
- گزارش کیفیت قبل از export.
- target language واقعی.
- fuzzy translation memory.

### فاز 4: تجربه کاربری حرفه‌ای

- debug panel.
- snapshot/diff.
- import/export versioned.
- مستندات کامل کاربر نهایی.

## کارهای انجام‌شده — Skeleton STR (فازهای ۱ تا ۳)

پیاده‌سازی روش اختیاری **Skeleton STR** تکمیل شده است. این روش در انتهای انتخاب‌گر روش‌های ترجمه قرار دارد و روش پیش‌فرض یا `paragraph` را تغییر نمی‌دهد.

- **فاز ۱ — جداسازی اسکلت فایل:** تشخیص محتوایی SRT/VTT/SBV/LRC/ASS، استخراج صرفاً دیالوگ و نگاشت شاخص فیزیکی خط‌ها، حذف سرآیند، بلوک و شناسهٔ نمای VTT، تشخیص شمارهٔ نما در SRT فشرده و حفاظت از برچسب‌ها و طرح‌های ASS انجام شده است.
- **فاز ۲ — ترجمهٔ دیالوگ:** دسته‌های دارای `[CONTEXT]` و نشانگرهای شماره‌دار `[TRANSLATE_n]` به ارائه‌دهندهٔ انتخاب‌شده ارسال می‌شوند. برای خروجی فارسی، قرارداد اختصاصی این روش رعایت دقیق دستور خط فارسی، نیم‌فاصلهٔ U+200C و نشانه‌گذاری استاندارد را الزامی می‌کند. استخراج پاسخ از نشانگر استفاده می‌کند و محافظ‌های شماره‌گذاریِ یک‌مبنا، سرریز، ادغام و بازتاب را اعمال می‌کند؛ جایگاه خالی با متن مبدأ همان نما به‌صورت نرم پُر می‌شود.
- **فاز ۳ — بازگردانی اسکلت فایل:** خروجی فقط با `contentIndices` روی رونوشت `originalLines` نوشته می‌شود و هرگز از پاسخ مدل برای تشخیص زمان یا نما استفاده نمی‌شود. خروجی خالی، خط مبدأ را نگه می‌دارد؛ زمان‌ها، نماها، سرآیندها و پیشوندهای LRC/ASS حفظ می‌شوند. مسیر دوزبانه نیز گروه‌بندی را بر پایهٔ شاخص خطِ کد زمانی انجام می‌دهد.
- برای هر سه فاز، آزمونِ بدون شبکه افزوده شده است: زمان‌بندی SRT، SRT فشرده، بلوک و شناسهٔ نمای VTT، برچسب و طرح ASS، LRC، محافظ‌های نشانگر و بازگردانی SRT/ASS/LRC.
