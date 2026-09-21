import { SubtitleBlock, SubtitleFile, AppSettings, GlossaryItem, GlossaryExtractionProgress } from '../types';
import { createGeminiClient, callLmStudioChat, callOpenAICompatibleChat, getActiveOpenAICompatibleService } from './geminiService';
import { getResolvedGeminiModel } from '../constants';
import { correctPersianOrthography, normalizePersianChars } from './persianOrthography';

/**
 * Strips subtitle markup, sequence numbers, and ASS/VTT tags to produce
 * a clean, continuous plain-text transcript suitable for lexical analysis.
 */
export const convertSubtitleToPlainText = (blocks: SubtitleBlock[]): string => {
  if (!blocks || blocks.length === 0) return '';

  const cleanLines: string[] = [];

  for (const block of blocks) {
    if (!block.originalText) continue;

    // Strip HTML formatting tags (e.g., <i>, <b>, <font color="...">, </font>)
    let cleaned = block.originalText.replace(/<[^>]+>/g, ' ');

    // Strip ASS/SSA style override blocks: {...}
    cleaned = cleaned.replace(/\{[^}]+\}/g, ' ');

    // Strip WebVTT voice or style tags: <v Name>, <c.color>
    cleaned = cleaned.replace(/<[vV][^>]*>/g, ' ').replace(/<\/?[a-zA-Z0-9_.-]+>/g, ' ');

    // Normalize multiple newlines and spaces within the block
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (cleaned.length > 0) {
      cleanLines.push(cleaned);
    }
  }

  return cleanLines.join('\n');
};

export interface ExtractionChunk {
  chunkIndex: number;
  totalChunks: number;
  text: string;
  startBlockId: number;
  endBlockId: number;
  lineCount: number;
}

/**
 * Splits plain text into balanced, manageable chunks (default: 35-45 dialogue cues)
 * to control model pressure, avoid latency spikes, and prevent context saturation.
 */
export const chunkSubtitleForGlossary = (
  blocks: SubtitleBlock[],
  linesPerChunk: number = 40
): ExtractionChunk[] => {
  if (!blocks || blocks.length === 0) return [];

  const chunks: ExtractionChunk[] = [];
  const validBlocks = blocks.filter(b => b.originalText && b.originalText.trim().length > 0);

  if (validBlocks.length === 0) return [];

  const safeLinesPerChunk = Math.max(15, Math.min(80, linesPerChunk));
  const totalChunks = Math.ceil(validBlocks.length / safeLinesPerChunk);

  for (let i = 0; i < validBlocks.length; i += safeLinesPerChunk) {
    const slice = validBlocks.slice(i, i + safeLinesPerChunk);
    const chunkIndex = chunks.length + 1;
    const text = convertSubtitleToPlainText(slice);

    chunks.push({
      chunkIndex,
      totalChunks,
      text,
      startBlockId: slice[0].id,
      endBlockId: slice[slice.length - 1].id,
      lineCount: slice.length
    });
  }

  // Update final totalChunks count accurately
  return chunks.map(c => ({ ...c, totalChunks: chunks.length }));
};

/**
 * Normalizes English term for strict deduplication.
 */
export const normalizeEnglishTerm = (term: string): string => {
  if (!term) return '';
  return term
    .trim()
    // Strip accidental leading/trailing punctuation or quotes
    .replace(/^["'`«»“”—\-_.:;,]+|["'`«»“”—\-_.:;,]+$/g, '')
    .trim()
    .toLowerCase();
};

/**
 * Normalizes Persian translation for uniform presentation and orthography.
 */
export const normalizePersianTerm = (translation: string): string => {
  if (!translation) return '';
  const cleaned = normalizePersianChars(translation.trim())
    .replace(/^["'`«»“”—\-_.:;,]+|["'`«»“”—\-_.:;,]+$/g, '')
    .trim();
  return correctPersianOrthography(cleaned);
};

/**
 * Common English filler/conversational words to eliminate from specialized glossary.
 */
const COMMON_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'because', 'as', 'what', 'which',
  'this', 'that', 'these', 'those', 'then', 'so', 'to', 'of', 'at', 'by', 'for',
  'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
  'over', 'under', 'again', 'further', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'hello', 'bye', 'yes',
  'yeah', 'okay', 'please', 'thanks', 'thank you', 'good morning', 'right', 'well',
  'maybe', 'really', 'sure', 'look', 'listen', 'come', 'go', 'see', 'know',
  'think', 'take', 'want', 'tell', 'ask', 'work', 'seem', 'feel', 'try', 'leave',
  'call', 'good', 'new', 'first', 'last', 'long', 'great', 'little', 'own'
]);

/**
 * Unifies, deduplicates, and resolves conflicting translations across chunks.
 * Ensures strictly ONE canonical translation per specialized term.
 */
export const unifyAndDeduplicateGlossary = (
  items: GlossaryItem[],
  existingGlossary: GlossaryItem[] = []
): GlossaryItem[] => {
  if (!items || items.length === 0) return [...existingGlossary];

  // Map: normalizedTerm => { canonicalTerm, translationCounts: Map<translation, count>, firstSeen }
  const termMap = new Map<string, {
    originalDisplayTerm: string;
    translationCounts: Map<string, number>;
    firstTranslation: string;
  }>();

  // Seed with user's pre-existing glossary items so their chosen translation has top priority
  for (const existing of existingGlossary) {
    if (!existing.term || !existing.translation) continue;
    const norm = normalizeEnglishTerm(existing.term);
    if (!norm) continue;

    const normTrans = normalizePersianTerm(existing.translation);
    const countMap = new Map<string, number>();
    countMap.set(normTrans, 1000); // Massive weight to respect user's explicit choice

    termMap.set(norm, {
      originalDisplayTerm: existing.term.trim(),
      translationCounts: countMap,
      firstTranslation: normTrans
    });
  }

  // Aggregate extracted items
  for (const item of items) {
    if (!item.term || !item.translation) continue;

    const normKey = normalizeEnglishTerm(item.term);
    // Ignore trivial 1-character items or common conversational stop words
    if (!normKey || normKey.length <= 1 || COMMON_STOP_WORDS.has(normKey)) {
      continue;
    }

    const normTrans = normalizePersianTerm(item.translation);
    if (!normTrans || normTrans.length <= 1) {
      continue;
    }

    const existingEntry = termMap.get(normKey);
    if (!existingEntry) {
      const counts = new Map<string, number>();
      counts.set(normTrans, 1);
      termMap.set(normKey, {
        originalDisplayTerm: item.term.trim(),
        translationCounts: counts,
        firstTranslation: normTrans
      });
    } else {
      const currentCount = existingEntry.translationCounts.get(normTrans) || 0;
      existingEntry.translationCounts.set(normTrans, currentCount + 1);
    }
  }

  // Resolve canonical single translation for each term
  const unified: GlossaryItem[] = [];

  for (const [, entry] of termMap.entries()) {
    // Find the translation with the highest consensus/frequency
    let bestTranslation = entry.firstTranslation;
    let maxCount = -1;

    for (const [trans, count] of entry.translationCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        bestTranslation = trans;
      }
    }

    unified.push({
      term: entry.originalDisplayTerm,
      translation: bestTranslation
    });
  }

  // Sort alphabetically by English term
  unified.sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));

  return unified;
};

/**
 * Robust JSON parser that extracts GlossaryItem[] from AI output.
 */
const parseGlossaryJsonResponse = (rawText: string): GlossaryItem[] => {
  if (!rawText) return [];

  let clean = rawText.trim();

  // Strip markdown code fences if present
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  // Locate the JSON array
  const firstBracket = clean.indexOf('[');
  const lastBracket = clean.lastIndexOf(']');

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    clean = clean.substring(firstBracket, lastBracket + 1);
  }

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(item => item && typeof item.term === 'string' && typeof item.translation === 'string')
        .map(item => ({
          term: item.term.trim(),
          translation: item.translation.trim()
        }));
    }
  } catch (err) {
    // Fallback: line-by-line regex if JSON had minor syntax glitch
    const fallbackItems: GlossaryItem[] = [];
    const itemRegex = /"term"\s*:\s*"([^"]+)"\s*,\s*"translation"\s*:\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(clean)) !== null) {
      fallbackItems.push({
        term: match[1].trim(),
        translation: match[2].trim()
      });
    }
    if (fallbackItems.length > 0) return fallbackItems;
    console.warn('[GlossaryExtraction] Failed to parse JSON response:', err, rawText);
  }

  return [];
};

/**
 * Validates whether the active AI provider is properly configured before attempting glossary extraction.
 */
export const validateGlossaryProviderReady = (settings: AppSettings): { ready: boolean; error?: string } => {
  if (settings.aiProvider === 'gemini') {
    const validKeys = settings.apiKeys.filter(k => k.isValid !== false && !k.isRateLimited && k.key && k.key.trim().length > 0);
    if (validKeys.length === 0) {
      const anyKeys = settings.apiKeys.filter(k => k.key && k.key.trim().length > 0);
      if (anyKeys.length === 0) {
        return {
          ready: false,
          error: 'هیچ کلید API جمینای (Gemini API Key) در تنظیمات برنامه ثبت نشده است. لطفاً ابتدا در بخش تنظیمات، کلید API خود را وارد کنید.'
        };
      }
      return {
        ready: false,
        error: 'تمام کلیدهای API جمینای ثبت‌شده به سقف مجاز (Rate Limit) رسیده‌اند یا نامعتبر شده‌اند. لطفاً کلید جدید وارد کنید.'
      };
    }
    return { ready: true };
  }

  if (settings.aiProvider === 'lm_studio') {
    if (!settings.lmStudioBaseUrl || !settings.lmStudioBaseUrl.trim()) {
      return {
        ready: false,
        error: 'آدرس سرور محلی LM Studio در تنظیمات وارد نشده است.'
      };
    }
    return { ready: true };
  }

  if (settings.aiProvider === 'openai_compatible') {
    const service = getActiveOpenAICompatibleService(settings);
    if (!service || !service.baseUrl) {
      return {
        ready: false,
        error: 'هیچ سرویس سازگار با OpenAI در تنظیمات انتخاب نشده است.'
      };
    }
    return { ready: true };
  }

  return {
    ready: false,
    error: `ارائه‌دهنده فعال (${settings.aiProvider}) از استخراج هوشمند واژه‌نامه با هوش مصنوعی پشتیبانی نمی‌کند. لطفاً ارائه‌دهنده را روی Gemini یا LM Studio تنظیم فرمایید.`
  };
};

/**
 * Extracts specialized terminology and standard Persian translations for a single text chunk.
 * Directs the AI model to first extract the domain-specific terms, and then provide a precise, canonical Persian translation.
 */
export const extractGlossaryFromChunk = async (
  chunk: ExtractionChunk,
  settings: AppSettings,
  apiKey?: string,
  signal?: AbortSignal
): Promise<GlossaryItem[]> => {
  signal?.throwIfAborted();

  // Pre-validate provider configuration before sending network request
  const validation = validateGlossaryProviderReady(settings);
  if (!validation.ready) {
    throw new Error(validation.error);
  }

  const systemInstruction = `شما یک اصطلاح‌شناس و واژه‌گزین ارشد زبان فارسی و مترجم حرفه‌ای متون دانشگاهی و آموزشی هستید.
وظیفه شما:
متن زیرنویس زیر را دقیق مطالعه کنید و در دو گام دقیق عمل نمایید:
گام ۱ (استخراج): تمام «واژگان، اصطلاحات، مفاهیم علمی، فنی، آموزشی، اختصارات تخصصی و اسامی خاص فنی» متن را شناسایی و جدا کنید.
گام ۲ (ترجمه و معادل‌سازی یکدست): برای هر واژه یا اصطلاح تخصصی، دقیق‌ترین و استانداردترین معادل رسمی و دانشگاهی فارسی را تعیین کنید.

قوانین الزامی:
۱. کلمات عمومی، روزمره و پیش‌پاافتاده زبان (مانند listen, look, hello, good, bad, start, because, know, see, think, want) را به هیچ وجه استخراج نکنید؛ فقط اصطلاحاتی که نیاز به ترجمه یکدست در تمام قسمت‌ها دارند.
۲. در صورت وجود اختصارات علمی/فنی (مانند DNS, API, GPU, RAM, SDK, LLM)، معادل یا آوانویسی استاندارد آموزشی آن را ذکر کنید.
۳. پاسخ را منحصراً در قالب JSON معتبر با ساختار زیر ارسال کنید (بدون هیچ متن توضیحی اضافه):
[
  { "term": "English term", "translation": "معادل استاندارد فارسی" }
]`;

  const userPrompt = `### متن بخش شماره ${chunk.chunkIndex} از ${chunk.totalChunks} (شامل ${chunk.lineCount} خط دیالوگ):
${chunk.text}

ابتدا واژگان تخصصی این بخش را استخراج و سپس ترجمه استاندارد فارسی آنها را ارائه دهید. پاسخ فقط آرایه JSON باشد:`;

  if (settings.aiProvider === 'lm_studio') {
    const raw = await callLmStudioChat(settings, systemInstruction, userPrompt, signal);
    const parsed = parseGlossaryJsonResponse(raw);
    if (!parsed || parsed.length === 0) {
      console.warn(`[GlossaryExtract] LM Studio returned no items for chunk ${chunk.chunkIndex}. Raw response:`, raw);
    }
    return parsed;
  }

  if (settings.aiProvider === 'openai_compatible') {
    const service = getActiveOpenAICompatibleService(settings);
    const raw = await callOpenAICompatibleChat(service, 0.2, systemInstruction, userPrompt, signal);
    const parsed = parseGlossaryJsonResponse(raw);
    return parsed;
  }

  // Gemini Provider with intelligent key rotation and model fallback
  const availableKeys = settings.apiKeys.filter(k => k.isValid !== false && !k.isRateLimited && k.key.trim().length > 0);
  const keyPool = apiKey
    ? [{ key: apiKey.trim(), isRateLimited: false }]
    : (availableKeys.length > 0 ? availableKeys : settings.apiKeys.filter(k => k.key && k.key.trim().length > 0));

  if (keyPool.length === 0) {
    throw new Error('هیچ کلید معتبری برای استخراج واژگان تخصصی یافت نشد. لطفاً در تنظیمات کلید معتبر Gemini وارد نمایید.');
  }

  const baseModel = getResolvedGeminiModel(settings.model);
  const modelChain = [baseModel, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
  const uniqueModels = Array.from(new Set(modelChain));

  let lastError: any = null;

  for (let kIndex = 0; kIndex < keyPool.length; kIndex++) {
    const currentKey = keyPool[kIndex].key.trim();
    const ai = createGeminiClient(currentKey);

    for (let mIndex = 0; mIndex < uniqueModels.length; mIndex++) {
      const modelName = uniqueModels[mIndex];
      try {
        signal?.throwIfAborted();
        const response = await ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.2, // Low temperature for high consistency and factual precision
            responseMimeType: "application/json"
          }
        });

        signal?.throwIfAborted();
        if (response.text && response.text.trim().length > 0) {
          const parsed = parseGlossaryJsonResponse(response.text);
          return parsed;
        }
      } catch (err: any) {
        if (signal?.aborted) throw err;
        lastError = err;
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('429')) {
          console.warn(`[GlossaryExtract] Key rate limited (429), trying next key...`);
          break; // Switch to next key in keyPool
        }
        if (msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand') || msg.includes('unavailable')) {
          console.warn(`[GlossaryExtract] Model ${modelName} overloaded (503), switching to next model...`);
          await new Promise(r => setTimeout(r, 600));
          continue; // Try next model in chain
        }
        console.warn(`[GlossaryExtract] Model ${modelName} error:`, err);
      }
    }
  }

  throw lastError || new Error('خطا در استخراج و ترجمه واژگان تخصصی توسط مدل هوش مصنوعی.');
};

/**
 * Storage key helper for temporary per-file chunk extractions.
 */
const getTempStorageKey = (fileId: string) => `subai_glossary_temp_${fileId}`;
const getFinalStorageKey = (fileId: string) => `subai_glossary_final_${fileId}`;

/**
 * Saves temporary chunk results to localStorage so no progress is ever lost.
 */
export const saveTempChunkGlossary = (fileId: string, items: GlossaryItem[]) => {
  try {
    localStorage.setItem(getTempStorageKey(fileId), JSON.stringify({
      timestamp: Date.now(),
      items
    }));
  } catch (e) {
    console.warn('Could not save temp glossary to localStorage', e);
  }
};

/**
 * Loads temporary chunk results from localStorage if resuming.
 */
export const loadTempChunkGlossary = (fileId: string): GlossaryItem[] | null => {
  try {
    const raw = localStorage.getItem(getTempStorageKey(fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch (e) {
    return null;
  }
};

/**
 * Clears temporary chunk results for a file once extraction is finalized.
 */
export const clearTempChunkGlossary = (fileId: string) => {
  try {
    localStorage.removeItem(getTempStorageKey(fileId));
  } catch (e) {
    // Ignore
  }
};

/**
 * Saves the finalized consolidated glossary file for a subtitle.
 */
export const saveFinalFileGlossary = (fileId: string, items: GlossaryItem[]) => {
  try {
    localStorage.setItem(getFinalStorageKey(fileId), JSON.stringify({
      timestamp: Date.now(),
      items
    }));
  } catch (e) {
    console.warn('Could not save final glossary to localStorage', e);
  }
};

export const loadFinalFileGlossary = (fileId: string): GlossaryItem[] | null => {
  try {
    const raw = localStorage.getItem(getFinalStorageKey(fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch (e) {
    return null;
  }
};

/**
 * Orchestrator for the entire Automatic Glossary Extraction workflow:
 * 1. Convert subtitle to plain text.
 * 2. Split text into controlled chunks.
 * 3. Process each chunk sequentially via AI model with rate-limit and backoff protection.
 * 4. Save per-chunk temporary results.
 * 5. Consolidate, deduplicate, and enforce 1-to-1 uniform translations across the entire work.
 */
export const executeAutomaticGlossaryExtraction = async ({
  file,
  settings,
  onProgress,
  signal
}: {
  file: SubtitleFile;
  settings: AppSettings;
  onProgress?: (progress: GlossaryExtractionProgress, intermediateGlossary: GlossaryItem[]) => void;
  signal?: AbortSignal;
}): Promise<{
  plainText: string;
  chunks: ExtractionChunk[];
  unifiedGlossary: GlossaryItem[];
}> => {
  signal?.throwIfAborted();

  // Step 1: Convert subtitle to clean plain text
  const plainText = convertSubtitleToPlainText(file.blocks);
  if (!plainText.trim()) {
    throw new Error('متن زیرنویس خالی است یا دیالوگی برای استخراج واژگان یافت نشد.');
  }

  // Step 2: Split text into balanced chunks to control model pressure
  const chunks = chunkSubtitleForGlossary(file.blocks, 40);
  if (chunks.length === 0) {
    throw new Error('امکان تقسیم‌بندی متن زیرنویس وجود ندارد.');
  }

  // Step 3: Pre-flight provider validation
  const validation = validateGlossaryProviderReady(settings);
  if (!validation.ready) {
    throw new Error(validation.error);
  }

  const accumulatedRawItems: GlossaryItem[] = [];
  const chunkErrors: string[] = [];

  // Step 4: Sequential chunk extraction with temporary buffering
  for (let i = 0; i < chunks.length; i++) {
    signal?.throwIfAborted();
    const chunk = chunks[i];

    onProgress?.({
      currentChunk: chunk.chunkIndex,
      totalChunks: chunks.length,
      extractedCount: accumulatedRawItems.length,
      status: 'extracting'
    }, unifyAndDeduplicateGlossary(accumulatedRawItems, settings.glossary));

    try {
      const chunkItems = await extractGlossaryFromChunk(chunk, settings, undefined, signal);
      accumulatedRawItems.push(...chunkItems);

      // Save temporary chunk results progressive file
      saveTempChunkGlossary(file.id, accumulatedRawItems);

      // Intermediate progress reporting
      const currentUnified = unifyAndDeduplicateGlossary(accumulatedRawItems, settings.glossary);
      onProgress?.({
        currentChunk: chunk.chunkIndex,
        totalChunks: chunks.length,
        extractedCount: currentUnified.length,
        status: 'extracting'
      }, currentUnified);

      // Polite delay between chunks to keep API rate limits safe
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 450));
      }
    } catch (chunkErr: any) {
      if (signal?.aborted) throw chunkErr;
      const errorMsg = chunkErr?.message || String(chunkErr);
      chunkErrors.push(`چانک ${chunk.chunkIndex}: ${errorMsg}`);
      console.warn(`[GlossaryExtraction] Error on chunk ${chunk.chunkIndex}:`, chunkErr);
      
      // If the first chunk fails due to configuration or authentication, fail early
      if (i === 0 && (errorMsg.includes('کلید') || errorMsg.includes('API') || errorMsg.includes('اتصال') || errorMsg.includes('401') || errorMsg.includes('403'))) {
        throw new Error(errorMsg);
      }
    }
  }

  // If all chunks failed, throw an explicit actionable error instead of reporting false success
  if (accumulatedRawItems.length === 0) {
    if (chunkErrors.length > 0) {
      throw new Error(`ارتباط با مدل هوش مصنوعی با خطا مواجه شد و هیچ واژه‌ای دریافت نگردید. جزئیات: ${chunkErrors[0]}`);
    } else {
      throw new Error('مدل هوش مصنوعی هیچ اصطلاح تخصصی جدیدی در این فایل تشخیص نداد.');
    }
  }

  // Step 5: Unify, deduplicate, and enforce strict uniform translations
  const unifiedGlossary = unifyAndDeduplicateGlossary(accumulatedRawItems, settings.glossary);

  // Save final file-specific consolidated glossary
  saveFinalFileGlossary(file.id, unifiedGlossary);
  clearTempChunkGlossary(file.id);

  onProgress?.({
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    extractedCount: unifiedGlossary.length,
    status: 'completed'
  }, unifiedGlossary);

  return {
    plainText,
    chunks,
    unifiedGlossary
  };
};
