import { GoogleGenAI } from "@google/genai";
import { SubtitleBlock, SubtitleFile, AppSettings, FileSemanticContext, SectionTopicMemory } from "../types";
import { createGeminiClient, callLmStudioChat, callOpenAICompatibleChat, getActiveOpenAICompatibleService } from "./geminiService";
import { getResolvedGeminiModel } from "../constants";
import { correctPersianOrthography } from "./persianOrthography";

/**
 * Builds a clean, compact markdown transcript of the subtitle cues.
 * Used for feeding global context to the model on initial upload.
 */
export const generateCompactSubtitleTranscript = (blocks: SubtitleBlock[]): string => {
  if (!blocks || blocks.length === 0) return '';

  const totalCues = blocks.length;
  const firstBlock = blocks[0];
  const lastBlock = blocks[blocks.length - 1];

  let header = `# سند فیلم‌نامه و متن زیرنویس (Subtitle Transcript Document)\n`;
  header += `• تعداد کل قطعه‌های زیرنویس: ${totalCues} قطعه\n`;
  header += `• بازه زمانی کل: ${firstBlock.startTime} الی ${lastBlock.endTime}\n\n`;
  header += `## متن پیوسته دیالوگ‌ها و رویدادها (پیوست با ایندکس و زمان‌بندی):\n`;

  // If blocks <= 600, we include all cues directly.
  // For larger files, uniformly sample up to 600 cues across the entire timeline
  // for ultra-fast, low-latency script understanding.
  const maxCuesToInclude = 600;
  const selectedBlocks = blocks.length <= maxCuesToInclude
    ? blocks
    : sampleRepresentativeBlocks(blocks, maxCuesToInclude);

  const lines = selectedBlocks.map(b => {
    const cleanText = b.originalText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    return `[#${b.id} | ${b.startTime.slice(0, 8)}] ${cleanText}`;
  });

  return `${header}${lines.join('\n')}`;
};

/**
 * Heuristic fallback: generates logical narrative sections evenly distributed
 * when AI service is unavailable or in offline mode.
 */
export const createDefaultHeuristicContext = (blocks: SubtitleBlock[], fileName: string): FileSemanticContext => {
  const total = blocks.length;
  const numSections = Math.min(8, Math.max(3, Math.ceil(total / 60)));
  const chunkSize = Math.ceil(total / numSections);
  const sections: SectionTopicMemory[] = [];

  for (let s = 0; s < numSections; s++) {
    const startIdx = s * chunkSize;
    const endIdx = Math.min(total - 1, (s + 1) * chunkSize - 1);
    if (startIdx >= total) break;

    const startB = blocks[startIdx];
    const endB = blocks[endIdx];

    sections.push({
      id: `sec-${s + 1}`,
      startBlockId: startB.id,
      endBlockId: endB.id,
      timeRange: `${startB.startTime.slice(0, 8)} الی ${endB.endTime.slice(0, 8)}`,
      topicSummary: `بخش ${s + 1} از رویدادها و دیالوگ‌های فایل «${fileName}» (بازه بلوک‌های ${startB.id} تا ${endB.id})`,
      toneOrKeyTerms: 'لحن طبیعی، هماهنگ با دیالوگ‌های صحنه و جریان اصلی اثر'
    });
  }

  return {
    overallSummary: `متن و دیالوگ‌های ویدیوی «${fileName}» شامل ${total} بلوک زیرنویس با مضمون محاوره‌ای و پیوسته.`,
    detectedGenre: 'عمومی / گفتگو و روایت',
    detectedTone: 'محاوره‌ای طبیعی، روان و زنده',
    mainCharacters: [],
    suggestedTerminology: [],
    sections,
    generatedAt: new Date().toISOString()
  };
};

/**
 * Selectively samples blocks across the timeline when subtitle is extremely long (>1200 cues)
 * to keep response latency fast while ensuring complete coverage of all scenes.
 */
const sampleRepresentativeBlocks = (blocks: SubtitleBlock[], maxCount: number): SubtitleBlock[] => {
  if (blocks.length <= maxCount) return blocks;
  const step = blocks.length / maxCount;
  const sampled: SubtitleBlock[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.min(blocks.length - 1, Math.floor(i * step));
    sampled.push(blocks[idx]);
  }
  return sampled;
};

/**
 * Executes the deep global understanding pass.
 * Converts the file to Markdown transcript, sends it to the AI, and structures
 * the narrative summary, genre, tone, and scene-by-scene topic memory sections.
 */
export const analyzeGlobalSubtitleContext = async (
  file: SubtitleFile,
  settings: AppSettings,
  apiKey?: string,
  signal?: AbortSignal
): Promise<FileSemanticContext> => {
  const blocks = file.blocks;
  if (!blocks || blocks.length === 0) {
    return createDefaultHeuristicContext([], file.name);
  }

  const transcript = generateCompactSubtitleTranscript(blocks);
  const totalBlocks = blocks.length;

  const systemInstruction = `You are a master script supervisor, cinematic translator, and localization director.
Your mission is to perform a comprehensive, holistic semantic analysis of an entire subtitle transcript.
You must analyze the narrative flow, theme, characters, genre, and scene structure to prepare a continuous memory blueprint for translation.

You MUST respond strictly in valid JSON format matching this schema:
{
  "overallSummary": "A concise 2-4 sentence summary in Persian capturing the core subject, plot, or purpose of this entire video/movie/podcast.",
  "detectedGenre": "Detected genre in Persian (e.g. درام معمایی، کمدی، علمی-آموزشی، جنایی، مستند طبیعت، مصاحبه و...)",
  "detectedTone": "Recommended Persian translation tone and register (e.g. عامیانه تند و کنایی، محاوره‌ای صمیمی، رسمی دانشگاهی و...)",
  "mainCharacters": ["List of main characters or speakers identified with gender/role if detectable"],
  "suggestedTerminology": [
    {"term": "Original recurring term or slang", "suggestedPersian": "معادل فارسی اصیل، جذاب و خوش‌نشین"}
  ],
  "sections": [
    {
      "id": "sec-1",
      "startBlockId": number,
      "endBlockId": number,
      "timeRange": "HH:MM:SS to HH:MM:SS",
      "topicSummary": "A 1-2 sentence Persian description of what happens in this scene, the current speaker intent, and emotional state.",
      "toneOrKeyTerms": "Specific register or keywords for this scene (e.g. متلک‌گویی دوستانه، اصطلاحات حقوقی، عصبانیت و تنش)"
    }
  ]
}

CRITICAL RULES:
1. Divide the entire subtitle into between 4 and 10 chronological, contiguous sections that cover ALL block IDs from start (${blocks[0].id}) to finish (${blocks[totalBlocks - 1].id}) without gaps.
2. The summary and section topics MUST be written in natural, fluent Persian with correct Persian orthography (فرهنگستان).
3. Identify cultural context and character relationships so the translator never uses awkward or robotic literal phrasing.
4. Return ONLY the raw JSON object. No markdown backticks, no explanatory chat.`;

  const userPrompt = `Here is the full subtitle transcript for the file "${file.name}":

${transcript}

Analyze this transcript now and return the comprehensive JSON semantic context blueprint.`;

  try {
    signal?.throwIfAborted();

    if (settings.aiProvider === 'lm_studio') {
      const rawText = await callLmStudioChat(settings, systemInstruction, userPrompt, signal);
      const parsed = parseSemanticJsonResponse(rawText, blocks, file.name);
      return parsed;
    }

    if (settings.aiProvider === 'openai_compatible') {
      const service = getActiveOpenAICompatibleService(settings);
      signal?.throwIfAborted();
      const rawText = await callOpenAICompatibleChat(service, 0.3, systemInstruction, userPrompt, signal);
      const parsed = parseSemanticJsonResponse(rawText, blocks, file.name);
      return parsed;
    }

    // Default: Gemini
    const availableKeys = settings.apiKeys.filter(k => k.isValid !== false && !k.isRateLimited && k.key.trim().length > 0);
    const keyPool = apiKey
      ? [{ key: apiKey.trim(), isRateLimited: false }]
      : (availableKeys.length > 0 ? availableKeys : settings.apiKeys.filter(k => k.key && k.key.trim().length > 0));

    if (keyPool.length === 0) {
      console.warn('[SemanticContext] No Gemini API key available; using heuristic context.');
      return createDefaultHeuristicContext(blocks, file.name);
    }

    const baseModel = getResolvedGeminiModel(settings.model);
    const modelChain = [baseModel, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
    const uniqueModels = Array.from(new Set(modelChain));

    let lastError: any = null;

    // Loop through keys and models with intelligent backoff
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
              temperature: 0.25,
              responseMimeType: "application/json"
            }
          });

          signal?.throwIfAborted();
          if (response.text && response.text.trim().length > 0) {
            const parsed = parseSemanticJsonResponse(response.text, blocks, file.name);
            return parsed;
          }
        } catch (err: any) {
          if (signal?.aborted) throw err;
          lastError = err;
          const msg = (err?.message || '').toLowerCase();
          if (msg.includes('429')) {
            console.warn(`[SemanticContext] Key ...${currentKey.slice(-4)} rate limited (429), trying next key...`);
            break; // Try next key
          }
          if (msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand') || msg.includes('unavailable')) {
            console.warn(`[SemanticContext] Model ${modelName} overloaded (503), switching to next model...`);
            await new Promise(r => setTimeout(r, 600));
            continue; // Try next model
          }
          console.warn(`[SemanticContext] Model ${modelName} error:`, err);
        }
      }
    }

    console.warn('[SemanticContext] AI model analysis could not complete after trying available keys/models. Falling back to guaranteed intelligent heuristic memory:', lastError);
    return createDefaultHeuristicContext(blocks, file.name);
  } catch (error: any) {
    if (signal?.aborted) throw error;
    console.warn('[SemanticContext] AI analysis failed, falling back to heuristic outline:', error);
    return createDefaultHeuristicContext(blocks, file.name);
  }
};

/**
 * Parses and sanitizes JSON model response, ensuring every section has valid block IDs and Persian orthography.
 */
const parseSemanticJsonResponse = (
  rawText: string,
  blocks: SubtitleBlock[],
  fileName: string
): FileSemanticContext => {
  try {
    const cleaned = rawText
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No JSON object found in response');
    }

    const jsonString = cleaned.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString);

    const overallSummary = correctPersianOrthography(parsed.overallSummary || `موضوع کلی فایل «${fileName}»`);
    const detectedGenre = correctPersianOrthography(parsed.detectedGenre || 'عمومی');
    const detectedTone = correctPersianOrthography(parsed.detectedTone || 'طبیعی و محاوره‌ای');
    const mainCharacters: string[] = Array.isArray(parsed.mainCharacters)
      ? parsed.mainCharacters.map((c: any) => String(c).trim()).filter(Boolean)
      : [];

    const suggestedTerminology: Array<{ term: string; suggestedPersian: string }> = Array.isArray(parsed.suggestedTerminology)
      ? parsed.suggestedTerminology.map((item: any) => ({
          term: String(item.term || '').trim(),
          suggestedPersian: correctPersianOrthography(String(item.suggestedPersian || '').trim())
        })).filter(t => t.term && t.suggestedPersian)
      : [];

    let sections: SectionTopicMemory[] = [];
    if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      sections = parsed.sections.map((s: any, idx: number) => ({
        id: s.id || `sec-${idx + 1}`,
        startBlockId: Number(s.startBlockId) || (idx === 0 ? blocks[0]?.id || 1 : 1),
        endBlockId: Number(s.endBlockId) || blocks[blocks.length - 1]?.id || blocks.length,
        timeRange: String(s.timeRange || '').trim(),
        topicSummary: correctPersianOrthography(String(s.topicSummary || '').trim() || `رویدادهای بخش ${idx + 1}`),
        charactersInvolved: Array.isArray(s.charactersInvolved) ? s.charactersInvolved.map(String) : undefined,
        toneOrKeyTerms: s.toneOrKeyTerms ? correctPersianOrthography(String(s.toneOrKeyTerms).trim()) : undefined
      }));
    } else {
      sections = createDefaultHeuristicContext(blocks, fileName).sections;
    }

    return {
      overallSummary,
      detectedGenre,
      detectedTone,
      mainCharacters,
      suggestedTerminology,
      sections,
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn('[SemanticContext] JSON parse error, using heuristic context:', err);
    return createDefaultHeuristicContext(blocks, fileName);
  }
};

/**
 * Finds the matching narrative section for the currently translating batch of blocks.
 */
export const getRelevantSectionContext = (
  semanticContext: FileSemanticContext | undefined,
  targetBlockIds: number[]
): { overallSummary: string; sectionSummary?: string; toneGuidance?: string; keyTerms?: string } | null => {
  if (!semanticContext || targetBlockIds.length === 0) return null;

  const minId = Math.min(...targetBlockIds);
  const maxId = Math.max(...targetBlockIds);

  // Find section that covers this block range
  const matchedSection = semanticContext.sections.find(
    s => (minId >= s.startBlockId && minId <= s.endBlockId) ||
         (maxId >= s.startBlockId && maxId <= s.endBlockId) ||
         (minId <= s.startBlockId && maxId >= s.endBlockId)
  );

  return {
    overallSummary: semanticContext.overallSummary,
    sectionSummary: matchedSection?.topicSummary,
    toneGuidance: matchedSection?.toneOrKeyTerms || semanticContext.detectedTone,
    keyTerms: semanticContext.suggestedTerminology && semanticContext.suggestedTerminology.length > 0
      ? semanticContext.suggestedTerminology.slice(0, 5).map(t => `${t.term} -> ${t.suggestedPersian}`).join(' | ')
      : undefined
  };
};

/**
 * Formats the extracted semantic context into a concise, high-priority guidance block
 * for injection into the model's user prompt across all translation methods.
 */
export const formatSemanticContextForPrompt = (
  context: ReturnType<typeof getRelevantSectionContext>
): string => {
  if (!context) return '';

  const lines: string[] = ['--- پیوستگی زمینه معنایی و موضوعی اثر (GLOBAL & SCENE CONTEXT MEMORY) ---'];
  if (context.overallSummary) {
    lines.push(`• خلاصه و موضوع کلی اثر: ${context.overallSummary}`);
  }
  if (context.sectionSummary) {
    lines.push(`• موضوع و بستر روایی این صحنه/بخش: ${context.sectionSummary}`);
  }
  if (context.toneGuidance) {
    lines.push(`• لحن و ثبت زبانی پیشنهادی این صحنه: ${context.toneGuidance}`);
  }
  if (context.keyTerms) {
    lines.push(`• واژگان و اصطلاحات کلیدی مرتبط: ${context.keyTerms}`);
  }
  lines.push(`• راهنمای وایب انسانی: ترجمه باید دارای وایب کاملاً زنده، انسانی و متناسب با گفتار طبیعی فارسی باشد؛ از ترجمه تحت‌اللفظی یا ساختارهای ماشینی اکیداً بپرهیزید.`);

  return lines.join('\n');
};
