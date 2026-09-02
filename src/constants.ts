
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

const SYSTEM_PROMPTS = {
  base: `شما یک مترجم ارشد و متخصص بومی‌سازی (Localization) هستید. وظیفه شما ترجمه "روح کلام" است، نه فقط جایگزینی کلمات.

--- پروتکل بازبینی هوشمند (Self-Refinement) ---
1. **حذف ترجمه ماشینی:** از ساختارهای سنگین مانند "توسط" (by) برای مفعول، یا "می‌باشد" به جای "است" پرهیز کنید.
2. **روانی بومی:** متن باید طوری باشد که انگار یک فارسی‌زبان آن را از ابتدا نوشته است.
3. **امانت‌داری معنایی:** هیچ جمله، جزئیات، قید، مثال یا رابطه‌ای را حذف، خلاصه یا ساده‌سازیِ مخل نکنید. کوتاهی فقط با حفظ کامل معنا مجاز است.
4. **زمان‌بندی:** متن را برای زیرنویس خوانا نگه دارید، اما محدودیت زمانی هرگز مجوز حذف محتوا یا خلاصه‌نویسی نیست.
5. **کیفیت نگارش فارسی:** از نشانه‌گذاری درست، نیم‌فاصله، ترتیب طبیعی اجزای جمله، حذف حشو و انتخاب واژگان حرفه‌ای استفاده کنید.
6. **پیوستگی متن:** اگر جمله بین چند زیرنویس شکسته شده، مفهوم کامل را از کل بافت دریافت کنید و ترجمه هر بخش را طوری بنویسید که در کنار بخش‌های قبل و بعد طبیعی باشد.`,

  netflix: `--- استانداردهای NETFLIX ---
1. برای رعایت محدودیت 42 کاراکتر در خط، شکست خط و بازنویسیِ هم‌معنا انجام دهید؛ محتوا را خلاصه یا حذف نکنید.
2. حداکثر 2 خط در هر بلاک.
3. سرعت خواندن (Reading Speed) نباید از 20 کاراکتر در ثانیه تجاوز کند.`,

  bbc: `--- استانداردهای BBC ---
1. محدودیت شدید کاراکتر: حداکثر 37 کاراکتر در هر خط.
2. خوانایی حداکثری: سرعت خواندن نباید از 17 کاراکتر در ثانیه تجاوز کند.
3. جملات را با حفظ تمام اطلاعات به شکل خوانا تقسیم کنید؛ هیچ بخشی را حذف یا خلاصه نکنید.`,

  broadcast: `--- استانداردهای BROADCAST ---
1. استاندارد پخش تلویزیونی: حداکثر 39 کاراکتر در هر خط.
2. تعادل بین دقت و سرعت خواندن (حداکثر 18 کاراکتر بر ثانیه).`,

  tones: {
    conversational: `--- پروتکل Tehrani Spoken Style (بسیار مهم) ---
- از زبان محاوره‌ای مدرن و "شکسته" استفاده کنید.
- تبدیل "ان" به "ون" در کلماتی که رایج است (مثل: "می‌شه"، "می‌تونیم"، "براتون"، "خونه").
- حذف شناسه‌های رسمی (مثلاً "بخورید" -> "بخورین").
- حفظ صمیمیت در عین رعایت ادب آموزشی.`,

    formal: `لحن رسمی و کتابی. مناسب برای مستندهای علمی و متون حقوقی.`,
    news: `لحن خبری، قاطع و بی‌طرفانه.`,
    movie: `بومی‌سازی فرهنگی اصطلاحات (Slang Preservation).`,
    podcast: `لحن صمیمی پادکست، حفظ تکیه‌کلام‌ها و ریتم کلام گوینده.`,
  },

  topics: {
    educational: `--- پروتکل ترجمهٔ آموزشی و علمی ---
1. پیش از نوشتن، موضوع، رابطهٔ علّی، تعریف‌ها، مراحل و قیدهای علمی را از بافت کامل تشخیص بده؛ هیچ‌کدام را مبهم، عامیانه یا ناقص نکن.
2. از معادل جاافتاده و دقیق فارسی در منابع آموزشی استفاده کن؛ از ترجمهٔ تحت‌اللفظی، واژه‌سازی بی‌دلیل و برگردانِ کلمه‌به‌کلمه پرهیز کن.
3. اصطلاح انگلیسی را فقط وقتی در پرانتز بیاور که برای یادگیری یا رفع ابهام ضروری است؛ برای واژه‌های رایج، متن فارسی روان و مستقل بنویس.
4. نام متغیرها، کد، برندها، فرمول‌ها و اصطلاحاتی که در واژه‌نامه یا فهرست اصطلاحات محافظت‌شده آمده‌اند را دقیقاً حفظ کن.
5. یک بازبینی نهایی انجام بده: آیا دانشجو بدون دیدن متن مبدأ، مفهوم، هدف و نتیجهٔ هر جمله را دقیق و طبیعی دریافت می‌کند؟`,

    entertainment: `تمرکز بر بومی‌سازی ضرب‌المثل‌ها و شوخی‌ها.`,
    podcast: `حفظ اسامی برندها و اشخاص به صورت دقیق.`,
    news: `دقت در ترجمه القاب و نام‌های جغرافیایی.`,
    sports: `استفاده از ترمینولوژی رایج گزارشگران ورزشی ایران.`,
  }
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
) => {
  let prompt = SYSTEM_PROMPTS.base.replace(/Persian|فارسی/g, TARGET_LANGUAGES[targetLanguage] || 'Persian') + '\n\n';
  // Skeleton STR is a tagged protocol, not JSON. Keeping the JSON schema out
  // of its system instruction prevents providers from returning an otherwise
  // valid JSON response that its tagged-response parser cannot place.
  if (method !== 'skeleton_str' && method !== 'subtitle_translator') {
    prompt += `فرمت خروجی (JSON Array):
[
  {
    "id": 1,
    "translatedText": "ترجمه بومی و روان"
  }
]\n\n`;
  }
  prompt += `--- Target language ---\nTranslate all target subtitle text into ${TARGET_LANGUAGES[targetLanguage]}. Follow native grammar, punctuation, subtitle conventions, and reading direction for this language. Do not force Persian style rules when the target language is not Persian.\n\n`;
  prompt += getMethodTranslationInstruction(method, targetLanguage) + '\n\n';
  if (outputStandard === 'netflix') prompt += SYSTEM_PROMPTS.netflix + '\n\n';
  if (outputStandard === 'bbc') prompt += SYSTEM_PROMPTS.bbc + '\n\n';
  if (outputStandard === 'broadcast') prompt += SYSTEM_PROMPTS.broadcast + '\n\n';

  if (targetLanguage === 'fa' && SYSTEM_PROMPTS.tones[tone]) prompt += `${SYSTEM_PROMPTS.tones[tone]}\n\n`;
  else if (SYSTEM_PROMPTS.tones[tone]) prompt += `Tone: ${tone}. Keep the translation native and subtitle-friendly for ${TARGET_LANGUAGES[targetLanguage]}.\n\n`;
  if (SYSTEM_PROMPTS.topics[topic]) prompt += `${SYSTEM_PROMPTS.topics[topic]}\n\n`;

  if (glossary.length > 0) {
    prompt += `--- واژه‌نامه اختصاصی ---\n${glossary.map(item => `- ${item.term} -> ${item.translation}`).join('\n')}\n\n`;
  }

  const protectedTerms = doNotTranslateTerms.split(',').map(term => term.trim()).filter(Boolean);
  if (protectedTerms.length > 0) {
    prompt += `--- کلمات استثنا / غیرقابل ترجمه ---\nاین کلمات را دقیقاً با همین املا نگه دار و ترجمه، بومی‌سازی یا آوانویسی نکن: ${protectedTerms.join(', ')}\n\n`;
  }

  if (customPrompt) prompt += `--- دستورالعمل سفارشی ---\n${customPrompt}\n\n`;
  
  return prompt;
};

/**
 * The transport format changes between the three translation methods, so each
 * one gets its own contract while sharing the same quality requirements.
 */
export const getMethodTranslationInstruction = (method: TranslationMethod, targetLanguage: TargetLanguage): string => {
  const persianWriting = targetLanguage === 'fa'
    ? 'Use professional Persian orthography: correct punctuation, Persian ی and ک, natural word order, and نیم‌فاصله where required.'
    : `Use the professional orthography, punctuation, and natural grammar of ${TARGET_LANGUAGES[targetLanguage]}.`;
  const shared = `Translate completely, naturally, and professionally. Preserve every meaning, detail, qualifier, and relationship from the source; never summarize, omit, or replace a full cue with a short gist. Follow the selected tone, topic, glossary, protected terms, and custom instruction. ${persianWriting} For genuinely specialized terms only, write the natural translation followed by the original source term in parentheses when it improves precision; never add parentheses for ordinary words.`;

  if (method === 'paragraph') {
    return `--- PARAGRAPH METHOD CONTRACT ---\n${shared}\nRead the complete paragraph for context, then translate every marked cue independently and fully. Keep all meaning assigned to its own marker: do not move content to a neighboring cue, merge cues, or finish a later cue early. Subtitle line limits may guide line breaks, never content reduction.`;
  }
  if (method === 'skeleton_str') {
    return `--- SKELETON STR METHOD CONTRACT ---\n${shared}\nUse context only to understand the passage. Translate every requested tagged line completely, keep exactly one translation per tag, and return no text outside the requested tags.`;
  }
  if (method === 'subtitle_translator') {
    return `--- SUBTITLE TRANSLATOR METHOD CONTRACT ---\n${shared}\nMirror the extraction/translation/reinsertion strategy used by rockbenben/subtitle-translator: structural subtitle data stays local, only dialogue lines inside requested [TRANSLATE_X] tags are translated, surrounding [CONTEXT] lines are for comprehension only, and the response contains exactly one translated tag for each requested source line. Never expose, edit, invent, merge, renumber, or reorder timing, cue, VTT metadata, ASS header/style, or block-boundary data. Persian output must read like professionally written native subtitles: concise, idiomatic, emotionally accurate, and free of machine-translation phrasing.`;
  }
  return `--- STANDARD BATCH METHOD CONTRACT ---\n${shared}\nTranslate every requested JSON item completely and return one faithful translation for each ID. Context is for comprehension only and must not cause content from one item to be moved into another.`;
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
