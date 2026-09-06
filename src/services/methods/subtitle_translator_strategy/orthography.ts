/**
 * Advanced Persian Orthography & Half-Space Normalizer for Subtitle Translator Strategy.
 * Strictly adheres to Persian Academy (فرهنگستان زبان و ادب فارسی) orthographic standards.
 * Ensures consistent use of Zero-Width Non-Joiner (U+200C) across all verb tenses,
 * affixes, comparatives, plurals, and compounds without breaking words.
 */

export const PERSIAN_HALF_SPACE = '\u200C';

/**
 * Normalizes Arabic letters to Persian equivalents.
 */
export const normalizePersianChars = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ى/g, 'ی')
    .replace(/ئ/g, 'ی')
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Arabic harakat/diacritics if present
    .replace(/ـ+/g, PERSIAN_HALF_SPACE); // Replace tatweel/kashida with half-space where applicable
};

/**
 * Fixes irregular half-space placements (spaces around ZWNJ, duplicate ZWNJs, edge ZWNJs).
 */
export const cleanHalfSpaceArtifacts = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\u200C{2,}/g, PERSIAN_HALF_SPACE)
    .replace(/\s*\u200C+\s*/g, PERSIAN_HALF_SPACE)
    .replace(/^\u200C+|\u200C+$/g, '')
    .replace(/\u200C+([،؛؟!.\s])/g, '$1')
    .replace(/([،؛؟!.\s])\u200C+/g, '$1');
};

/**
 * Master half-space normalizer tailored for subtitle dialogues and literary/cinematic texts.
 */
export const normalizeSubtitleTranslatorPersianHalfSpaces = (value: string): string => {
  if (!value || typeof value !== 'string') return '';

  let text = normalizePersianChars(value);

  // 1. Verbal prefixes: می‌ and نمی‌ before present/past continuous verbs
  // Matches "می" or "نمی" followed by space/hyphen/tatweel and any Persian word
  // Excludes standalone "می" in contexts like "می ناب" or non-verbs
  text = text.replace(
    /(^|[\s«"'(])(ن?می)(?:\s|-|ـ|\u200C)*([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیپ][ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]+)/gu,
    (match, prefixBoundary, miPrefix, verbStem) => {
      // Ignore false positives where "می" is part of another word or standalone noun
      if (verbStem.length < 2) return match;
      return `${prefixBoundary}${miPrefix}${PERSIAN_HALF_SPACE}${verbStem}`;
    }
  );

  // 2. Plural suffixes: ها، های، هایی، هایم، هایت، هایش، هایمان، هایتان، هایشان
  text = text.replace(
    /([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی])(?:\s|-|ـ|\u200C)+(ها(?:یی|یم|یت|یش|مان|تان|شان|ی)?)(?=[\s،؛؟!.)»"']|$)/gu,
    `$1${PERSIAN_HALF_SPACE}$2`
  );

  // 3. Comparatives: تر and ترین
  // Avoid modifying words where "تر" is native part of the root (e.g. بهتر, کمتر, بیشتر, دختر, پرتر, سرتر)
  const nativeRootsWithTar = new Set([
    'به', 'کم', 'بیش', 'دخ', 'کبو', 'خاکس', 'دف', 'پیان', 'دک', 'رویا', 'اخ', 'تئاس', 'شتر', 'تیر', 'تبر'
  ]);
  text = text.replace(
    /([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]{2,})(?:\s|-|ـ|\u200C)+(ترین|تر)(?=[\s،؛؟!.)»"']|$)/gu,
    (match, stem, suffix) => {
      if (nativeRootsWithTar.has(stem)) return match;
      return `${stem}${PERSIAN_HALF_SPACE}${suffix}`;
    }
  );

  // 4. Pronoun and past participle attachments to silent Heh (ه/ـه):
  // e.g. خانه‌ام، پروژه‌اش، گفته‌ای، بسته‌اند، دیده‌ام، بوده‌ایم
  text = text.replace(
    /([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]ه)(?:\s|-|ـ|\u200C)+(ام|ات|اش|ای|اید|ایم|اند|است)(?=[\s،؛؟!.)»"']|$)/gu,
    `$1${PERSIAN_HALF_SPACE}$2`
  );

  // 5. Negative and continuous prefixes: بی‌ (without), هم‌ (co-), پیش‌ (pre-)
  text = text.replace(
    /(^|[\s«"'(])(بی|هم|پیش|نیم|فرا|فرو|بر)(?:\s|-|ـ|\u200C)+([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]{2,})/gu,
    (match, boundary, prefix, baseWord) => {
      // Exclude prepositions or non-compound words (e.g. "هم او", "هم این")
      if (prefix === 'هم' && ['او', 'این', 'آن', 'چنین', 'چنان', 'همه'].includes(baseWord)) {
        return match;
      }
      if (prefix === 'بر' && ['روی', 'اساس', 'سر', 'پای', 'تن'].includes(baseWord)) {
        return match;
      }
      return `${boundary}${prefix}${PERSIAN_HALF_SPACE}${baseWord}`;
    }
  );

  // 6. Compound nouns and specialized roots:
  // نویسی، سازی، ریزی، پذیری، پذیری، شناسی، یابی، مندی، مندان، بخشی
  text = text.replace(
    /([ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]{2,})(?:\s|-|ـ|\u200C)+(نویس(?:ی)?|ساز(?:ی)?|ریز(?:ی)?|پذیر(?:ی)?|شناس(?:ی)?|یاب(?:ی)?|مند(?:ی|ان)?|بخش(?:ی)?|نما|طلب(?:ی)?|خواه(?:ی)?|پرداز(?:ی)?|آمیز|انگیز)(?=[\s،؛؟!.)»"']|$)/gu,
    `$1${PERSIAN_HALF_SPACE}$2`
  );

  // 7. Common demonstrative and conversational compounds:
  // این‌گونه، آن‌گونه، این‌طور، آن‌طور، این‌جا، آن‌جا، این‌قدر، آن‌قدر، هم‌چنین، هم‌چنان، چه‌طور
  text = text.replace(
    /(^|[\s«"'(])(این|آن|چه|هم)(?:\s|-|ـ|\u200C)+(گونه|طور|جا|قدر|چنان|چنین)/gu,
    `$1$2${PERSIAN_HALF_SPACE}$3`
  );

  // 8. Persian typography & punctuation cleanup:
  // Remove space before punctuation marks, ensure single space after
  text = text
    .replace(/\s+([،؛؟!.:])/g, '$1')
    .replace(/([،؛؟!.:])(?=[^\s،؛؟!.:0-9»"'\)\]])/g, '$1 ')
    .replace(/\s{2,}/g, ' ');

  return cleanHalfSpaceArtifacts(text).trim();
};
