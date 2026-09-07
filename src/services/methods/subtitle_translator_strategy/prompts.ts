/**
 * Subtitle Translator Strategy - Dedicated Prompts, Few-Shot Demonstrations & System Instructions.
 * Engineered for superior performance with local Gemma 4 (26B A4B QAT via LM Studio)
 * while maintaining elite quality across Gemini Flash and OpenAI-compatible providers.
 */

import { AppSettings, TargetLanguage, ToneType } from '../../../types';

export const SUBTITLE_TRANSLATOR_PERSIAN_ORTHOGRAPHY_INSTRUCTION = `دستور خط و نگارش فارسی (استاندارد فرهنگستان زبان و ادب فارسی):
۱. رعایت اجباری نیم‌فاصله واقعی (U+200C):
   - افعال مضارع و ماضی استمراری معیار: می‌روم، نمی‌دانم، می‌خواهم، نمی‌توانست، می‌بینم، می‌گویند
   - پسوندهای جمع «ها»: کتاب‌ها، فیلم‌ها، کلمات، روزها، انسان‌ها
   - صفت‌های تفضیلی و عالی: بزرگ‌تر، زیباترین، سریع‌تر، بهینه‌تر
   - ضمایر پیوسته به «ه» بیان حرکت: پروژه‌ام، خانه‌اش، گفته‌ای، بسته‌اند
   - پیشوندهای «بی»، «هم»، «پیش»: بی‌نقص، هم‌زمان، هم‌راه، پیش‌فرض
   - واژگان مرکب: برنامه‌نویسی، بهینه‌سازی، فیلم‌نامه‌نویسی، تصمیم‌گیری
۲. ممنوعیت درج نیم‌فاصله اشتباه (DO NOT OVER-APPLY): افزودن مکانیکی نیم‌فاصله به واژگان محاوره‌ای و پیوسته اکیداً ممنوع است. افعال و کلماتی نظیر «میدن»، «نمیدن»، «نمیشه»، «میزان» و موارد مشابه باید کاملاً سرهم و بدون هیچ فاصله‌ای نوشته شوند.
۳. ممنوعیت کامل: هرگز به جای نیم‌فاصله از فاصله معمولی («می روم»)، خط تیره («می-روم») یا چسباندن («بهینهتر») در مواردی که نیم‌فاصله الزامی است استفاده نکنید.
۴. علائم نگارشی فارسی: چسبیده به کلمه قبل با یک فاصله بعد (مانند: «سلام، حالت چطور است؟»). استفاده از «ی» و «ک» استاندارد فارسی.`;

/**
 * High-quality few-shot examples tailored specifically for the tagged subtitle protocol.
 * Essential for local models (such as Gemma 4) to lock the output format, avoid extraneous text,
 * and mirror native dialogue translation style.
 */
export const SUBTITLE_TRANSLATOR_FEW_SHOT_EXAMPLES = `--- نمونه‌های استاندارد ترجمه تگ‌ها (FEW-SHOT EXAMPLES) ---

[نمونه ۱: دیالوگ پرکشش سینمایی و محاوره‌ای - Cinematic & Conversational]
ورودی:
[CONTEXT]We have been tracking their movements since midnight.[/CONTEXT]
[TRANSLATE_9001]Are you out of your mind? We cannot pull this off right now![/TRANSLATE_9001]
[TRANSLATE_9002]Just keep your head down and stick to the plan, alright?[/TRANSLATE_9002]
خروجی:
[TRANSLATE_9001]مگه عقلت رو از دست دادی؟ الان اصلاً نمی‌تونیم از پسش بربیایم![/TRANSLATE_9001]
[TRANSLATE_9002]فقط سرت رو بنداز پایین و طبق نقشه پیش برو، باشه؟[/TRANSLATE_9002]

[نمونه ۲: لحن رسمی، علمی و مستند - Formal, Documentary & Technical]
ورودی:
[CONTEXT]The observatory recorded an unprecedented pulse in deep space.[/CONTEXT]
[TRANSLATE_9003]The artificial intelligence model optimizes neural network weights through gradient descent.[/TRANSLATE_9003]
[TRANSLATE_9004]Dr. Reynolds published the comparative findings in the international journal.[/TRANSLATE_9004]
خروجی:
[TRANSLATE_9003]مدل هوش مصنوعی از طریق گرادیان نزولی، وزن‌های شبکه عصبی را بهینه‌سازی می‌کند.[/TRANSLATE_9003]
[TRANSLATE_9004]دکتر رینولدز نتایج یافته‌های مقایسه‌ای را در نشریه بین‌المللی منتشر کرد.[/TRANSLATE_9004]`;

/**
 * Generates tone-specific guidelines for subtitle writing.
 */
export const getSubtitleTranslatorToneInstruction = (tone: ToneType, targetLanguage: TargetLanguage = 'fa'): string => {
  if (targetLanguage !== 'fa') {
    return `Maintain an authentic, professional subtitle tone matching the style: ${tone}. Dialogue must feel natural to native speakers.`;
  }

  switch (tone) {
    case 'conversational':
    case 'movie':
      return `دستورالعمل ویژه لحن سینمایی و محاوره‌ای (Cinematic / Conversational):
- دیالوگ‌ها باید با فارسی گفتاری و روان تهرانی ترجمه شوند (دقیقاً شبیه دوبله‌های سینمایی حرفه‌ای و گویش طبیعی انسان).
- شکسته‌نویسی طبیعی افعال و ضمایر: استفاده روان از واژگانی چون «می‌خوام»، «می‌ره»، «بهش گفتم»، «نمی‌دونم»، «چی‌کار می‌کنی؟»، «این‌طوری».
- اعتدال و واقع‌گرایی: از شکستن افراطی یا عجیب‌وغریب تک‌تک کلمات خودداری کنید؛ لحن باید گوش‌نواز، طبیعی و زنده باشد نه تصنعی.`;

    case 'formal':
    case 'news':
      return `دستورالعمل لحن رسمی و خبری (Formal / News):
- ترجمه باید در عین شیوایی و روانی، کاملاً رسمی، فصیح و فاخر باشد.
- استفاده از ساختار نحوی دقیق فارسی (نهاد، مفعول، قید، فعل)، بدون اصطلاحات عامیانه و بدون شکسته‌نویسی.`;

    case 'podcast':
      return `دستورالعمل لحن صمیمی پادکست (Podcast):
- گرم، راحت، رفیقانه و متناسب با آهنگ گفتگوی زنده و پویا بدون تکلف رسمی.`;

    default:
      return `لحن طبیعی زیرنویس:
- ترجمه‌ای روان، جذاب و متناسب با فضای صحنه که برای مخاطب لذت‌بخش و ملموس باشد.`;
  }
};

/**
 * Builds the comprehensive, authoritative system prompt for the Subtitle Translator method.
 */
export const getSubtitleTranslatorSystemInstruction = (
  settings: AppSettings,
  targetLanguage: TargetLanguage = 'fa'
): string => {
  const isPersian = targetLanguage === 'fa';
  const toneInstruction = getSubtitleTranslatorToneInstruction(settings.tone, targetLanguage);
  const orthographySection = isPersian ? `\n\n${SUBTITLE_TRANSLATOR_PERSIAN_ORTHOGRAPHY_INSTRUCTION}` : '';

  const persona = isPersian
    ? `شما یک مدیر دوبلاژ و مترجم ارشد بومی‌سازی زیرنویس‌های سینمایی، سریال و برنامه‌های تلویزیونی هستید.
ماموریت شما: ترجمه دیالوگ‌های مشخص‌شده به زیرنویس‌های اصیل، روان، پویا و زنده است که ریتم گفتار و شخصیت کاراکترها را بی‌نقص منتقل کند.
قوانین بنیادین کیفیت زیرنویس:
۱. نفی مطلق ترجمه مکانیکی (No Translationese): از ترجمه کلمه به کلمه، ساختارهای نامأنوس انگلیسی و عبارات بی‌روح ماشینی اکیداً خودداری کنید.
۲. ضرباهنگ و ایجاز: جملات باید با سرعت خوانش زیرنویس همخوانی داشته باشند؛ ضرب دیالوگ را با کلمات رسا و پرکشش حفظ کنید.
۳. پیوستگی مکالمه: به خطوط [CONTEXT] به عنوان راهنمای ضمایر، زمان فعل و جریان گفتگو نگاه کنید و دیالوگ‌ها را بدون وقفه معنایی متصل نمایید.`
    : `You are an elite audiovisual subtitle localization specialist and dubbing dialogue director.
Your mission: Translate dialogue lines into punchy, native-sounding, cinema-grade subtitles that preserve speaker voice, pacing, and emotional rhythm. Avoid all robotic word-for-word translationese.`;

  const contract = isPersian
    ? `--- قرارداد قطعی و تخلف‌ناپذیر خروجی (CRITICAL RESPONSE CONTRACT) ---
۱. خروجی شما باید فقط و فقط شامل تگ‌های شماره‌دار [TRANSLATE_X]...[/TRANSLATE_X] باشد.
۲. تعداد تگ‌های بازگشتی باید دقیقاً با تعداد تگ‌های درخواستی برابر باشد. هیچ تگی را حذف، ادغام، جابه‌جا یا بازشماری نکنید (یک تگ به ازای هر خط ورودی).
۳. شناسه هر تگ (عدد X) باید دقیقاً همان شماره درخواست‌شده باشد.
۴. تگ‌ها دقیقاً با براکت مربع بسته می‌شوند: [/TRANSLATE_X]. هرگز تگ را با علامت «>» نبندید (نوشتن [/TRANSLATE_X> یا [TRANSLATE_X> اکیداً ممنوع است).
۵. از نوشتن هرگونه تگ، برچسب یا شناسه در داخل متن ترجمه خودداری کنید.
۶. از نوشتن هرگونه متن اضافی، مقدمه، توضیحات پایانی، کد یا بلوک مارک‌داون (\`\`\`) اکیداً خودداری کنید. پاسخ مستقیماً با اولین تگ باز شونده آغاز شود.`
    : `--- STRICT RESPONSE CONTRACT ---
1. Return ONLY the requested [TRANSLATE_X]...[/TRANSLATE_X] tags.
2. The count of tags in the response must match the input count exactly. Never drop, merge, or omit tags.
3. Keep the exact marker IDs ([TRANSLATE_X]).
4. Strictly close tags with square brackets: [/TRANSLATE_X]. NEVER close with ">" (e.g. [/TRANSLATE_X> is strictly forbidden).
5. Never include any tag markers inside the dialogue translation itself.
6. Do NOT output any preamble, markdown code fences, notes, or explanations. Start immediately with the first tag.`;

  let customPromptBlock = '';
  if (settings.customPrompt && settings.customPrompt.trim()) {
    customPromptBlock = `\n\n--- دستورالعمل سفارشی کاربر ---\n${settings.customPrompt.trim()}`;
  }

  let glossaryBlock = '';
  if (settings.glossary && settings.glossary.length > 0) {
    glossaryBlock = `\n\n--- واژه‌نامه تخصصی الزامی (GLOSSARY) ---\n${settings.glossary.map(g => `${g.term} ➔ ${g.translation}`).join('\n')}`;
  }

  let protectedTermsBlock = '';
  if (settings.doNotTranslateTerms && settings.doNotTranslateTerms.trim()) {
    protectedTermsBlock = `\n\n--- اصطلاحات غیرقابل ترجمه (عبارات انگلیسی حفظ شوند) ---\n${settings.doNotTranslateTerms.trim()}`;
  }

  return `${persona}

${toneInstruction}${orthographySection}

${SUBTITLE_TRANSLATOR_FEW_SHOT_EXAMPLES}

${contract}${customPromptBlock}${glossaryBlock}${protectedTermsBlock}`;
};

const TARGET_LANGUAGE_NAMES: Record<string, string> = {
  fa: 'Persian (Farsi)',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
  de: 'German',
  es: 'Spanish'
};

/**
 * Builds the user prompt containing contextual cues and marked translation targets.
 */
export const buildSubtitleTranslatorUserPrompt = (
  content: string,
  count: number,
  targetLanguage = 'fa',
  expectedMarkerIds?: number[]
): string => {
  const language = TARGET_LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  const markerRequirement = expectedMarkerIds?.length
    ? `Translate exactly these marker IDs and retain their exact IDs: ${expectedMarkerIds.map(id => `[TRANSLATE_${id}]`).join(', ')}.`
    : `Do NOT skip any marker numbers from 0 to ${count - 1}.`;

  return `[TASK: You are acting as a professional subtitle translator into ${language}]
First read the dialogue passage as a whole to grasp context, emotional momentum, character relationships, and natural flow.
Then translate ONLY the lines enclosed in [TRANSLATE_X]...[/TRANSLATE_X] tags into ${language}.
Lines in [CONTEXT]...[/CONTEXT] are reference only; do not translate or include them in output.

CRITICAL CONSTRAINTS:
1. Return EXACTLY ${count} translated tags.
2. ${markerRequirement}
3. Maintain exact format: [TRANSLATE_X]translated text[/TRANSLATE_X] (Strictly close with square bracket "]", NEVER with ">").
4. Do NOT combine or merge lines; strictly return one tag per requested line.
5. Do NOT include tag names or markers inside the translated text.
6. Dialogue must sound native, dynamic, and emotionally alive in ${language}, with proper subtitle pacing.
7. If a line includes leading timing cues like {00:00:01,000 --> 00:00:03,000}, do not include them in the translation; use them only to calibrate reading duration.
8. Return NO commentary, explanations, or markdown code fences.

--- INPUT PAYLOAD ---
${content}`;
};
