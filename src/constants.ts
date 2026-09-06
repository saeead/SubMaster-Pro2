
import { ToneType, TopicType, GlossaryItem, StyleTemplate, TargetLanguage, OutputStandard, TranslationMethod, AIProvider, ModelType, GeminiFlashModelCache } from "./types";

export const APP_CONFIG = {
  version: "3.0.0", // Dynamic Batch Queue & Real-time Auto-Pipeline Update
  maxWordsPerBlock: 24, 
  minWordsPerBlock: 1, 
  maxFileSize: 100 * 1024 * 1024, 
  maxFilesPerUpload: 50,
  supportedFormats: ['srt', 'vtt', 'ass'],
  geminiModels: {
    standard: 'gemini-3.8-flash',       // آخرین مدل فلش، سریع و رایگان (پیش‌فرض نرم‌افزار)
    professional: 'gemini-3.1-pro-preview', // مدل پرمیوم و استدلال پیشرفته (ویژه کلیدهای API پولی)
    flash: 'gemini-flash-latest',       // فلش پویا (هدایت خودکار به آخرین نسخه پایدار فلش)
    flash_lite: 'gemini-3.1-flash-lite' // فلش لایت (سبک، فوق‌سریع و اقتصادی)
  },
  retryConfig: {
    maxRetries: 5, 
    baseDelay: 6000, 
    overloadWaitMs: 30000, 
  }
};

export const GEMINI_FLASH_DISCOVERY_CACHE_KEY = 'submaster_pro2_gemini_flash_models_v1';
export const GEMINI_FLASH_DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MAX_MODEL_FALLBACK_SWITCHES = 3;

export const DEFAULT_FLASH_FALLBACK_CHAIN: readonly string[] = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.6-flash'
];

export const getCachedGeminiFlashModels = (): string[] => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...DEFAULT_FLASH_FALLBACK_CHAIN];
  }
  try {
    const raw = window.localStorage.getItem(GEMINI_FLASH_DISCOVERY_CACHE_KEY);
    if (!raw) return [...DEFAULT_FLASH_FALLBACK_CHAIN];
    const parsed = JSON.parse(raw) as GeminiFlashModelCache;
    if (parsed && Array.isArray(parsed.models) && parsed.models.length > 0) {
      return parsed.models;
    }
  } catch {
    // fallback
  }
  return [...DEFAULT_FLASH_FALLBACK_CHAIN];
};

export const getGeminiFallbackChain = (initialModel: string, blacklistedModels: string[] = []): string[] => {
  const dynamicModels = getCachedGeminiFlashModels();
  const candidates = [
    initialModel,
    ...dynamicModels,
    ...DEFAULT_FLASH_FALLBACK_CHAIN,
    APP_CONFIG.geminiModels.flash_lite,
    APP_CONFIG.geminiModels.standard,
    APP_CONFIG.geminiModels.flash,
  ];

  const seen = new Set<string>();
  const chain: string[] = [];

  for (const m of candidates) {
    if (m && !seen.has(m) && !blacklistedModels.includes(m)) {
      seen.add(m);
      chain.push(m);
    }
  }

  return chain.length > 0 ? chain : [APP_CONFIG.geminiModels.standard];
};

export const DEFAULT_GEMINI_MODEL = APP_CONFIG.geminiModels.standard;

export const getResolvedGeminiModel = (modelType?: ModelType): string => {
  if (modelType === 'professional') return APP_CONFIG.geminiModels.professional;

  const dynamicModels = getCachedGeminiFlashModels();

  if (modelType === 'flash_lite') {
    const liteModel = dynamicModels.find(m => m.includes('flash-lite') || m.includes('flashlite'));
    if (liteModel) return liteModel;
    return APP_CONFIG.geminiModels.flash_lite;
  }

  if (modelType === 'flash') {
    const flashModel = dynamicModels.find(m => m === 'gemini-flash-latest' || (m.includes('flash') && !m.includes('lite')));
    if (flashModel) return flashModel;
    return APP_CONFIG.geminiModels.flash;
  }

  // standard / default
  if (dynamicModels.length > 0) {
    if (dynamicModels.includes(APP_CONFIG.geminiModels.standard)) {
      return APP_CONFIG.geminiModels.standard;
    }
    return dynamicModels[0];
  }

  return APP_CONFIG.geminiModels.standard;
};

export const OPTIMIZATION_CONFIG = {
  NORMAL: {
    MAX_MERGE_CHARACTERS: 120, 
    MIN_WORDS_PER_BLOCK: 12,   
    MAX_WORDS_PER_BLOCK: 24,   
    MAX_MERGE_GAP_MS: 1200,    
    STANDARD_GAP_MS: 50,       
    MS_PER_WORD: 350,          
  },
  NETFLIX: {
    MAX_MERGE_CHARACTERS: 84, // 42 * 2 lines 
    MIN_WORDS_PER_BLOCK: 5,    
    MAX_WORDS_PER_BLOCK: 18,   
    MAX_MERGE_GAP_MS: 1000,
    STANDARD_GAP_MS: 84, // 2 frames at 24fps
    MS_PER_WORD: 300,          
  },
  BBC: {
    MAX_MERGE_CHARACTERS: 74, // 37 * 2 lines
    MIN_WORDS_PER_BLOCK: 4,
    MAX_WORDS_PER_BLOCK: 15,
    MAX_MERGE_GAP_MS: 800,
    STANDARD_GAP_MS: 120, // 3 frames approx
    MS_PER_WORD: 320,
  },
  BROADCAST: {
    MAX_MERGE_CHARACTERS: 78, // 39 * 2 lines
    MIN_WORDS_PER_BLOCK: 6,
    MAX_WORDS_PER_BLOCK: 20,
    MAX_MERGE_GAP_MS: 1200,
    STANDARD_GAP_MS: 80,
    MS_PER_WORD: 330,
  }
};

export const BATCH_SIZE = 20; 
export const SKELETON_STR_BATCH_SIZE = 36;
export const SKELETON_STR_CONTEXT_WINDOW = 40;
export const OVERLAP_SIZE = 1;
export const GEMINI_CONTEXT_PRE_WINDOW = 3;
export const GEMINI_CONTEXT_POST_WINDOW = 2;
export const DELAY_BETWEEN_BATCHES_MS = 4200; 
export const DELAY_BETWEEN_FILES_MS = 10000; 

/** Select conservative throughput settings without penalising local providers. */
export const getAdaptiveTranslationBatchSize = (
  provider: AIProvider, 
  model: ModelType, 
  method: TranslationMethod,
  averageCharsPerCue?: number
): number => {
  // Tagged subtitle translators are more reliable with short batches: every
  // target needs a distinct closing tag, and a single omission blocks recovery.
  if (method === 'subtitle_translator') {
    if (provider === 'lm_studio') {
      const base = 10;
      if (averageCharsPerCue && averageCharsPerCue > 120) {
        return Math.max(6, base - 3);
      }
      return base;
    }
    if (provider === 'gtx' || provider === 'edge' || provider === 'deeplx') return 6;
    return 8;
  }
  if (method === 'skeleton_str') {
    if (provider === 'lm_studio') {
      const base = 24;
      if (averageCharsPerCue && averageCharsPerCue > 120) {
        return Math.max(16, base - 6);
      }
      return base;
    }
    if (provider === 'gtx' || provider === 'edge' || provider === 'deeplx') return 10;
    return 20;
  }

  // Gemini-specific adaptive batch sizing:
  // Slightly larger for flash/flash_lite (token & throughput efficiency)
  // and more conservative for professional (nuance, quality, and reasoning).
  if (provider === 'gemini') {
    if (method === 'paragraph') {
      if (model === 'professional') return 10;
      if (model === 'flash' || model === 'flash_lite') return 24;
      return 18;
    }
    // Default method for Gemini
    if (model === 'professional') return 14;
    if (model === 'flash' || model === 'flash_lite') return 36;
    return 24;
  }

  // LM Studio adaptive batch sizing optimized for local Gemma 4 (26B A4B) models:
  // Reduced from 36 to the 18-24 range (20 for paragraph, 22 for default) to maintain
  // context coherence, prevent hallucination/repetition, and avoid cue truncation
  // while preserving high throughput. Auto-scales down if cues are unusually long (>120 chars).
  if (provider === 'lm_studio') {
    let base = 22;
    if (method === 'paragraph') {
      base = 20;
    }
    if (averageCharsPerCue && averageCharsPerCue > 120) {
      return Math.max(14, base - 6);
    }
    return base;
  }

  // Non-Gemini providers: preserve exact previous logic
  if (method === 'paragraph') return model === 'professional' ? 12 : 16;
  if (provider === 'gtx' || provider === 'edge' || provider === 'deeplx') return 12;
  if (model === 'professional') return 14;
  if (model === 'flash' || model === 'flash_lite') return 36;
  return BATCH_SIZE;
};

/** Local requests need no throttle; hosted providers retain a small safety gap. */
export const getAdaptiveBatchDelay = (provider: AIProvider, model: ModelType): number => {
  if (provider === 'lm_studio') return 0;
  if (provider === 'gtx' || provider === 'edge' || provider === 'deeplx') return 350;
  if (provider === 'openai_compatible') return 250;
  if (model === 'flash' || model === 'flash_lite') return 800;
  return 1200;
};

export const TONE_OPTIONS: Record<ToneType, string> = {
  conversational: 'محاوره‌ای مدرن (Tehrani Spoken)',
  formal: 'رسمی (Formal)',
  news: 'خبری (Journalistic)',
  movie: 'فیلم و سریال (Cinematic)',
  podcast: 'پادکست (Conversational)',
};

export const TOPIC_OPTIONS: Record<TopicType, string> = {
  educational: 'آموزشی (علمی/تکنولوژی)',
  entertainment: 'سرگرمی (فیلم و سریال)',
  podcast: 'پادکست',
  news: 'اخبار و سیاسی',
  sports: 'ورزشی',
};

export const TARGET_LANGUAGES: Record<TargetLanguage, string> = {
  fa: 'فارسی (Persian)',
  en: 'انگلیسی (English)',
  ru: 'روسی (Russian)',
  zh: 'چینی (Chinese)',
  de: 'آلمانی (German)',
  es: 'اسپانیایی (Spanish)',
};

export const TOPIC_TEMPERATURE_DEFAULTS: Record<TopicType, { value: number; description: string }> = {
  educational: { value: 0.35, description: "دقت بالا + بومی‌سازی اصطلاحات فنی" },
  entertainment: { value: 0.75, description: "خلاقیت بالا در معادل‌سازی فرهنگی" },
  podcast: { value: 0.65, description: "روانی کلام و حفظ ریتم گفتگو" },
  news: { value: 0.2, description: "دقت بسیار بالا و لحن رسمی" },
  sports: { value: 0.55, description: "حفظ هیجان و واژگان تخصصی ورزشی" }
};

/**
 * Calculates dynamic temperature for Gemini requests based on topic defaults, selected tone,
 * model tier, and retry attempts due to validation/parsing errors.
 * 
 * - Topic & Tone: Maintains dynamic semantic flavor (e.g. conversational/movie get idiomatic fluidity, news/formal stay disciplined).
 * - Model Tier: Flash & Flash-Lite receive a slight boost (+0.05) to promote natural translationese-free flow
 *   while constrained by Structured Output (responseSchema). Professional receives a slight reduction (-0.05)
 *   to maximize analytical precision and contextual consistency.
 * - Validation Retries: Progressively lowers temperature (-0.10 per validation retry) to enforce deterministic,
 *   strict compliance with IDs and schema when recovery is needed.
 */
export const getGeminiTemperature = (
  baseTemp: number | undefined,
  topic: TopicType,
  tone: ToneType,
  model: ModelType,
  validationRetryCount: number = 0
): number => {
  const defaultTopicTemp = TOPIC_TEMPERATURE_DEFAULTS[topic]?.value ?? 0.35;
  let temp = typeof baseTemp === 'number' && !isNaN(baseTemp) ? baseTemp : defaultTopicTemp;

  // Dynamic adjustments by tone: spoken/dramatic require natural flow; formal/news require structural rigor
  switch (tone) {
    case 'conversational':
    case 'movie':
      temp += 0.05;
      break;
    case 'formal':
    case 'news':
      temp -= 0.05;
      break;
    case 'podcast':
      temp += 0.03;
      break;
    default:
      break;
  }

  // Model-tier dynamic balance:
  // flash & flash_lite are constrained by responseSchema so they benefit from slightly higher creativity (+0.05)
  // professional has deep reasoning capabilities and benefits from lower temperature (-0.05) for laser accuracy.
  if (model === 'flash' || model === 'flash_lite') {
    temp += 0.05;
  } else if (model === 'professional') {
    temp -= 0.05;
  }

  // Validation retry cool-down: reduce temperature to force deterministic structured adherence
  if (validationRetryCount > 0) {
    temp -= 0.10 * validationRetryCount;
  }

  // Clamp within safe creative-yet-structured bounds [0.10, 1.00]
  return Math.round(Math.max(0.1, Math.min(1.0, temp)) * 100) / 100;
};

const SYSTEM_PROMPTS = {
  base: `شما یک مترجم ارشد و متخصص بومی‌سازی زیرنویس هستید. وظیفه شما انتقال طبیعی، دقیق و وفادارانه روح کلام است، نه ترجمه کلمه‌به‌کلمه.

--- اصول بنیادین ترجمه و نگارش ---
1. بومی‌سازی اصیل: حذف کامل ساختارهای ماشینی و تحت‌اللفظی (پرهیز از «توسط» برای مفعول، استفاده از «است» به‌جای «می‌باشد»).
2. امانت‌داری معنایی: حفظ کامل جزئیات، قیدها، بار احساسی و پیوستگی؛ هرگونه حذف، خلاصه‌سازی یا تغییر مفاهیم ممنوع است.
3. نگارش معیار فارسی: رعایت دستور زبان و ترتیب طبیعی اجزای جمله، نشانه‌گذاری دقیق و کاربرد الزامی نیم‌فاصله (ZWNJ) در افعال و واژگان ترکیبی (مانند می‌رود، کتاب‌ها، به‌کارگیری).
4. پیوستگی دیالوگ‌ها: درک پیوند جملات در خطوط متوالی جهت حفظ ریتم و لحن طبیعی گفتگو.
5. خروجی پاک: خروجی باید کاملاً خالص باشد؛ اکیداً بدون هیچ مقدمه، موخره، توضیح، پانویس یا علائم مارک‌داون اضافه.`,

  netflix: `--- استانداردهای NETFLIX ---
- سقف ۴۲ کاراکتر در خط، حداکثر ۲ خط در هر بلاک با شکست خط مناسب بدون تقطیع یا حذف محتوا.
- سرعت خواندن: حداکثر ۲۰ کاراکتر بر ثانیه.`,

  bbc: `--- استانداردهای BBC ---
- سقف ۳۷ کاراکتر در خط با شکست خط خوانا بدون خلاصه یا حذف.
- سرعت خواندن: حداکثر ۱۷ کاراکتر بر ثانیه.`,

  broadcast: `--- استانداردهای BROADCAST ---
- استاندارد پخش: سقف ۳۹ کاراکتر در خط و حداکثر ۱۸ کاراکتر بر ثانیه.`,

  tones: {
    conversational: `--- لحن محاوره‌ای (Tehrani Spoken) ---
- زبان گفتاری روزمره و شکسته (تبدیل «ان» به «ون» در واژگان متداول: خونه، می‌شه، براتون).
- حذف شناسه‌های رسمی (بخورین، برین) و حفظ صمیمیت طبیعی.`,
    formal: `لحن رسمی و کتابی، مناسب برای مستندهای علمی و متون دقیق.`,
    news: `لحن خبری، قاطع و بی‌طرفانه.`,
    movie: `لحن سینمایی، بومی‌سازی اصطلاحات عامیانه و حفظ بار دراماتیک (Slang).`,
    podcast: `لحن صمیمی و روان پادکست، حفظ تکیه‌کلام‌ها و ریتم گوینده.`,
  },

  localTones: {
    conversational: `--- لحن دیالوگ: محاوره‌ای و سینمایی پرکشش (Tehrani Spoken) ---
• ترجمه باید طوری باشد که اگر کسی نسخه انگلیسی را ندیده باشد، فکر کند این دیالوگ از اول به فارسی نوشته شده است.
• تأکید بر ریتم دیالوگ، گرمی، حس و حال و معادل‌های طبیعی ایرانی.
• دوری اکید از شکسته کردن مکانیکی و اجباری واژگان؛ فقط کلمات و افعال رایج گفتار روزمره شکسته شوند (خونه، می‌شه، می‌خوای، براتون، رفتیم) تا لحن تصنعی نگردد.
• بومی‌سازی اصیل و جذاب اصطلاحات کوچه و بازاری (Slang)، متلک‌ها و تکیه‌کلام‌ها بدون ترجمه کلمه به کلمه.`,
    movie: `--- لحن دیالوگ: سینمایی، فیلم و نمایشی (Cinematic & Movie Dialogue) ---
• ترجمه باید طوری باشد که اگر کسی نسخه انگلیسی را ندیده باشد، فکر کند این دیالوگ از اول به فارسی نوشته شده است.
• تأکید ویژه بر ضرباهنگ صحنه، ریتم دیالوگ، حس و حال دراماتیک، لحن شخصیت‌ها و معادل‌های طبیعی ایرانی.
• دوری اکید از شکسته کردن مکانیکی و اجباری واژگان؛ توازن طبیعی میان روانی کلام و شخصیت‌پردازی صحنه حفظ شود.
• بومی‌سازی اصیل اصطلاحات عامیانه و کوچه بازاری (Slang)، بار عاطفی و طنز موقعیت‌ها با ظرافت کامل سینمایی.`,
    formal: `--- لحن: رسمی، فاخر و شیوا ---
• نگارش کتابی پیراسته، وزین و برازنده متون رسمی، تاریخی و مستندهای فاخر.`,
    news: `--- لحن: خبری و ژورنالیستی ---
• قاطع، شفاف، بی‌طرف و با نگارش دقیق رسانه‌ای.`,
    podcast: `--- لحن: صمیمی و روان پادکست ---
• گرم، راحت، رفیقانه و متناسب با آهنگ گفتگوی زنده پادکست.`,
  },

  topics: {
    educational: `--- موضوع آموزشی و علمی ---
- درک دقیق مفاهیم، روابط علّی و مراحل علمی با واژگان تخصصی معتبر.
- درج اصطلاح انگلیسی در پرانتز فقط در صورت ضرورت یادگیری یا ابهام‌زدایی تخصصی.
- حفظ کامل نام متغیرها، کدها، فرمول‌ها و برندها.`,
    entertainment: `بومی‌سازی فرهنگی شوخی‌ها، ضرب‌المثل‌ها و طنز.`,
    podcast: `حفظ دقیق اسامی افراد، عناوین و پیوستگی کلام.`,
    news: `دقت در ترجمه القاب رسمی، اصطلاحات سیاسی و نام‌های جغرافیایی.`,
    sports: `کاربرد اصطلاحات و واژگان رایج گزارشگری ورزشی.`,
  }
};

/**
 * Core invariant system instruction:
 * Invariant role, fundamental quality rules, orthography, and wire contract.
 * Designed to be cached once via Gemini Context Caching.
 */
export const getCoreSystemInstruction = (
  targetLanguage: TargetLanguage = 'fa',
  method: TranslationMethod = 'default'
): string => {
  const langName = TARGET_LANGUAGES[targetLanguage] || 'Persian';
  let core = SYSTEM_PROMPTS.base;
  if (targetLanguage !== 'fa') {
    core = `You are a senior subtitle localization specialist. Translate dialogue naturally, accurately, and idiomatically into ${langName}. Preserve all nuances, qualifiers, and meaning without summarization or omission. Return strictly the requested output format without explanations or markdown wrappers.`;
  }

  // Transport and method contract
  if (method !== 'skeleton_str' && method !== 'subtitle_translator') {
    core += `\n\n--- فرمت خروجی (JSON Array) ---
پاسخ فقط یک آرایه JSON معتبر باشد:
[
  { "id": 1, "translatedText": "..." }
]`;
  }

  core += `\n\n${getMethodTranslationInstruction(method, targetLanguage)}`;
  return core;
};

/**
 * Dynamic system instruction:
 * Contains request-specific specifications: Tone, Topic, OutputStandard, Glossary, Protected Terms, and Custom Prompt.
 */
export const getDynamicSystemInstruction = (
  tone: ToneType, 
  topic: TopicType, 
  customPrompt: string, 
  outputStandard: OutputStandard,
  glossary: GlossaryItem[] = [],
  doNotTranslateTerms: string = '',
  targetLanguage: TargetLanguage = 'fa'
): string => {
  const sections: string[] = [];

  if (outputStandard === 'netflix') sections.push(SYSTEM_PROMPTS.netflix);
  else if (outputStandard === 'bbc') sections.push(SYSTEM_PROMPTS.bbc);
  else if (outputStandard === 'broadcast') sections.push(SYSTEM_PROMPTS.broadcast);

  if (targetLanguage === 'fa' && SYSTEM_PROMPTS.tones[tone]) {
    sections.push(SYSTEM_PROMPTS.tones[tone]);
  } else if (SYSTEM_PROMPTS.tones[tone]) {
    sections.push(`Tone: ${tone}. Keep the translation natural and subtitle-friendly for ${TARGET_LANGUAGES[targetLanguage]}.`);
  }

  if (SYSTEM_PROMPTS.topics[topic]) {
    sections.push(SYSTEM_PROMPTS.topics[topic]);
  }

  if (glossary && glossary.length > 0) {
    const validGlossary = glossary.filter(item => item && item.term && item.translation);
    if (validGlossary.length > 0) {
      sections.push(`--- واژه‌نامه اختصاصی و الزام‌آور (STRICT GLOSSARY ENFORCEMENT) ---
رعایت معادل‌های واژه‌نامه برای واژگان مشخص‌شده اجباری و دارای اولویت مطلق نسبت به هر معادل عام است:
${validGlossary.map(item => `  • "${item.term}" ➔ "${item.translation}"`).join('\n')}
قانون تخطی‌ناپذیر واژه‌نامه: در هر خطی که هر یک از عبارات ستون مبدأ ظاهر شود، حتماً و بدون استثنا باید از معادل متناظر آن در ستون مقصد استفاده شود.`);
    }
  }

  const protectedTerms = doNotTranslateTerms
    .split(',')
    .map(term => term.trim())
    .filter(Boolean);

  if (protectedTerms.length > 0) {
    sections.push(`--- کلمات محافظت‌شده و غیرقابل ترجمه (DO-NOT-TRANSLATE SHIELD) ---
کلمات زیر اسامی خاص، علائم تجاری یا اصطلاحات محافظت‌شده هستند و تغییرناپذیرند:
${protectedTerms.map(t => `"${t}"`).join(', ')}
قوانین اکید محافظت:
۱. این واژه‌ها را هرگز ترجمه نکنید، فینگلیش یا آوانویسی نکنید و املای انگلیسی آنها را عیناً حفظ کنید.
۲. از تغییر حروف کوچک و بزرگ (Case-sensitivity) و نشانه‌گذاری واژگان محافظت‌شده خودداری کنید.
۳. در ساختار جمله مقصد، این کلمات را بدون الصاق حروف فارسی (با رعایت فاصله استاندارد) قرار دهید.`);
  }

  if (customPrompt && customPrompt.trim()) {
    sections.push(`--- دستورالعمل سفارشی ---\n${customPrompt.trim()}`);
  }

  return sections.join('\n\n');
};

export const getLocalSystemInstruction = (
  tone: ToneType, 
  topic: TopicType, 
  customPrompt: string, 
  outputStandard: OutputStandard,
  glossary: GlossaryItem[] = [],
  doNotTranslateTerms: string = '',
  targetLanguage: TargetLanguage = 'fa',
  method: TranslationMethod = 'default'
): string => {
  const isPersian = targetLanguage === 'fa';
  const langName = TARGET_LANGUAGES[targetLanguage] || 'Persian';

  // 1. Role: Senior Subtitle Localization Specialist
  const role = isPersian
    ? `شما یک مترجم ارشد و متخصص بومی‌سازی زیرنویس هستید (فیلم، سریال، محتوای آموزشی و مستند). ترجمه شما باید چنان طبیعی، زنده، جذاب و با ریتم روان فارسی باشد که گویی دیالوگ از ابتدا به زبان فارسی نوشته شده است.`
    : `You are a senior subtitle localization specialist. Translate dialogue naturally, accurately, and idiomatically into ${langName}. The subtitles must sound authentically native, punchy, and engaging.`;

  // 2. 3-4 Golden Quality Rules
  const goldenRules = isPersian
    ? `--- اصول طلایی کیفیت زیرنویس ---
۱. اصالت، جذابیت و لحن طبیعی: پرهیز مطلق از ترجمه مکانیکی و تحت‌اللفظی؛ عبارات باید خوش‌آهنگ، گیرا و منطبق با بافت صحنه باشند (حذف کامل الگوهای ترجمه‌زده نظیر «توسط»، «می‌باشد»، «صورت گرفت»).
۲. امانت‌داری کامل معنا و ممنوعیت خلاصه‌سازی: انتقال کامل و مو‌به‌مو تمام جزئیات، اسامی، اعداد، شوخی‌ها، کنایه‌ها و قیدها؛ هرگونه سانسور، حذف یا خلاصه‌سازی حتی یک واژه اکیداً ممنوع است.
۳. دقت مفهومی، علمی و آموزشی: در محتوای آموزشی و فنی، مفاهیم با بالاترین دقت علمی و با معادل‌های استاندارد بومی‌سازی شوند و روابط علّی و منطقی بدون کوچک‌ترین خطا حفظ گردند.
۴. مهندسی متن زیرنویس: ساختار متوازن و خوانا در چارچوب استانداردهای پخش بدون آسیب به بار عاطفی و معنایی جمله.`
    : `--- 4 GOLDEN SUBTITLE QUALITY RULES ---
1. Idiomatic & Native Flow: Never translate word-for-word or use clumsy translationese. Dialogue must flow with natural, engaging spoken rhythm.
2. Complete Semantic Fidelity: Preserve every detail, name, number, joke, idiom, and emotional nuance without summarization, omission, or truncation.
3. Conceptual & Educational Precision: For technical, scientific, and educational topics, maintain rigorous accuracy and authoritative terminology.
4. Clean Subtitle Engineering: Keep phrasing concise, balanced, and instantly readable within standard viewer constraints.`;

  // 3. Persian Orthography Rules
  const persianRules = isPersian
    ? `--- الزامات نگارش و ویرایش فارسی ---
• نیم‌فاصله الزامی (ZWNJ): در افعال (می‌روم، نمی‌دانم، گفته‌شده)، نشانه‌های جمع (کتاب‌ها)، واژگان ترکیبی (بهینه‌سازی، برنامه‌نویسی) و پیشوندها/پسوندهای پیوسته.
• حروف و دستور معیار: استفاده از «ی» و «ک» استاندارد فارسی؛ رعایت ترتیب طبیعی ارکان جمله فارسی (نهاد، مفعول، قید، فعل).`
    : '';

  // 4. Tone specifications
  let toneInstruction = '';
  if (isPersian) {
    if (tone === 'conversational') {
      toneInstruction = SYSTEM_PROMPTS.localTones?.conversational || `--- لحن دیالوگ: محاوره‌ای و سینمایی پرکشش (Tehrani Spoken) ---
• ترجمه باید طوری باشد که اگر کسی نسخه انگلیسی را ندیده باشد، فکر کند این دیالوگ از اول به فارسی نوشته شده است.
• تأکید بر ریتم دیالوگ، گرمی، حس و حال و معادل‌های طبیعی ایرانی.
• دوری اکید از شکسته کردن مکانیکی و اجباری واژگان؛ فقط کلمات و افعال رایج گفتار روزمره شکسته شوند (خونه، می‌شه، می‌خوای، براتون، رفتیم) تا لحن تصنعی نگردد.
• بومی‌سازی اصیل و جذاب اصطلاحات کوچه و بازاری (Slang)، متلک‌ها و تکیه‌کلام‌ها بدون ترجمه کلمه به کلمه.`;
    } else if (tone === 'movie') {
      toneInstruction = SYSTEM_PROMPTS.localTones?.movie || `--- لحن دیالوگ: سینمایی، فیلم و نمایشی (Cinematic & Movie Dialogue) ---
• ترجمه باید طوری باشد که اگر کسی نسخه انگلیسی را ندیده باشد، فکر کند این دیالوگ از اول به فارسی نوشته شده است.
• تأکید ویژه بر ضرباهنگ صحنه، ریتم دیالوگ، حس و حال دراماتیک، لحن شخصیت‌ها و معادل‌های طبیعی ایرانی.
• دوری اکید از شکسته کردن مکانیکی و اجباری واژگان؛ توازن طبیعی میان روانی کلام و شخصیت‌پردازی صحنه حفظ شود.
• بومی‌سازی اصیل اصطلاحات عامیانه و کوچه بازاری (Slang)، بار عاطفی و طنز موقعیت‌ها با ظرافت کامل سینمایی.`;
    } else if (tone === 'formal') {
      toneInstruction = SYSTEM_PROMPTS.localTones?.formal || `--- لحن: رسمی، فاخر و شیوا ---
• نگارش کتابی پیراسته، وزین و برازنده متون رسمی، تاریخی و مستندهای فاخر.`;
    } else if (tone === 'news') {
      toneInstruction = SYSTEM_PROMPTS.localTones?.news || `--- لحن: خبری و ژورنالیستی ---
• قاطع، شفاف، بی‌طرف و با نگارش دقیق رسانه‌ای.`;
    } else if (tone === 'podcast') {
      toneInstruction = SYSTEM_PROMPTS.localTones?.podcast || `--- لحن: صمیمی و روان پادکست ---
• گرم، راحت، رفیقانه و متناسب با آهنگ گفتگوی زنده پادکست.`;
    }
  } else {
    toneInstruction = `Tone: ${tone}. Keep the register natural, authentic, and subtitle-friendly for ${langName}.`;
  }

  // Topic specifications
  let topicInstruction = '';
  if (topic === 'educational') {
    topicInstruction = isPersian
      ? `--- راهنمای موضوع: آموزشی، علمی و تخصصی ---
• درک عمیق و انتقال دقیق مفاهیم، فرآیندها و روابط علمی با واژگان معتبر و تخصصی. نام متغیرها، کدهای برنامه‌نویسی و فرمول‌ها تغییرناپذیرند.`
      : `Topic: Educational & Scientific. Ensure authoritative technical precision; never alter code, variables, or formulas.`;
  } else if (topic === 'entertainment') {
    topicInstruction = isPersian
      ? `--- راهنمای موضوع: سرگرمی و سینمایی ---
• بومی‌سازی طنزها، متلک‌ها و اصطلاحات نمایشی با حفظ ضرباهنگ دراماتیک صحنه.`
      : `Topic: Entertainment. Retain comedic timing, punchlines, and dramatic flair.`;
  } else if (topic === 'sports') {
    topicInstruction = isPersian
      ? `--- راهنمای موضوع: ورزشی ---
• لحن گزارشگری پرانرژی با کاربرد عبارات رایج در پخش مسابقات ورزشی.`
      : `Topic: Sports. Energetic sportscasting register with accurate sports terms.`;
  }

  // Output Standard limits
  let standardInstruction = '';
  if (outputStandard === 'netflix') {
    standardInstruction = isPersian
      ? `--- استاندارد NETFLIX ---
• سقف ۴۲ کاراکتر در خط، حداکثر ۲ خط در هر بلاک، سرعت خواندن زیر ۲۰ کاراکتر بر ثانیه.`
      : `Standard: Netflix (max 42 chars/line, 2 lines max, <20 CPS).`;
  } else if (outputStandard === 'bbc') {
    standardInstruction = isPersian
      ? `--- استاندارد BBC ---
• سقف ۳۷ کاراکتر در خط، حداکثر ۲ خط در هر بلاک، سرعت خواندن زیر ۱۷ کاراکتر بر ثانیه.`
      : `Standard: BBC (max 37 chars/line, 2 lines max, <17 CPS).`;
  } else if (outputStandard === 'broadcast') {
    standardInstruction = isPersian
      ? `--- استاندارد BROADCAST ---
• سقف ۳۹ کاراکتر در خط، حداکثر ۲ خط در هر بلاک، سرعت خواندن زیر ۱۸ کاراکتر بر ثانیه.`
      : `Standard: Broadcast (max 39 chars/line, 2 lines max, <18 CPS).`;
  }

  // Glossary
  let glossaryInstruction = '';
  if (glossary && glossary.length > 0) {
    const valid = glossary.filter(g => g && g.term && g.translation);
    if (valid.length > 0) {
      glossaryInstruction = `--- واژه‌نامه الزامی (STRICT GLOSSARY) ---
استفاده از این معادل‌ها برای واژگان ذکرشده دارای اولویت مطلق و اجباری است:
${valid.map(g => `• "${g.term}" ➔ "${g.translation}"`).join('\n')}`;
    }
  }

  // Protected terms
  let protectedInstruction = '';
  if (doNotTranslateTerms) {
    const terms = doNotTranslateTerms.split(',').map(t => t.trim()).filter(Boolean);
    if (terms.length > 0) {
      protectedInstruction = `--- واژگان محافظت‌شده (غیرقابل ترجمه) ---
واژگان زیر اسامی خاص، علائم تجاری یا اصطلاحات اختصاصی هستند و باید عیناً با حروف لاتین حفظ شوند:
${terms.map(t => `"${t}"`).join(', ')}`;
    }
  }

  // Custom prompt
  let customInstruction = '';
  if (customPrompt && customPrompt.trim()) {
    customInstruction = `--- دستورالعمل سفارشی کاربر ---\n${customPrompt.trim()}`;
  }

  // Contract & Output Format:
  let contractAndExamples = '';
  if (method === 'skeleton_str' || method === 'subtitle_translator') {
    contractAndExamples = isPersian
      ? `--- قرارداد خروجی تگ‌ها ---
دقیقاً تگ‌های شماره‌دار [TRANSLATE_X]...[/TRANSLATE_X] درخواستی را بازگردانید. از تولید JSON، توضیحات یا مارک‌داون خودداری کنید.`
      : `--- TAG OUTPUT CONTRACT ---
Return ONLY the requested [TRANSLATE_X]...[/TRANSLATE_X] tags. Do NOT return JSON, explanations, or markdown.`;
  } else {
    // Default or paragraph methods: Strict JSON array with few-shot examples
    contractAndExamples = isPersian
      ? `--- فرمت خروجی الزامی (JSON Array) ---
پاسخ شما باید فقط و فقط یک آرایه JSON معتبر باشد؛ اکیداً بدون هیچ مقدمه، موخره، یادداشت یا بلوک مارک‌داون (\`\`\`json):
[
  { "id": 1, "translatedText": "متن ترجمه‌شده" }
]

--- مثال‌های آموزشی (Few-Shot Examples) ---
• مثال ۱ (دیالوگ محاوره‌ای و جذاب فیلم/سریال):
ورودی: [{"id": 1, "text": "Are you out of your mind? We cannot pull this off now!"}]
خروجی: [{"id": 1, "translatedText": "مگه عقلت رو از دست دادی؟ الان دیگه از پسش برنمی‌آیم!"}]

• مثال ۲ (آموزشی، علمی و اصطلاحات تخصصی):
ورودی: [{"id": 2, "text": "The neural network optimizes gradient descent by iteratively updating weights."}]
خروجی: [{"id": 2, "translatedText": "شبکه عصبی از طریق به‌روزرسانی مکرر وزن‌ها، گرادیان نزولی را بهینه‌سازی می‌کند."}]`
      : `--- OUTPUT FORMAT (JSON Array) ---
Output ONLY a valid JSON array, with no explanations, notes, or markdown wrappers:
[
  { "id": 1, "translatedText": "..." }
]

Example:
Input: [{"id": 1, "text": "Are you out of your mind? We cannot pull this off now!"}]
Output: [{"id": 1, "translatedText": "Are you insane? We can't manage this now!"}]`;
  }

  const parts = [
    role,
    goldenRules,
    persianRules,
    toneInstruction,
    topicInstruction,
    standardInstruction,
    glossaryInstruction,
    protectedInstruction,
    customInstruction,
    contractAndExamples
  ].filter(Boolean);

  return parts.join('\n\n');
};

export const getSystemInstruction = (
  tone: ToneType, 
  topic: TopicType, 
  customPrompt: string, 
  outputStandard: OutputStandard,
  glossary: GlossaryItem[] = [],
  doNotTranslateTerms: string = '',
  targetLanguage: TargetLanguage = 'fa',
  method: TranslationMethod = 'default',
  provider?: AIProvider | string
): string => {
  const isLocal = provider === 'lm_studio' || (method as string) === 'lm_studio';
  if (isLocal) {
    return getLocalSystemInstruction(
      tone,
      topic,
      customPrompt,
      outputStandard,
      glossary,
      doNotTranslateTerms,
      targetLanguage,
      method
    );
  }

  const core = getCoreSystemInstruction(targetLanguage, method);
  const dynamic = getDynamicSystemInstruction(
    tone, 
    topic, 
    customPrompt, 
    outputStandard, 
    glossary, 
    doNotTranslateTerms, 
    targetLanguage
  );
  return dynamic ? `${core}\n\n${dynamic}` : core;
};

/**
 * The transport format changes between the translation methods, so each
 * one gets its own contract while sharing the same quality requirements.
 */
export const getMethodTranslationInstruction = (method: TranslationMethod, targetLanguage: TargetLanguage): string => {
  if (method === 'paragraph') {
    return `--- PARAGRAPH METHOD CONTRACT ---
Read surrounding cues only to resolve ambiguity and maintain flow across cuts. Translate each dialogue item into its own marker; never summarize, omit, or replace a full cue with a fragment. Never move meaning from one cue marker into another. If a technical term needs clarification, put the original source term in parentheses.`;
  }
  if (method === 'skeleton_str') {
    return `--- SKELETON STR METHOD CONTRACT ---
Context cues are read-only anchors. Translate every requested tagged line ([TRANSLATE_X]) and return only the requested tagged lines without altering numbering or surrounding skeleton structure.`;
  }
  if (method === 'subtitle_translator') {
    return `--- SUBTITLE TRANSLATOR METHOD CONTRACT (rockbenben/subtitle-translator style) ---
Translate dialogue lines inside the requested [TRANSLATE_X] tags into professionally written native subtitles. Retain meaning, timing constraints, and register without modifying the outer structure.`;
  }
  return `--- STANDARD BATCH METHOD CONTRACT ---
Translate each JSON item with complete fidelity, returning exactly one native, un-summarized translation per requested item id.`;
};

export const LANGUAGE_PROMPTS: Record<TargetLanguage, string> = {
  fa: `You are a professional Persian translator. Use natural Persian sentence structure (SOV). Avoid "translationese".`,
  en: `You are a professional English translator. Natural, clear, and concise.`,
  ru: `You are a professional Russian translator. Proper cases and aspects.`,
  zh: `You are a professional Chinese translator. Idiomatic and high-quality.`,
  de: `You are a professional German translator. Precise grammar and Sie/Du usage.`,
  es: `You are a professional Spanish translator. Neutral Spanish, natural flow.`
};

export const STYLE_TEMPLATES: Record<string, StyleTemplate> = {
  netflix: {
    id: 'netflix',
    name: 'Netflix Style',
    config: {
      useStyles: true,
      fontFamily: 'Arial',
      fontSize: 22,
      primaryColor: '#FFFFE0', 
      secondaryColor: '#000000',
      backgroundColor: '#000000',
      backgroundOpacity: 0, 
      isBold: true,
      borderStyle: 'outline',
      outlineWidth: 2,
      shadowDepth: 2,
      alignment: 2
    }
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube Style',
    config: {
      useStyles: true,
      fontFamily: 'Roboto',
      fontSize: 20,
      primaryColor: '#FFFFFF',
      secondaryColor: '#000000',
      backgroundColor: '#000000',
      backgroundOpacity: 75, 
      isBold: false,
      borderStyle: 'box',
      outlineWidth: 0,
      shadowDepth: 0,
      alignment: 2
    }
  },
  professional: {
    id: 'professional',
    name: 'حرفه‌ای (Hard Sub)',
    config: {
      useStyles: true,
      fontFamily: 'Vazirmatn',
      fontSize: 24,
      primaryColor: '#FFFFFF',
      secondaryColor: '#000000',
      backgroundColor: '#000000',
      backgroundOpacity: 60,
      isBold: true,
      borderStyle: 'outline',
      outlineWidth: 2.5,
      shadowDepth: 1,
      alignment: 2
    }
  },
  minimal: {
    id: 'minimal',
    name: 'ساده و مینیمال',
    config: {
      useStyles: true,
      fontFamily: 'Tahoma',
      fontSize: 18,
      primaryColor: '#E0E0E0',
      secondaryColor: '#000000',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      isBold: false,
      borderStyle: 'outline',
      outlineWidth: 1,
      shadowDepth: 0,
      alignment: 2
    }
  }
};

export const FILE_EXTENSIONS = { SRT: '.srt', VTT: '.vtt', ASS: '.ass' };
