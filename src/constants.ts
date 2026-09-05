
import { ToneType, TopicType, GlossaryItem, StyleTemplate, TargetLanguage, OutputStandard, TranslationMethod, AIProvider, ModelType } from "./types";

export const APP_CONFIG = {
  version: "3.0.0", // Dynamic Batch Queue & Real-time Auto-Pipeline Update
  maxWordsPerBlock: 24, 
  minWordsPerBlock: 1, 
  maxFileSize: 100 * 1024 * 1024, 
  maxFilesPerUpload: 50,
  supportedFormats: ['srt', 'vtt', 'ass'],
  geminiModels: {
    standard: 'gemini-3-flash-preview',       
    professional: 'gemini-3-pro-preview',    
    flash: 'gemini-2.5-flash-latest',       
    flash_lite: 'gemini-flash-lite-latest' 
  },
  retryConfig: {
    maxRetries: 5, 
    baseDelay: 6000, 
    overloadWaitMs: 30000, 
  }
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
export const getAdaptiveTranslationBatchSize = (provider: AIProvider, model: ModelType, method: TranslationMethod): number => {
  // Tagged subtitle translators are more reliable with short batches: every
  // target needs a distinct closing tag, and a single omission blocks recovery.
  if (method === 'subtitle_translator') {
    if (provider === 'lm_studio') return 10;
    if (provider === 'gtx' || provider === 'edge' || provider === 'deeplx') return 6;
    return 8;
  }
  if (method === 'skeleton_str') {
    if (provider === 'lm_studio') return 24;
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
    if (model === 'professional') return 12;
    if (model === 'flash' || model === 'flash_lite') return 42;
    return 24;
  }

  // Non-Gemini providers: preserve exact previous logic
  if (method === 'paragraph') return model === 'professional' ? 12 : 16;
  if (provider === 'lm_studio') return 36;
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

export const getSystemInstruction = (
  tone: ToneType, 
  topic: TopicType, 
  customPrompt: string, 
  outputStandard: OutputStandard,
  glossary: GlossaryItem[] = [],
  doNotTranslateTerms: string = '',
  targetLanguage: TargetLanguage = 'fa',
  method: TranslationMethod = 'default'
): string => {
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
بافت کامل پاراگراف را برای درک بخوانید، سپس هر دیالوگ را با نشانگر شناسهٔ خودش به صورت مستقل ترجمه کنید. جابجایی محتوا به نشانگر دیگر، ادغام، یا خلاصه کردن ممنوع است.`;
  }
  if (method === 'skeleton_str') {
    return `--- SKELETON STR METHOD CONTRACT ---
بافت صرفاً برای درک است. تمام تگ‌های شماره‌دار [TRANSLATE_X] را دقیقاً ترجمه کرده و فقط تگ‌های ترجمه‌شده را بازگردانید.`;
  }
  if (method === 'subtitle_translator') {
    return `--- SUBTITLE TRANSLATOR METHOD CONTRACT ---
فقط خطوط دیالوگ داخل تگ‌های درخواستی [TRANSLATE_X] ترجمه می‌شوند. ساختار، زمان‌بندی و متادیتاها هرگز تغییر نخواهند کرد. دقیقا یک تگ خروجی به ازای هر تگ درخواستی بازگردانید.`;
  }
  return `--- STANDARD BATCH METHOD CONTRACT ---
هر آیتم JSON را با وفاداری کامل و بدون خلاصه‌سازی ترجمه کرده و دقیقاً یک ترجمه طبیعی برای هر شناسه بازگردانید.`;
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
