
import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { BatchRequest, BatchResponse, AppSettings, UserAPIKey, TargetLanguage, OpenAICompatibleService, TranslationDiagnostic, GlossaryItem, AIProvider, GeminiFlashModelCache, DiscoveredGeminiModel } from "../types";
import { APP_CONFIG, DEFAULT_GEMINI_MODEL, getResolvedGeminiModel, getSystemInstruction, getCoreSystemInstruction, getDynamicSystemInstruction, LANGUAGE_PROMPTS, GEMINI_CONTEXT_PRE_WINDOW, GEMINI_CONTEXT_POST_WINDOW, getGeminiTemperature, GEMINI_FLASH_DISCOVERY_CACHE_KEY, GEMINI_FLASH_DISCOVERY_CACHE_TTL_MS, MAX_MODEL_FALLBACK_SWITCHES, DEFAULT_FLASH_FALLBACK_CHAIN, getCachedGeminiFlashModels, getGeminiFallbackChain } from "../constants";
import { SKELETON_STR_PERSIAN_ORTHOGRAPHY_INSTRUCTION } from "./methods/skeleton_str";
import { getSubtitleTranslatorSystemInstruction } from "./methods/subtitle_translator_strategy";
import { filterBatchWithMemory, addBatchToMemory } from "./translationMemory";
import { getStandardLimits, checkCueStandardCompliance, SubtitleComplianceIssue, estimateTranslationQuality, LightweightQualityDiagnostic } from "./subtitleUtils";

interface GeminiCacheEntry {
  cacheName: string;
  expiresAt: number;
}

const geminiContextCacheMap = new Map<string, GeminiCacheEntry>();
const geminiCacheUnsupportedKeys = new Set<string>();

/**
 * Creates an authorized GoogleGenAI client instance configured according to
 * official @google/genai and gemini-skills standards, including the required
 * telemetry User-Agent header 'aistudio-build'.
 */
export const createGeminiClient = (apiKey: string): GoogleGenAI => {
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

/**
 * Session blacklist for models that return 503 / overloaded / UNAVAILABLE / high demand.
 * This prevents the engine from repeatedly hitting congested models during the current user session.
 */
const sessionBlacklistedModels = new Set<string>();
let lastFallbackTracking: { triedModels: string[]; lastSwitchedAt: number } | null = null;

export const blacklistModelInSession = (modelName: string): void => {
  sessionBlacklistedModels.add(modelName);
  console.warn(`[Gemini Session Blacklist] Model "${modelName}" temporarily blacklisted for this session due to 503 / overload.`);
};

export const isModelBlacklistedInSession = (modelName: string): boolean => {
  return sessionBlacklistedModels.has(modelName);
};

export const clearSessionBlacklistedModels = (): void => {
  sessionBlacklistedModels.clear();
  lastFallbackTracking = null;
};

export const getActiveGeminiFallbackChain = (initialModel: string): string[] => {
  const chain = getGeminiFallbackChain(initialModel, Array.from(sessionBlacklistedModels));
  return chain.length > 0 ? chain : getGeminiFallbackChain(initialModel, []);
};

export const isModelOverloadedError = (errMessage: string): boolean => {
  const lower = (errMessage || '').toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('overloaded') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('high_demand') ||
    lower.includes('experiencing high demand') ||
    lower.includes('service unavailable')
  );
};

export const notifyModelFallback = (fromModel: string, toModel: string, reason: string, switchCount: number): void => {
  if (!lastFallbackTracking) {
    lastFallbackTracking = { triedModels: [fromModel], lastSwitchedAt: Date.now() };
  }
  if (!lastFallbackTracking.triedModels.includes(toModel)) {
    lastFallbackTracking.triedModels.push(toModel);
  }
  lastFallbackTracking.lastSwitchedAt = Date.now();

  const userMsg = `⚠️ مدل ${fromModel} با خطای ترافیک بالا (۵۰۳) روبرو شد. سوییچ خودکار به مدل پایدارتر ${toModel} (سوییچ ${switchCount} از ${MAX_MODEL_FALLBACK_SWITCHES})...`;
  console.warn(`[Gemini Auto-Fallback] ${userMsg}`);

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('submaster_model_fallback', {
        detail: { fromModel, toModel, reason, switchCount, message: userMsg }
      }));
    } catch {
      // ignore
    }
  }
};

export const getLastModelFallbackInfo = () => lastFallbackTracking;

/**
 * Checks if an error or signal represents an intentional abort/cancellation operation.
 */
export const isAbortError = (error: any, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true;
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  const msg = String(error.message || error.details || error).toLowerCase();
  return msg.includes('aborted') || msg.includes('abort') || msg.includes('canceled') || msg.includes('cancelled');
};

/**
 * Dynamically queries Google Gemini API models endpoint to discover the latest available Flash models.
 * Filters for models supporting 'generateContent' and prioritizes lightweight 'flash-lite' and stable
 * '*-flash' models over preview/experimental variants. Excludes pro, image, audio, tts, live, and robotics.
 */
export const discoverAvailableGeminiFlashModels = async (apiKey: string): Promise<string[]> => {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return getCachedGeminiFlashModels();
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Gemini Discovery] Models endpoint returned status ${response.status}: ${response.statusText}`);
      return getCachedGeminiFlashModels();
    }

    const data = await response.json();
    const rawList: any[] = data.models || [];

    if (!Array.isArray(rawList) || rawList.length === 0) {
      console.warn('[Gemini Discovery] Empty or invalid models list returned.');
      return getCachedGeminiFlashModels();
    }

    const excludedKeywords = ['pro', 'image', 'tts', 'live', 'embed', 'robotics', 'audio', 'omni', 'transcribe'];

    const candidates = rawList.filter((m: any) => {
      if (!m || typeof m.name !== 'string') return false;
      const cleanName = m.name.replace(/^models\//, '').toLowerCase();

      const methods: string[] = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      if (!methods.includes('generateContent')) return false;

      if (!cleanName.includes('flash')) return false;

      // Filter out deprecated model generations that return 404 for new users
      if (cleanName.includes('2.5') || cleanName.includes('2.0') || cleanName.includes('1.5')) return false;

      if (excludedKeywords.some(kw => cleanName.includes(kw))) return false;

      return true;
    }).map((m: any) => m.name.replace(/^models\//, ''));

    if (candidates.length === 0) {
      console.warn('[Gemini Discovery] No matching flash candidates after filtering.');
      return getCachedGeminiFlashModels();
    }

    // Ranking algorithm prioritizing official models from gemini-skills repo:
    // 1. gemini-3.8-flash (official standard default for text tasks)
    // 2. gemini-flash-latest (official alias)
    // 3. gemini-3.1-flash-lite (official lite alias)
    // 4. other stable flash models
    const rankModel = (name: string): number => {
      const lower = name.toLowerCase();
      if (lower === 'gemini-3.8-flash') return 2500;
      if (lower === 'gemini-flash-latest') return 2200;
      if (lower === 'gemini-3.1-flash-lite') return 2000;
      const isLite = lower.includes('flash-lite') || lower.includes('flashlite');
      const isPreview = lower.includes('preview') || lower.includes('experimental') || lower.includes('exp');

      const verMatch = lower.match(/(\d+(?:\.\d+)?)/);
      const ver = verMatch ? parseFloat(verMatch[1]) : (lower.includes('latest') ? 99 : 0);

      let base = 100;
      if (!isPreview && !isLite) {
        base = 1200;
      } else if (isLite) {
        base = isPreview ? 800 : 1000;
      }
      return base + ver;
    };

    candidates.sort((a, b) => rankModel(b) - rankModel(a));

    const topModels = Array.from(new Set(candidates)).slice(0, 10);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cachePayload: GeminiFlashModelCache = {
          models: topModels,
          timestamp: Date.now(),
        };
        window.localStorage.setItem(GEMINI_FLASH_DISCOVERY_CACHE_KEY, JSON.stringify(cachePayload));
      } catch (storageErr) {
        console.warn('[Gemini Discovery] Failed to cache models to localStorage:', storageErr);
      }
    }

    console.info('[Gemini Discovery] Successfully discovered and cached top Flash models:', topModels);
    return topModels;
  } catch (error: any) {
    console.warn('[Gemini Discovery] Error querying models endpoint:', error?.message || error);
    return getCachedGeminiFlashModels();
  }
};

/**
 * Ensures fresh Gemini Flash models are available. If cache is expired (>6 hours)
 * or missing, queries the discovery endpoint using the provided API key.
 */
export const ensureFreshGeminiFlashModels = async (apiKey?: string): Promise<string[]> => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(GEMINI_FLASH_DISCOVERY_CACHE_KEY);
      if (raw) {
        const parsed: GeminiFlashModelCache = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.models) && parsed.models.length > 0) {
          const age = Date.now() - (parsed.timestamp || 0);
          if (age < GEMINI_FLASH_DISCOVERY_CACHE_TTL_MS) {
            return parsed.models;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (apiKey && apiKey.trim().length > 0) {
    try {
      const discovered = await discoverAvailableGeminiFlashModels(apiKey);
      if (discovered && discovered.length > 0) {
        return discovered;
      }
    } catch {
      // ignore
    }
  }

  return getCachedGeminiFlashModels();
};

/**
 * Attempts to retrieve or establish a Gemini Context Cache for the invariant core system instruction.
 * If the current key/model/tier does not support caching, returns null without throwing,
 * allowing instant and graceful fallback to the compact system instruction.
 */
const getOrEstablishGeminiCache = async (
  ai: GoogleGenAI,
  modelName: string,
  apiKey: string,
  coreInstruction: string,
  signal?: AbortSignal
): Promise<string | null> => {
  const cacheKey = `${modelName}_${apiKey.slice(-6)}_${coreInstruction.length}`;

  if (geminiCacheUnsupportedKeys.has(cacheKey)) {
    return null;
  }

  const existing = geminiContextCacheMap.get(cacheKey);
  if (existing && existing.expiresAt > Date.now() + 60000) {
    return existing.cacheName;
  }

  try {
    signal?.throwIfAborted();
    const cacheResult = await ai.caches.create({
      model: modelName,
      config: {
        displayName: 'submaster_core_cache',
        systemInstruction: coreInstruction,
        ttl: '3600s',
      },
    });

    if (cacheResult && cacheResult.name) {
      geminiContextCacheMap.set(cacheKey, {
        cacheName: cacheResult.name,
        expiresAt: Date.now() + 3500 * 1000,
      });
      return cacheResult.name;
    }
    return null;
  } catch {
    geminiCacheUnsupportedKeys.add(cacheKey);
    return null;
  }
};

const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.INTEGER, description: "The exact ID from the input block" },
      translatedText: { type: Type.STRING, description: "The translation text in the configured target language" }
    },
    required: ["id", "translatedText"],
    propertyOrdering: ["id", "translatedText"]
  }
};

const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeOpenAIBaseUrl = (baseUrl: string, fallback = 'http://localhost:1234/v1'): string => {
  const trimmed = (baseUrl || fallback).trim().replace(/\/+$/, '');
  // LM Studio's field is a server base URL. Strip a pasted Chat Completions
  // endpoint so switching providers can never produce .../chat/completions/v1.
  const withoutEndpoint = trimmed.replace(/\/chat\/completions$/i, '');
  return withoutEndpoint.endsWith('/v1') ? withoutEndpoint : `${withoutEndpoint}/v1`;
};

const resolveOpenAIChatCompletionsUrl = (baseUrl: string): string => {
  const trimmed = (baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${normalizeOpenAIBaseUrl(trimmed, 'https://api.openai.com/v1')}/chat/completions`;
};

const isOpenRouterService = (service: Pick<OpenAICompatibleService, 'baseUrl' | 'name'>): boolean => (
  service.baseUrl.toLowerCase().includes('openrouter.ai') || service.name.toLowerCase().includes('openrouter')
);

const normalizeOpenAICompatibleModel = (service: OpenAICompatibleService): string => {
  const model = service.model.trim();
  if (!model || !isOpenRouterService(service) || model.includes('/')) return model;

  if (/^gpt-|^o[134](?:-|$)/i.test(model)) return `openai/${model}`;
  if (/^gemini-/i.test(model)) return `google/${model}`;
  if (/^claude-/i.test(model)) return `anthropic/${model}`;
  if (/^llama/i.test(model)) return `meta-llama/${model}`;
  if (/^mistral/i.test(model)) return `mistralai/${model}`;

  return model;
};

const buildOpenAICompatibleHeaders = (service: OpenAICompatibleService): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  const apiKey = service.apiKey.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  if (isOpenRouterService(service)) {
    const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    headers['HTTP-Referer'] = appOrigin;
    headers['X-OpenRouter-Title'] = 'SubMaster Pro';
  }

  return headers;
};

const normalizeLmStudioBaseUrl = (baseUrl: string): string => normalizeOpenAIBaseUrl(baseUrl);

const isFreeProvider = (provider: AppSettings['aiProvider']): provider is 'gtx' | 'edge' | 'deeplx' => (
  provider === 'gtx' || provider === 'edge' || provider === 'deeplx'
);

const getFreeProviderName = (provider: AppSettings['aiProvider']): string => ({
  gtx: 'GTX API (Free)', edge: 'Edge API (Free)', deeplx: 'DeepLX (Free)'
}[provider] || provider);

const translateWithFreeProvider = async (text: string, settings: AppSettings, signal?: AbortSignal): Promise<string> => {
  const target = settings.targetLanguage;
  if (settings.aiProvider === 'gtx') {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.search = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: text }).toString();
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`GTX ${response.status}: ${await response.text()}`);
    const data = await response.json() as Array<Array<[string]>>;
    return (data[0] || []).map(part => part[0]).join('').trim();
  }
  if (settings.aiProvider === 'edge') {
    // Microsoft Edge obtains a short-lived translator token itself; acquiring
    // it here keeps this provider keyless while using its public web API.
    const tokenResponse = await fetch('https://edge.microsoft.com/translate/auth', { signal });
    if (!tokenResponse.ok) throw new Error(`Edge auth ${tokenResponse.status}: ${await tokenResponse.text()}`);
    const token = (await tokenResponse.text()).trim();
    const url = new URL('https://api-edge.cognitive.microsofttranslator.com/translate');
    url.search = new URLSearchParams({ 'api-version': '3.0', to: target }).toString();
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-ClientTraceId': crypto.randomUUID() }, body: JSON.stringify([{ Text: text }]), signal });
    if (!response.ok) throw new Error(`Edge ${response.status}: ${await response.text()}`);
    const data = await response.json() as Array<{ translations?: Array<{ text?: string }> }>;
    return data[0]?.translations?.[0]?.text?.trim() || '';
  }
  // DeepLX deliberately uses its public endpoint and does not require a user API key.
  const response = await fetch('https://api.deeplx.org/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, source_lang: 'auto', target_lang: target.toUpperCase() }), signal });
  if (!response.ok) throw new Error(`DeepLX ${response.status}: ${await response.text()}`);
  const data = await response.json() as { data?: string; translations?: Array<{ text?: string }> };
  return data.data?.trim() || data.translations?.[0]?.text?.trim() || '';
};

const stripSubtitleTimingHint = (value: string): string => value
  .replace(/^\s*\{\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*--?>\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\}\s*/, '')
  .trim();

const translateTaggedPayloadWithFreeProvider = async (content: string, settings: AppSettings, signal?: AbortSignal): Promise<string> => {
  const tags = [...content.matchAll(/\[TRANSLATE_(\d+)\]([\s\S]*?)\[\/TRANSLATE_\1\]/g)];
  const translated = await Promise.all(tags.map(async ([, id, source]) => {
    const text = await translateWithFreeProvider(stripSubtitleTimingHint(source), settings, signal);
    return `[TRANSLATE_${id}]${text}[/TRANSLATE_${id}]`;
  }));
  return translated.join('\n');
};

const extractJsonArray = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    if (withoutFence.startsWith('[')) return withoutFence;
  }
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
};

const RAW_MARKER_PATTERN = /⟦\d+⟧/;
const MARKDOWN_OR_EXPLANATION_PATTERN = /(```|^#+\s|^\s*[-*]\s|ترجمه(?:\s*:| زیر)|translation\s*:|note\s*:|explanation\s*:)/im;
const validateBatchResponse = (targetIds: number[], response: unknown): BatchResponse[] => {
  if (!Array.isArray(response)) {
    throw new Error('Invalid model response: expected a JSON array.');
  }

  const expectedIds = new Set(targetIds);
  const seenIds = new Set<number>();
  const errors: string[] = [];
  const validated: BatchResponse[] = [];

  response.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`item ${index + 1} is not an object`);
      return;
    }

    const id = Number((item as Partial<BatchResponse>).id);
    const translatedText = (item as Partial<BatchResponse>).translatedText;

    if (!Number.isInteger(id)) {
      errors.push(`item ${index + 1} has an invalid id`);
      return;
    }
    if (!expectedIds.has(id)) errors.push(`unexpected id ${id}`);
    if (seenIds.has(id)) errors.push(`duplicate id ${id}`);
    seenIds.add(id);

    if (typeof translatedText !== 'string' || translatedText.trim() === '') {
      errors.push(`id ${id} has empty translatedText`);
      return;
    }

    const cleanText = translatedText.trim();
    if (RAW_MARKER_PATTERN.test(cleanText)) errors.push(`id ${id} contains a raw subtitle marker`);
    if (MARKDOWN_OR_EXPLANATION_PATTERN.test(cleanText)) errors.push(`id ${id} contains markdown or explanatory text`);

    validated.push({ id, translatedText: cleanText });
  });

  for (let index = 1; index < validated.length; index++) {
    const previous = validated[index - 1].translatedText.replace(/\s+/g, ' ').trim();
    const current = validated[index].translatedText.replace(/\s+/g, ' ').trim();
    if (previous && current && previous === current && previous.length > 12) {
      errors.push(`ids ${validated[index - 1].id} and ${validated[index].id} contain repeated translations`);
    }
  }

  targetBatchLengthCheck: for (const item of validated) {
    const source = targetIds.includes(item.id) ? item : null;
    if (!source) break targetBatchLengthCheck;
    const readableChars = countReadableChars(item.translatedText);
    if (readableChars > 500) errors.push(`id ${item.id} is too long for a subtitle cue`);
  }

  const missingIds = targetIds.filter(id => !seenIds.has(id));
  if (missingIds.length > 0) errors.push(`missing ids: ${missingIds.join(', ')}`);
  if (response.length !== targetIds.length) errors.push(`response count ${response.length} does not match target count ${targetIds.length}`);

  if (errors.length > 0) {
    throw new Error(`Invalid model response: ${errors.slice(0, 6).join('; ')}`);
  }

  return validated.sort((a, b) => targetIds.indexOf(a.id) - targetIds.indexOf(b.id));
};

const countReadableChars = (text: string): number => text.replace(/[\r\n]+/g, '').length;

export interface SelectiveValidationResult {
  validResponses: BatchResponse[];
  problematicIds: number[];
  reasons: string[];
}

/**
 * Evaluates model output per-cue rather than all-or-nothing.
 * Identifies successfully translated cues vs problematic cues (missing, duplicate,
 * repeated translation, excessive length, markdown, empty).
 * Powers selective retry for Gemini to slash token consumption.
 */
const validateSelectiveBatchResponse = (
  targetBatch: BatchRequest[],
  response: unknown
): SelectiveValidationResult => {
  const targetIds = targetBatch.map(b => b.id);
  const expectedIds = new Set(targetIds);
  const seenIds = new Set<number>();
  const duplicateIds = new Set<number>();
  const validMap = new Map<number, string>();
  const reasons: string[] = [];

  if (!Array.isArray(response)) {
    return {
      validResponses: [],
      problematicIds: targetIds,
      reasons: ['Expected a JSON array from model']
    };
  }

  for (let index = 0; index < response.length; index++) {
    const item = response[index];
    if (!item || typeof item !== 'object') {
      reasons.push(`item ${index + 1} is not an object`);
      continue;
    }

    const id = Number((item as Partial<BatchResponse>).id);
    const translatedText = (item as Partial<BatchResponse>).translatedText;

    if (!Number.isInteger(id) || !expectedIds.has(id)) {
      continue;
    }

    if (seenIds.has(id)) {
      duplicateIds.add(id);
      reasons.push(`duplicate id ${id}`);
      continue;
    }
    seenIds.add(id);

    if (typeof translatedText !== 'string' || translatedText.trim() === '') {
      reasons.push(`id ${id} has empty translatedText`);
      continue;
    }

    const cleanText = translatedText.trim();
    if (RAW_MARKER_PATTERN.test(cleanText)) {
      reasons.push(`id ${id} contains raw subtitle marker`);
      continue;
    }

    if (MARKDOWN_OR_EXPLANATION_PATTERN.test(cleanText)) {
      reasons.push(`id ${id} contains markdown or explanatory text`);
      continue;
    }

    if (countReadableChars(cleanText) > 500) {
      reasons.push(`id ${id} is too long (>500 chars)`);
      continue;
    }

    validMap.set(id, cleanText);
  }

  // Invalidate any IDs that appeared multiple times
  for (const dupId of duplicateIds) {
    validMap.delete(dupId);
  }

  // Check for adjacent repeated translations (> 12 chars)
  for (let i = 1; i < targetBatch.length; i++) {
    const prevId = targetBatch[i - 1].id;
    const currId = targetBatch[i].id;
    const prevText = validMap.get(prevId)?.replace(/\s+/g, ' ').trim();
    const currText = validMap.get(currId)?.replace(/\s+/g, ' ').trim();

    if (prevText && currText && prevText === currText && prevText.length > 12) {
      validMap.delete(currId);
      reasons.push(`ids ${prevId} and ${currId} contain repeated translations`);
    }
  }

  const validResponses: BatchResponse[] = [];
  const problematicIds: number[] = [];

  for (const block of targetBatch) {
    if (validMap.has(block.id)) {
      validResponses.push({ id: block.id, translatedText: validMap.get(block.id)! });
    } else {
      problematicIds.push(block.id);
    }
  }

  return {
    validResponses,
    problematicIds,
    reasons
  };
};

const toSelectedRetranslationItems = (blocks: BatchRequest[]): string => (
  blocks.map(block => `⟦id=${block.id}⟧
Original: ${block.text.replace(/\s+/g, ' ').trim()}
Previous Persian: ${block.previousTranslatedText?.trim() || 'N/A'}
Problem hint: ${block.problemHint || 'user-selected for retranslation'}`).join('\n\n')
);

const buildSelectedRetranslationPrompt = (
  targetBatch: BatchRequest[],
  contextPre: BatchRequest[],
  contextPost: BatchRequest[]
): string => `--- SELECTED SUBTITLE RETRANSLATION PROTOCOL ---
These subtitle blocks were already translated, but the user rejected their quality and selected them for retranslation.

PAST CONTEXT (reference only; do not return these IDs):
${contextPre.length ? toMarkedSubtitleParagraph(contextPre) : 'N/A'}

MANDATORY REVIEW: Before generating translations, you MUST review PAST CONTEXT to actively lock onto previously established character names, pronouns, gender markers, and key terminology. Prefer previously used translations when they appear in PAST CONTEXT.

TARGET BLOCKS TO RETRANSLATE:
${toSelectedRetranslationItems(targetBatch)}

FUTURE CONTEXT (reference only; do not return these IDs):
${contextPost.length ? toMarkedSubtitleParagraph(contextPost) : 'N/A'}

MANDATORY LOOK-AHEAD: Use FUTURE CONTEXT to resolve ambiguities in TARGET BLOCKS (e.g. unknown pronouns, split sentences).

Retranslation goals:
- Use Previous Persian only as a reference; freely improve it when it is incomplete, awkward, inconsistent, too literal, or machine-like.
- Preserve meaning, speaker intent, tone, and continuity with surrounding subtitles.
- Return ONLY the target IDs listed above, every target ID exactly once.
- Keep the result concise and subtitle-friendly: max 2 lines, no markdown, no explanations, no raw markers.

Return ONLY a valid JSON array: [{"id": number, "translatedText": "..."}].`;

/**
 * Lightweight refinement pass for Gemini:
 * Selectively refines only the suspicious cues that violate subtitle standard constraints
 * (line length exceeding CPL limit or reading speed exceeding CPS limit).
 * Sends a minimal-token payload without re-transmitting preceding/following contexts.
 */
const refineProblematicCuesForStandards = async (
  ai: GoogleGenAI,
  modelName: string,
  problematicCues: SubtitleComplianceIssue[],
  settings: AppSettings,
  signal?: AbortSignal
): Promise<Map<number, string>> => {
  const result = new Map<number, string>();
  if (problematicCues.length === 0) return result;

  const { cplLimit, cpsLimit } = getStandardLimits(settings.outputStandard);
  const standardName = (settings.outputStandard || 'netflix').toUpperCase();
  const langName = settings.targetLanguage === 'fa' ? 'Persian' : settings.targetLanguage;

  const refineSystemInstruction = `You are an expert subtitling editor specializing in ${standardName} broadcasting standards.
Your goal: Rephrase the provided ${langName} subtitle translation(s) to be concise, natural, and properly formatted without dropping any meaning, character names, numbers, or nuances.
MANDATORY RULES:
1. Conform to ${standardName} limits: max ${cplLimit} characters per line, max 2 lines. Reading speed under ${cpsLimit} characters/second.
2. DO NOT summarize, omit, or delete any dialogue facts or meaning. Retain the full sentence sense and tone.
3. Use natural, conversational ${langName} phrasing.
4. Output strictly a JSON array of objects: [{"id": <number>, "translatedText": "<concise translated text>"}] with NO markdown, commentary, or raw markers.`;

  const refineUserPrompt = `Refine the following ${problematicCues.length} cue(s) for ${standardName} standards (max ${cplLimit} chars/line, 2 lines max):\n\n` +
    problematicCues.map(c => `[ID ${c.id}]
Original: "${c.sourceText.replace(/\s+/g, ' ').trim()}"
Current Translation: "${c.currentText.replace(/\s+/g, ' ').trim()}"
Detected Issues: ${c.issues.join('; ')}`).join('\n\n');

  signal?.throwIfAborted();
  const refineResponse = await ai.models.generateContent({
    model: modelName,
    contents: refineUserPrompt,
    config: {
      systemInstruction: refineSystemInstruction,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.1,
      safetySettings: SAFETY_SETTINGS,
    },
  });

  signal?.throwIfAborted();
  if (!refineResponse.text) return result;

  try {
    const parsed = JSON.parse(extractJsonArray(refineResponse.text));
    if (Array.isArray(parsed)) {
      const allowedIds = new Set(problematicCues.map(c => c.id));
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const id = Number(item.id);
        const text = typeof item.translatedText === 'string' ? item.translatedText.trim() : '';
        if (allowedIds.has(id) && text.length > 0 && !RAW_MARKER_PATTERN.test(text) && !MARKDOWN_OR_EXPLANATION_PATTERN.test(text)) {
          const originalIssue = problematicCues.find(c => c.id === id);
          if (originalIssue) {
            result.set(id, text);
          }
        }
      }
    }
  } catch (parseErr) {
    console.warn('[Gemini Standards Refine] JSON parsing failed in light pass:', parseErr);
  }

  return result;
};




const getActiveOpenAICompatibleService = (settings: AppSettings): OpenAICompatibleService => {
  const activeService = settings.openAICompatibleServices.find(service => service.id === settings.activeOpenAICompatibleServiceId)
    || settings.openAICompatibleServices[0];
  if (!activeService) throw new Error('هیچ سرویس OpenAI Compatible ذخیره نشده است.');
  return activeService;
};

const requestOpenAICompatibleChat = async (service: OpenAICompatibleService, body: unknown, useProxy: boolean, signal?: AbortSignal): Promise<Response> => {
  const endpointUrl = resolveOpenAIChatCompletionsUrl(service.baseUrl);
  const upstreamHeaders = buildOpenAICompatibleHeaders(service);

  if (useProxy) {
    return fetch('/api/openai-compatible/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ endpointUrl, headers: upstreamHeaders, body }),
      signal
    });
  }

  return fetch(endpointUrl, {
    method: 'POST',
    headers: upstreamHeaders,
    body: JSON.stringify(body),
    signal
  });
};

const shouldFallbackFromProxyResponse = (response: Response): boolean => {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  // When the optional Vite proxy is unavailable (for example in a static
  // production deployment), SPA fallbacks often answer the proxy URL with
  // index.html and a 200/404 status. Treat any non-JSON proxy response as a
  // missing proxy and retry the provider endpoint directly instead of trying
  // to parse HTML as a Chat Completions response.
  return !isJson || response.status === 404 || response.status === 405;
};

const callOpenAICompatibleChat = async (service: OpenAICompatibleService, temperature: number, systemInstruction: string, userPrompt: string, signal?: AbortSignal): Promise<string> => {
  const body = {
    model: normalizeOpenAICompatibleModel(service),
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt }
    ],
    temperature,
    stream: false
  };

  let response: Response;
  try {
    response = await requestOpenAICompatibleChat(service, body, true, signal);
    if (shouldFallbackFromProxyResponse(response)) {
      response = await requestOpenAICompatibleChat(service, body, false, signal);
    }
  } catch (proxyError: any) {
    const msg = extractErrorDetails(proxyError);
    if (!msg.includes('failed to fetch') && !msg.includes('network') && !msg.includes('unexpected token')) throw proxyError;
    response = await requestOpenAICompatibleChat(service, body, false, signal);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`${service.name} ${response.status}: ${details || response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${service.name}`);
  return content;
};

const callLmStudioChat = async (settings: AppSettings, systemInstruction: string, userPrompt: string, signal?: AbortSignal): Promise<string> => {
  const baseUrl = normalizeLmStudioBaseUrl(settings.lmStudioBaseUrl);

  // 1. Dynamic temperature based on settings and tone
  // If settings.temperature is provided, use it as baseline, but adapt slightly by tone
  // (slightly higher for movie/conversational natural flow, slightly lower for news/educational precision)
  let lmTemp = typeof settings.temperature === 'number' ? settings.temperature : 0.35;
  if (settings.translationMethod === 'subtitle_translator') {
    // For Subtitle Translator method with Gemma 4 in LM Studio:
    // Tightly calibrated baseline (0.30) to prevent dropping tags or wandering while preserving conversational naturalness
    let subTemp = typeof settings.temperature === 'number' ? settings.temperature : 0.30;
    if (settings.tone === 'movie' || settings.tone === 'conversational') {
      subTemp = Math.min(0.85, subTemp + 0.04);
    } else if (settings.tone === 'news' || settings.tone === 'formal') {
      subTemp = Math.max(0.15, subTemp - 0.05);
    }
    lmTemp = Math.round(subTemp * 100) / 100;
  } else {
    if (settings.tone === 'movie' || settings.tone === 'conversational') {
      lmTemp = Math.min(1.0, lmTemp + 0.05);
    } else if (settings.tone === 'news' || settings.tone === 'formal') {
      lmTemp = Math.max(0.1, lmTemp - 0.05);
    }
    lmTemp = Math.round(lmTemp * 100) / 100;
  }

  // 2. Sampling parameters suitable for Gemma 4 (26B A4B) with optional settings overrides
  const anySettings = settings as any;
  const top_p = typeof anySettings?.lmStudioTopP === 'number' ? anySettings.lmStudioTopP : 0.95;
  const top_k = typeof anySettings?.lmStudioTopK === 'number' ? anySettings.lmStudioTopK : 64;
  const repeat_penalty = typeof anySettings?.lmStudioRepeatPenalty === 'number' 
    ? anySettings.lmStudioRepeatPenalty 
    : (typeof anySettings?.repeat_penalty === 'number' ? anySettings.repeat_penalty : (settings.translationMethod === 'subtitle_translator' ? 1.10 : 1.08));

  // 3. Batch-proportional max_tokens (estimating prompt density and expected target batch size)
  let maxTokens = 2048;
  if (typeof anySettings?.lmStudioMaxTokens === 'number') {
    maxTokens = anySettings.lmStudioMaxTokens;
  } else {
    // Estimate based on prompt length and batch density (bounded between 1500 and 3000)
    const promptLen = (userPrompt || '').length;
    if (promptLen > 3000) {
      maxTokens = 3000;
    } else if (promptLen < 800) {
      maxTokens = 1500;
    } else {
      maxTokens = Math.min(3000, Math.max(1500, Math.round(promptLen * 0.8)));
    }
  }

  const requestBody: Record<string, any> = {
    model: settings.lmStudioModel || 'local-model',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt }
    ],
    temperature: lmTemp,
    top_p,
    top_k,
    repeat_penalty,
    max_tokens: maxTokens,
    stream: false
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`LM Studio ${response.status}: ${details || response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from LM Studio');
  return content;
};


const toMarkedSubtitleParagraph = (blocks: BatchRequest[]): string => (
  blocks.map(block => `⟦${block.id}⟧ ${block.text.replace(/\s+/g, ' ').trim()}`).join('\n')
);

const formatCleanContextPre = (block: BatchRequest): string => {
  const match = block.text.match(/^([\s\S]*?)\s*\((?:existing\s+[\w-]+\s+translation|Persian|[\w-]+):\s*([\s\S]*?)\)$/i);
  if (match) {
    const orig = match[1].replace(/\s+/g, ' ').trim();
    const trans = match[2].trim();
    if (trans && trans.toUpperCase() !== 'N/A') {
      return `⟦${block.id}⟧ ${orig} ➔ ${trans}`;
    }
    return `⟦${block.id}⟧ ${orig}`;
  }
  return `⟦${block.id}⟧ ${block.text.replace(/\s+/g, ' ').trim()}`;
};

export const buildContextualTranslationPrompt = (
  targetBatch: BatchRequest[],
  contextPre: BatchRequest[],
  contextPost: BatchRequest[],
  useParagraphMode: boolean,
  isGemini: boolean = false,
  glossary: GlossaryItem[] = [],
  doNotTranslateTerms: string = '',
  provider?: AIProvider | string
): string => {
  if (isGemini) {
    const pre = contextPre.slice(-GEMINI_CONTEXT_PRE_WINDOW);
    const post = contextPost.slice(0, GEMINI_CONTEXT_POST_WINDOW);
    const targetLines = targetBatch
      .map(block => `⟦${block.id}⟧ ${block.text.replace(/\s+/g, ' ').trim()}`)
      .join('\n');

    let prompt = '';

    // 1. Few-shot inline examples for Glossary (reinforces adherence in Gemini user prompt)
    const validGlossary = (glossary || []).filter(g => g && g.term && g.translation);
    if (validGlossary.length > 0) {
      const relevantGlossary = validGlossary.filter(item => {
        const lowerTerm = item.term.toLowerCase();
        return targetBatch.some(b => b.text.toLowerCase().includes(lowerTerm));
      });

      const examples = relevantGlossary.length > 0 ? relevantGlossary.slice(0, 4) : validGlossary.slice(0, 3);
      if (examples.length > 0) {
        prompt += `GLOSSARY APPLICATION EXAMPLES (few-shot mapping - strictly replace):\n`;
        for (const item of examples) {
          prompt += `  • Example: "... ${item.term} ..." ➔ "... ${item.translation} ..."\n`;
        }
        prompt += `\n`;
      }
    }

    // 2. Strong protection for doNotTranslateTerms in user prompt
    const protectedTerms = (doNotTranslateTerms || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (protectedTerms.length > 0) {
      const relevantProtected = protectedTerms.filter(term => {
        const lowerTerm = term.toLowerCase();
        return targetBatch.some(b => b.text.toLowerCase().includes(lowerTerm));
      });
      const termsToShow = relevantProtected.length > 0 ? relevantProtected : protectedTerms.slice(0, 4);
      if (termsToShow.length > 0) {
        prompt += `DO-NOT-TRANSLATE TERMS (Keep exact English spelling untouched):\n  [ ${termsToShow.map(t => `"${t}"`).join(', ')} ]\n  • Example: "... with ${termsToShow[0]} now" ➔ "... با ${termsToShow[0]} اکنون"\n\n`;
      }
    }

    if (pre.length > 0) {
      prompt += `PAST CONTEXT (reference only; do not translate):\n${pre.map(formatCleanContextPre).join('\n')}\n\n`;
    }

    if (useParagraphMode) {
      prompt += `TARGET PARAGRAPH (read continuously for tone & flow; translate each marked cue):\n${targetLines}\n`;
    } else {
      prompt += `TARGET CUES (translate each item by its ID):\n${targetLines}\n`;
    }

    if (post.length > 0) {
      prompt += `\nFUTURE CONTEXT (reference only; do not translate):\n${post.map(b => `⟦${b.id}⟧ ${b.text.replace(/\s+/g, ' ').trim()}`).join('\n')}\n`;
    }

    prompt += `\nTranslate every TARGET CUE without including ⟦id⟧ markers inside translatedText. Return ONLY a valid JSON array: [{"id": number, "translatedText": "..."}].`;
    return prompt;
  }

  if (!useParagraphMode) {
    let prompt = `--- CONTEXTUAL BATCHING PROTOCOL ---
`;
    prompt += `Analyze the following sequence as a SINGLE CONTINUOUS SCENARIO before translating.
`;
    if (contextPre.length > 0) {
      prompt += `
PAST CONTEXT (Reference only):
${JSON.stringify(contextPre)}

CRITICAL BOUNDARY CONTINUITY & SEAMLESS STITCHING:
- The items in PAST CONTEXT (last 3+ subtitle cues with their existing translations) immediately precede TARGET BATCH in dialogue.
- Study these previous translations carefully to maintain strict consistency in topic, narrative thread, terminology, character names, formal/colloquial tone, and pronoun gender. Do NOT lose the train of thought or diverge from the established context.
- MANDATORY REVIEW: Before generating translations, you MUST review PAST CONTEXT and actively lock onto previously established character names, pronouns, gender markers, and key terminology.
- You MUST prefer previously used translations for the same concepts, names, or terminology when they appear in PAST CONTEXT.
- If the first item of TARGET BATCH continues a sentence, clause, or conversational thought from the last items of PAST CONTEXT, you MUST ensure that its grammar, verb tense, pronouns, and tone connect seamlessly without abrupt cuts or grammatical orphans.`;
    }
    prompt += `

TARGET BATCH (Translate these):
${JSON.stringify(targetBatch)}`;
    if (contextPost.length > 0) prompt += `

FUTURE CONTEXT (Study for flow):
${JSON.stringify(contextPost)}

MANDATORY LOOK-AHEAD:
- Use FUTURE CONTEXT to resolve ambiguities in TARGET BATCH (e.g. unknown pronouns, split sentences, interrupted dialogue, tone shifts).`;
    if (provider === 'lm_studio') {
      prompt += `
FEW-SHOT EXAMPLES (Strictly follow this JSON structure and high-standard Persian translation):
• Example 1 (Cinematic & Conversational / محاوره‌ای فیلم و سریال):
Input: [{"id": 101, "text": "Are you out of your mind? Put that down right now!"}]
Output: [{"id": 101, "translatedText": "مگه عقلت رو از دست دادی؟ همین الان بذارش زمین!"}]

• Example 2 (Formal & Educational / رسمی و علمی-آموزشی):
Input: [{"id": 102, "text": "The optimization algorithm significantly increases computational throughput."}]
Output: [{"id": 102, "translatedText": "الگوریتم بهینه‌سازی، بازده محاسباتی را به طور چشمگیری افزایش می‌دهد."}]
`;
    }
    prompt += `
Task: Translate TARGET BATCH into the configured target language.
Ensure the flow matches the scenario. Use "Tehrani Spoken" rules if conversational.
Return JSON array matching the schema.`;
    if (provider === 'lm_studio') {
      prompt += `

STRICT JSON OUTPUT MANDATE:
- Output MUST be strictly and exclusively a raw, valid JSON array.
- Absolutely NO preamble, commentary, greetings, notes, or explanations before or after the JSON array.
- Strictly NO markdown code fences, backticks, or labels (do NOT use \`\`\` or \`\`\`json).
- Stop output immediately after the closing bracket ] of the JSON array.`;
    }
    return prompt;
  }

  let prompt = `--- HIGH QUALITY PARAGRAPH SUBTITLE TRANSLATION PROTOCOL ---
`;
  prompt += `You will receive subtitle blocks as one continuous marked paragraph. Read the whole passage first to understand topic, speaker intent, pronouns, references, and emotional flow.
`;
  prompt += `Each target block starts with a marker like ⟦123⟧. Treat every marker as a HARD subtitle cue boundary. Keep the exact IDs in your final JSON so the app can place each translation back into its original timing.
`;
  if (provider === 'lm_studio') {
    prompt += `
FEW-SHOT EXAMPLES (Strictly follow this JSON structure and high-standard Persian translation):
• Example 1 (Cinematic & Conversational / محاوره‌ای فیلم و سریال):
Input: ⟦101⟧ Are you out of your mind? Put that down right now!
Output: [{"id": 101, "translatedText": "مگه عقلت رو از دست دادی؟ همین الان بذارش زمین!"}]

• Example 2 (Formal & Educational / رسمی و علمی-آموزشی):
Input: ⟦102⟧ The optimization algorithm significantly increases computational throughput.
Output: [{"id": 102, "translatedText": "الگوریتم بهینه‌سازی، بازده محاسباتی را به طور چشمگیری افزایش می‌دهد."}]
`;
  }
  if (contextPre.length > 0) {
    prompt += `
PAST CONTEXT (reference only; do not translate these IDs):
${toMarkedSubtitleParagraph(contextPre)}

CRITICAL BOUNDARY CONTINUITY & SEAMLESS STITCHING:
- The cues in PAST CONTEXT (last 3+ subtitle cues with their existing translations) immediately precede the first cue of TARGET MARKED PARAGRAPH.
- Study these previous translations carefully to maintain strict consistency in topic, narrative thread, character names, formal/colloquial tone, terminology, and pronoun gender. Do NOT lose the train of thought.
- MANDATORY REVIEW: Before generating translations, you MUST review PAST CONTEXT and actively lock onto previously established character names, pronouns, gender markers, and key terminology.
- You MUST prefer previously used translations for the same concepts, names, or terminology when they appear in PAST CONTEXT.
- If the first target cue continues a sentence, clause, or thought from the last cue, stitch it seamlessly with matching grammar, person/pronouns, and tone.
`;
  }
  prompt += `
TARGET MARKED PARAGRAPH (translate every marked target block):
${toMarkedSubtitleParagraph(targetBatch)}
`;
  if (contextPost.length > 0) {
    prompt += `
FUTURE CONTEXT (reference only; do not translate these IDs):
${toMarkedSubtitleParagraph(contextPost)}

MANDATORY LOOK-AHEAD:
- Use FUTURE CONTEXT to resolve ambiguities in TARGET MARKED PARAGRAPH (e.g. unknown pronouns, split sentences, interrupted dialogue, tone shifts).
`;
  }
  prompt += `
Translation quality requirements:
`;
  prompt += `- Translate meaning, tone, and intent completely, not word-by-word wording.
`;
  prompt += `- Do NOT summarize, omit, compress, or replace a cue with a short gist. Every detail in every marked source cue must remain in that cue's translation.
`;
  prompt += `- Preserve continuity across adjacent subtitle blocks, but NEVER move words, meaning, or summary from one marker into another marker's translatedText.
`;
  prompt += `- Each JSON item must translate ONLY the source text that appears after that item's own marker; do not combine two cues into one translatedText and do not duplicate one translatedText across adjacent IDs.
`;
  prompt += `- If a sentence continues across markers, preserve all of it across the same markers; do not complete a later cue early or drop its remaining words.
`;
  prompt += `- Use subtitle-friendly wording only when it preserves the complete meaning; do not shorten the translation merely to make it fit.
`;
  prompt += `- Return clean text only: no markdown, no labels, no notes, no raw markers inside translatedText.
`;
  prompt += `- Keep necessary names, brands, and technical terms from the source, but avoid accidental English filler.
`;
  prompt += `- Prefer one line when concise; use at most two readable lines only when needed.
`;
  prompt += `- Return ONLY a valid JSON array: [{"id": number, "translatedText": "..."}]. Do not include markdown or explanations.`;
  if (provider === 'lm_studio') {
    prompt += `

STRICT JSON OUTPUT MANDATE:
- Output MUST be strictly and exclusively a raw, valid JSON array: [{"id": number, "translatedText": "..."}].
- Absolutely NO preamble, commentary, greetings, notes, or explanations before or after the JSON array.
- Strictly NO markdown code fences, backticks, or labels (do NOT use \`\`\` or \`\`\`json).
- Stop output immediately after the closing bracket ] of the JSON array. Do not generate any text, tokens, or characters after ].`;
  }
  return prompt;
};

const extractErrorDetails = (error: any): string => {
    let msg = "";
    if (!error) return "";
    if (typeof error === 'string') return error.toLowerCase();
    if (error.message) msg += " " + error.message;
    if (error.statusText) msg += " " + error.statusText;
    if (error.status) msg += " " + error.status;
    if (error.error && typeof error.error === 'object') {
        if (error.error.message) msg += " " + error.error.message;
    }
    return msg.toLowerCase();
};

const getFriendlyErrorMessage = (error: any, modelName: string): string => {
  const msg = extractErrorDetails(error);
  const lower = msg.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('invalid api key') || (lower.includes('400') && lower.includes('key'))) {
    return '⛔ کلید API وارد شده نامعتبر است. لطفاً از Google AI Studio (aistudio.google.com) یک کلید جدید و معتبر دریافت و وارد نمایید.';
  }
  if (lower.includes('location') || lower.includes('region') || lower.includes('user location is not supported') || (lower.includes('403') && !lower.includes('key'))) {
    return '⛔ خطای تحریم جغرافیایی (403): گوگل دسترسی با IP ایران را مسدود کرده است. لطفاً فیلترشکن (VPN) خود را روشن کنید یا سرور آن را به کشوری مجاز تغییر دهید.';
  }
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('failed to fetch')) {
    return '⚠️ خطای شبکه: ارتباط با سرورهای گوگل مسدود شده یا اینترنت قطع است.';
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return '⚠️ پایان سقف مصرف (429): سقف مجاز استفاده از این کلید API موقتاً پر شده است.';
  }
  if (lower.includes('503') || lower.includes('overloaded') || lower.includes('high demand') || lower.includes('unavailable')) {
    return `⚠️ خطای ترافیک بالای سرور گوگل (503 High Demand): مدل ${modelName} موقتاً با بار ترافیکی بالا مواجه است. سیستم به مدل جایگزین سوییچ می‌کند.`;
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('is not supported for generatecontent')) {
    return `⚠️ مدل ${modelName} یافت نشد (404). لطفاً از مدل‌های پایدار و سریع مانند آخرین نسخه Flash استفاده کنید.`;
  }
  return `خطای سیستمی: ${msg.substring(0, 120)}...`;
};

const getOpenAICompatibleFriendlyError = (error: any, serviceName = 'OpenAI Compatible'): string => {
  const msg = extractErrorDetails(error);
  if (msg.includes('failed to fetch') || msg.includes('fetch failed') || msg.includes('cors')) {
    return `⚠️ اتصال به ${serviceName} برقرار نشد. درخواست مستقیم مرورگر با CORS مسدود شد و پروکسی داخلی هم پاسخ نگرفت؛ اگر نسخه build/static را اجرا می‌کنید باید اپ را پشت Backend/Proxy اجرا کنید.`;
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key')) {
    return `⛔ API Key سرویس ${serviceName} معتبر نیست یا دسترسی لازم را ندارد.`;
  }
  if (msg.includes('model') || msg.includes('no endpoints found') || msg.includes('provider') || msg.includes('data policy')) {
    const openRouterHint = serviceName.toLowerCase().includes('openrouter')
      ? ' در OpenRouter معمولاً باید شناسه کامل مدل را وارد کنید؛ مثلاً openai/gpt-4o-mini یا google/gemini-2.0-flash-001. نام gemini-40-mini معتبر نیست و احتمالاً منظور gpt-4o-mini یا یک مدل Gemini با پیشوند google/ است.'
      : '';
    return `⚠️ نام مدل برای ${serviceName} معتبر نیست یا توسط سرویس پشتیبانی نمی‌شود.${openRouterHint}`;
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return `⚠️ سرویس ${serviceName} پاسخ 404 داد. اگر خطا مربوط به مدل نبود، Base URL را به شکل https://openrouter.ai/api/v1 یا URL کامل chat/completions وارد کنید.`;
  }
  return `⚠️ اتصال به ${serviceName} برقرار نشد: ${msg.substring(0, 180)}`;
};

export const getTranslationDiagnostic = (error: any, settings: AppSettings, context?: string): TranslationDiagnostic => {
  const msg = extractErrorDetails(error);
  const providerName = settings.aiProvider === 'lm_studio'
    ? 'LM Studio'
    : settings.aiProvider === 'openai_compatible'
      ? (settings.openAICompatibleServices.find(service => service.id === settings.activeOpenAICompatibleServiceId)?.name || 'OpenAI Compatible')
      : isFreeProvider(settings.aiProvider)
        ? getFreeProviderName(settings.aiProvider)
        : 'Gemini';

  const details = [
    context,
    error?.message || (typeof error === 'string' ? error : ''),
  ].filter(Boolean).join(' | ');

  if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('too many requests') || msg.includes('پایان اعتبار')) {
    return {
      code: 'quota_exhausted',
      severity: 'error',
      title: 'اعتبار یا سهمیه API تمام شده',
      cause: `سرویس ${providerName} درخواست را به دلیل محدودیت مصرف، quota یا rate limit رد کرده است.`,
      recovery: 'یک API Key جدید اضافه کنید، کلیدهای rate-limited را ریست کنید، مدل سبک‌تر انتخاب کنید یا چند دقیقه بعد ادامه ترجمه را بزنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  if (msg.includes('fetch failed') || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('cors')) {
    return {
      code: 'connection_failed',
      severity: 'error',
      title: `ارتباط با ${providerName} قطع است`,
      cause: settings.aiProvider === 'lm_studio'
        ? 'مرورگر نتوانست به سرور لوکال LM Studio وصل شود؛ معمولاً Local Server خاموش است، URL اشتباه است یا CORS اجازه نمی‌دهد.'
        : 'درخواست شبکه ناموفق بوده؛ ممکن است VPN/Proxy، اینترنت، DNS، CORS یا backend proxy مشکل داشته باشد.',
      recovery: settings.aiProvider === 'lm_studio'
        ? 'LM Studio را باز کنید، Local Server را روشن کنید، مدل را load کنید و آدرس را با /v1 بررسی کنید.'
        : 'اتصال اینترنت/VPN/Proxy و آدرس سرویس را بررسی کنید و سپس ادامه ترجمه را بزنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  if (isModelOverloadedError(msg)) {
    const lastFallback = getLastModelFallbackInfo();
    return {
      code: 'model_overloaded',
      severity: 'warning',
      title: 'مدل موقتاً شلوغ یا با ترافیک بالا مواجه است (۵۰۳)',
      cause: lastFallback && lastFallback.triedModels.length > 1
        ? `سرویس ${providerName} پس از تلاش خودکار با مدل‌های زنجیره Flash (${lastFallback.triedModels.join(' ➔ ')}) به دلیل ترافیک سنگین سرورهای گوگل با خطای ازدحام موقت روبرو شد.`
        : `سرویس ${providerName} با خطای ازدحام، تقاضای بالا (high demand) یا عدم دسترسی موقت پاسخ داده است.`,
      recovery: 'مدل‌های جایگزین Flash به صورت هوشمند بررسی شدند اما تمامی آنها موقتاً با ترافیک بالا مواجه‌اند. داده‌های ترجمه‌شده تا این لحظه کاملاً حفظ شده‌اند. چند دقیقه صبر کنید و دکمه ادامه ترجمه را بزنید یا مدل دیگری را در تنظیمات انتخاب کنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  if (msg.includes('tagged_translation_incomplete') || msg.includes('incomplete or low-quality tagged')) {
    const ids = (error?.message || '').match(/ids:\s*([\d, ]+)/i)?.[1];
    return {
      code: 'tagged_translation_incomplete',
      severity: 'warning',
      title: 'پاسخ برچسب‌دار Subtitle Translator ناقص است',
      cause: ids
        ? `مدل برای بلوک‌های ${ids} تگ ترجمهٔ معتبر برنگرداند یا متن اصلی را بدون ترجمه تکرار کرد.`
        : 'مدل همهٔ تگ‌های درخواست‌شده را با ترجمهٔ معتبر برنگرداند یا متن اصلی را بدون ترجمه تکرار کرد.',
      recovery: 'برنامه همان بلوک‌ها را یک بار خودکار دوباره درخواست کرده است. اگر خطا باقی ماند، مدل محلی قوی‌تر/کم‌حجم‌تر انتخاب کنید یا همان بلوک‌ها را از ادیتور ترجمهٔ دوباره کنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('authentication')) {
    return {
      code: 'authentication_failed',
      severity: 'error',
      title: 'احراز هویت سرویس ناموفق بود',
      cause: `سرویس ${providerName} کلید API یا توکن دسترسی را نپذیرفت.`,
      recovery: 'کلید API سرویس فعال را بررسی کنید. برای GTX، Edge و DeepLX کلیدی وارد نکنید و اتصال اینترنت را بررسی کنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  if (msg.includes('403') || msg.includes('forbidden')) {
    return {
      code: 'access_forbidden',
      severity: 'error',
      title: 'دسترسی سرویس رد شد',
      cause: `سرویس ${providerName} این درخواست را به دلیل سیاست دسترسی، منطقه، CORS یا محدودیت شبکه رد کرده است.`,
      recovery: 'اتصال/VPN و دسترسی مرورگر را بررسی کنید؛ برای سرویس‌های رایگان می‌توانید یک ارائه‌دهندهٔ رایگان دیگر را امتحان کنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  if (msg.includes('invalid model') || msg.includes('model') || msg.includes('404') || msg.includes('not found')) {
    return {
      code: 'model_or_endpoint_invalid',
      severity: 'error',
      title: 'مدل یا endpoint معتبر نیست',
      cause: `نام مدل، مسیر chat/completions یا Base URL برای ${providerName} درست نیست یا توسط سرویس پشتیبانی نمی‌شود.`,
      recovery: 'نام مدل را دقیقاً مطابق سرویس وارد کنید، Base URL را بررسی کنید و تست اتصال را دوباره اجرا کنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  if (msg.includes('invalid model response') || msg.includes('json') || msg.includes('empty response') || msg.includes('missing ids') || msg.includes('repeated translations') || msg.includes('too long')) {
    return {
      code: 'invalid_model_output',
      severity: 'warning',
      title: 'خروجی مدل قابل استفاده نبود',
      cause: 'مدل JSON معتبر، IDهای کامل یا متن ترجمه قابل قبول برنگردانده است.',
      recovery: 'دمای مدل را کمتر کنید، مدل قوی‌تر انتخاب کنید، batch size را کاهش دهید یا دوباره تلاش کنید.',
      technicalDetails: details || msg,
      timestamp: new Date().toISOString()
    };
  }

  return {
    code: 'translation_unknown_error',
    severity: 'error',
    title: 'خطای نامشخص در ترجمه',
    cause: `در مسیر ارتباط یا پردازش پاسخ ${providerName} خطایی رخ داده که در دسته‌بندی‌های شناخته‌شده قرار نگرفت.`,
    recovery: 'جزئیات فنی را بررسی کنید، تنظیمات مدل/API را تست کنید و اگر تکرار شد فایل یا بلوک مشکل‌دار را جداگانه ترجمه کنید.',
    technicalDetails: details || msg,
    timestamp: new Date().toISOString()
  };
};

export const validateAPIConnection = async (apiKey: string, strictMode: boolean = false): Promise<boolean> => {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) return false;
  try {
    const ai = createGeminiClient(apiKey.trim());
    const pingCall = ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: 'ping',
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    const timeoutCall = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout: no response within 7s')), 7000)
    );
    await Promise.race([pingCall, timeoutCall]);
    return true;
  } catch (e: any) {
    const errorDetails = extractErrorDetails(e).toLowerCase();

    // Explicit API Key invalidation
    const isApiKeyInvalid =
      errorDetails.includes('api_key_invalid') ||
      errorDetails.includes('api key not valid') ||
      errorDetails.includes('invalid api key') ||
      (errorDetails.includes('400') && errorDetails.includes('key'));

    if (isApiKeyInvalid) {
      return false;
    }

    // 429: Rate limited or quota exhausted -> Key IS authentic and valid
    if (errorDetails.includes('429') || errorDetails.includes('quota') || errorDetails.includes('resource_exhausted')) {
      return true;
    }

    // 503 / 500: Server high demand or temporary overload -> Key reached backend and is valid
    if (errorDetails.includes('503') || errorDetails.includes('500') || isModelOverloadedError(errorDetails)) {
      return true;
    }

    // 403: Location / region restriction (sanctions) -> Key itself is valid
    if (errorDetails.includes('403') || errorDetails.includes('location') || errorDetails.includes('user location is not supported')) {
      return !strictMode;
    }

    return false;
  }
};

export const diagnoseConnection = async (apiKey?: string, settings?: AppSettings): Promise<string | null> => {
    const testModel = settings ? getResolvedGeminiModel(settings.model) : DEFAULT_GEMINI_MODEL;
    try {
        // These transports are intentionally keyless. Their actual request will
        // surface provider-specific network/access diagnostics if unavailable.
        if (settings && isFreeProvider(settings.aiProvider)) return null;
        if (settings?.aiProvider === 'lm_studio') {
            const baseUrl = normalizeLmStudioBaseUrl(settings.lmStudioBaseUrl);
            const response = await fetch(`${baseUrl}/models`);
            if (!response.ok) throw new Error(`LM Studio ${response.status}: ${response.statusText}`);
            return null;
        }
        if (settings?.aiProvider === 'openai_compatible') {
            const service = getActiveOpenAICompatibleService(settings);
            if (!service.model.trim()) return '⚠️ نام مدل سرویس OpenAI Compatible وارد نشده است.';
            await callOpenAICompatibleChat(service, settings.temperature, 'You are a connection tester.', 'Reply with only OK.');
            return null;
        }
        const activeKey = apiKey?.trim() || (settings?.apiKeys ? new APIKeyManager(settings.apiKeys).getActiveKey() : undefined);
        if (!activeKey) return '⛔ هیچ کلید API فعالی برای تست یافت نشد. لطفاً در بخش تنظیمات کلید معتبر اضافه کنید.';

        const ai = createGeminiClient(activeKey);
        const pingCall = ai.models.generateContent({
          model: testModel,
          contents: 'ping',
          config: {
            thinkingConfig: { thinkingBudget: 0 }
          }
        });
        const timeoutCall = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout: no response within 7s')), 7000)
        );
        await Promise.race([pingCall, timeoutCall]);
        return null; 
    } catch (e: any) {
        if (settings?.aiProvider === 'lm_studio') {
            return '⚠️ اتصال به LM Studio برقرار نشد. مطمئن شوید LM Studio روشن است، Local Server فعال شده و آدرس روی http://localhost:1234/v1 تنظیم است.';
        }
        if (settings?.aiProvider === 'openai_compatible') {
            const serviceName = settings.openAICompatibleServices.find(service => service.id === settings.activeOpenAICompatibleServiceId)?.name
                || settings.openAICompatibleServices[0]?.name;
            return getOpenAICompatibleFriendlyError(e, serviceName);
        }
        return getFriendlyErrorMessage(e, testModel);
    }
};

class APIKeyManager {
  private keys: { key: string; isRateLimited: boolean }[] = [];
  private currentIndex = 0;
  constructor(userKeys: UserAPIKey[]) {
    userKeys.forEach(k => { if (k.isValid) this.keys.push({ key: k.key, isRateLimited: k.isRateLimited }); });
  }
  public getActiveKey(): string {
    const availableKeyIndex = this.keys.findIndex(k => !k.isRateLimited);
    if (availableKeyIndex === -1) throw new Error("429: All API Keys are Rate Limited.");
    this.currentIndex = availableKeyIndex;
    return this.keys[this.currentIndex].key;
  }
  public markCurrentAsRateLimited() { if (this.keys[this.currentIndex]) this.keys[this.currentIndex].isRateLimited = true; }
  public hasAvailableKeys(): boolean { return this.keys.some(k => !k.isRateLimited); }
}

export const translateBatch = async (
  targetBatch: BatchRequest[],
  contextPre: BatchRequest[],
  contextPost: BatchRequest[],
  settings: AppSettings,
  onKeyRateLimit?: (key: string) => void,
  forceParagraphMode: boolean = false,
  signal?: AbortSignal
): Promise<BatchResponse[]> => {
  let attempt = 0;
  let validationRetries = 0;
  let overloadRetries = 0; 
  const { maxRetries, baseDelay, overloadWaitMs } = APP_CONFIG.retryConfig;

  // TM Check & Cue Pruning (Exclusively for Gemini when enableTranslationMemory !== false)
  let effectiveTargetBatch = targetBatch;
  let cachedResponsesFromTM: BatchResponse[] = [];

  if (settings.aiProvider === 'gemini' && settings.enableTranslationMemory !== false) {
    const memoryResult = filterBatchWithMemory(targetBatch);
    cachedResponsesFromTM = memoryResult.cachedResponses;
    effectiveTargetBatch = memoryResult.uncachedBatch;

    // If 100% of cues were resolved from Translation Memory, return immediately without calling Gemini API
    if (effectiveTargetBatch.length === 0) {
      return cachedResponsesFromTM.sort((a, b) => a.id - b.id);
    }
  }

  // Auto-refresh discovery cache in background if needed (only for Gemini)
  if (settings.aiProvider === 'gemini' && settings.apiKeys && settings.apiKeys.length > 0) {
    const activeKey = settings.apiKeys.find(k => k.isValid && !k.isRateLimited)?.key || settings.apiKeys[0]?.key;
    if (activeKey) {
      ensureFreshGeminiFlashModels(activeKey).catch(() => {});
    }
  }

  const baseModel = getResolvedGeminiModel(settings.model);
  const initialChain = settings.aiProvider === 'gemini'
    ? getActiveGeminiFallbackChain(baseModel)
    : [baseModel];

  let currentModelName = initialChain[0] || baseModel;
  let modelSwitchCount = 0;

  const keyManager = new APIKeyManager(settings.apiKeys);
  const totalAllowedAttempts = maxRetries + settings.apiKeys.length * 2;

  // Track selective validation & accumulated valid responses (Gemini provider only)
  const accumulatedValidResponses = new Map<number, string>();
  let currentTargetBatch = effectiveTargetBatch;

  while (attempt < totalAllowedAttempts) {
    let currentApiKey = '';
    try {
      if (settings.aiProvider === 'gemini') {
        currentApiKey = keyManager.getActiveKey();
      }

      // For non-Gemini, targetBatch is sent as before.
      // For Gemini, currentTargetBatch holds ONLY uncached and still-problematic cues!
      const activeBatch = settings.aiProvider === 'gemini' ? currentTargetBatch : targetBatch;
      const targetIds = activeBatch.map(block => block.id);

      const promptMethod = forceParagraphMode || settings.aiProvider !== 'gemini' ? 'paragraph' : 'default';

      // Build context: if selective retry is underway for Gemini, feed previous translated cues as rich context
      let effectivePre = contextPre;
      if (settings.aiProvider === 'gemini' && currentTargetBatch.length < effectiveTargetBatch.length && currentTargetBatch.length > 0) {
        const priorCompleted = effectiveTargetBatch
          .filter(b => b.id < currentTargetBatch[0].id)
          .map(b => ({
            id: b.id,
            text: accumulatedValidResponses.has(b.id)
              ? `${b.text} (existing translation: ${accumulatedValidResponses.get(b.id)})`
              : b.text
          }));
        effectivePre = [...contextPre, ...priorCompleted].slice(-GEMINI_CONTEXT_PRE_WINDOW);
      }

      let userPrompt = buildContextualTranslationPrompt(
        activeBatch,
        effectivePre,
        contextPost,
        promptMethod === 'paragraph',
        settings.aiProvider === 'gemini',
        settings.glossary,
        settings.doNotTranslateTerms,
        settings.aiProvider
      );

      if (validationRetries > 0) {
        userPrompt += `\n\nCRITICAL RETRY NOTICE: Your previous response was REJECTED because it was malformed (invalid JSON, missing IDs, or empty translations).
You MUST return ONLY a strictly valid JSON array: [{"id": number, "translatedText": "..."}].
Do NOT wrap the output in markdown code blocks (\`\`\`json). Do NOT add explanations or preamble. Just the raw JSON array.`;
      }

      const systemInstruction = getSystemInstruction(
        settings.tone, 
        settings.topic, 
        settings.customPrompt, 
        settings.outputStandard,
        settings.glossary,
        settings.doNotTranslateTerms,
        settings.targetLanguage,
        promptMethod,
        settings.aiProvider
      );

      if (isFreeProvider(settings.aiProvider)) {
        const translations = await Promise.all(targetBatch.map(async block => ({ id: block.id, translatedText: await translateWithFreeProvider(block.text, settings, signal) })));
        return validateBatchResponse(targetIds, translations);
      }

      if (settings.aiProvider === 'lm_studio') {
        signal?.throwIfAborted();
        const lmStudioPrompt = `${userPrompt}

STRICT JSON OUTPUT MANDATE:
- Output MUST be strictly and exclusively a raw JSON array matching [{"id": number, "translatedText": "..."}].
- Absolutely NO introductory or concluding text, conversation, notes, or explanations before or after the array.
- Absolutely NO markdown code blocks, backticks, or formatting (strictly NO \`\`\` or \`\`\`json).
- Stop output immediately after the closing bracket ] of the JSON array.`;
        const text = await callLmStudioChat(settings, systemInstruction, lmStudioPrompt, signal);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      if (settings.aiProvider === 'openai_compatible') {
        const service = getActiveOpenAICompatibleService(settings);
        signal?.throwIfAborted();
        const text = await callOpenAICompatibleChat(service, settings.temperature, systemInstruction, `${userPrompt}\n\nReturn ONLY a JSON array, with no markdown.`, signal);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      signal?.throwIfAborted();
      const ai = createGeminiClient(currentApiKey);

      // Only apply Core/Dynamic separation and Context Caching when provider is Gemini
      const coreInstruction = getCoreSystemInstruction(settings.targetLanguage, promptMethod);
      const dynamicInstruction = getDynamicSystemInstruction(
        settings.tone,
        settings.topic,
        settings.customPrompt,
        settings.outputStandard,
        settings.glossary,
        settings.doNotTranslateTerms,
        settings.targetLanguage
      );

      let cachedContentName: string | null = null;
      try {
        cachedContentName = await getOrEstablishGeminiCache(ai, currentModelName, currentApiKey, coreInstruction, signal);
      } catch {
        cachedContentName = null;
      }

      const geminiTemp = getGeminiTemperature(
        settings.temperature,
        settings.topic,
        settings.tone,
        settings.model,
        validationRetries
      );

      const generateConfig: any = {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: geminiTemp,
        safetySettings: SAFETY_SETTINGS,
      };

      // Disable heavy thinking/reasoning overhead on 3.8 and 3.7 flash models to avoid 503 high demand & latency
      if (currentModelName.includes('3.8-flash') || currentModelName.includes('3.7-flash')) {
        generateConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      let contents = userPrompt;
      if (cachedContentName) {
        generateConfig.cachedContent = cachedContentName;
        if (dynamicInstruction) {
          contents = `--- DYNAMIC RULES ---\n${dynamicInstruction}\n\n${userPrompt}`;
        }
      } else {
        generateConfig.systemInstruction = systemInstruction;
      }

      let response: any;
      try {
        response = await ai.models.generateContent({
          model: currentModelName,
          contents: contents,
          config: generateConfig,
        });
      } catch (genErr: any) {
        if (cachedContentName) {
          geminiContextCacheMap.delete(`${currentModelName}_${currentApiKey.slice(-6)}_${coreInstruction.length}`);
          response = await ai.models.generateContent({
            model: currentModelName,
            contents: userPrompt,
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: responseSchema,
              temperature: geminiTemp,
              safetySettings: SAFETY_SETTINGS,
            },
          });
        } else {
          throw genErr;
        }
      }

      signal?.throwIfAborted();
      if (!response.text) throw new Error("Empty response from Gemini");

      // Selective validation exclusively for Gemini
      if (settings.aiProvider === 'gemini') {
        const rawParsed = JSON.parse(extractJsonArray(response.text));
        const validationResult = validateSelectiveBatchResponse(currentTargetBatch, rawParsed);

        // Collect newly validated responses
        for (const validItem of validationResult.validResponses) {
          accumulatedValidResponses.set(validItem.id, validItem.translatedText);
        }

        const remainingUnresolved = effectiveTargetBatch.filter(b => !accumulatedValidResponses.has(b.id));

        if (remainingUnresolved.length === 0) {
          // All cues in batch successfully validated
          let validatedResponses: BatchResponse[] = effectiveTargetBatch.map(b => ({
            id: b.id,
            translatedText: accumulatedValidResponses.get(b.id)!
          }));

          // Lightweight standards compliance pass exclusively for Gemini:
          // Detect cues violating line length (CPL) or reading speed (CPS)
          const problematicCues: SubtitleComplianceIssue[] = [];
          for (const item of validatedResponses) {
            const cueBlock = effectiveTargetBatch.find(b => b.id === item.id);
            if (cueBlock) {
              const issue = checkCueStandardCompliance(cueBlock, item.translatedText, settings.outputStandard, settings.targetLanguage);
              if (issue) {
                problematicCues.push(issue);
              }
            }
          }

          const MAX_PROBLEMATIC_REWRITE_CUES = 3;
          const MAX_PROBLEMATIC_RATIO = 0.35;

          // Only perform light rewrite if 1 to 3 cues are flagged (skip if 0 or if too many to prevent token explosion)
          if (
            problematicCues.length > 0 &&
            problematicCues.length <= MAX_PROBLEMATIC_REWRITE_CUES &&
            problematicCues.length <= Math.ceil(effectiveTargetBatch.length * MAX_PROBLEMATIC_RATIO)
          ) {
            try {
              signal?.throwIfAborted();
              const refinedMap = await refineProblematicCuesForStandards(
                ai,
                currentModelName,
                problematicCues,
                settings,
                signal
              );

              if (refinedMap.size > 0) {
                validatedResponses = validatedResponses.map(item => {
                  const refinedText = refinedMap.get(item.id);
                  if (refinedText && refinedText.trim()) {
                    return { id: item.id, translatedText: refinedText };
                  }
                  return item;
                });
              }
            } catch (refineErr: any) {
              // Non-blocking: keep existing validated translations if network/quota hiccups occur
              console.warn('[Gemini Standards Refine] Light rewrite pass skipped due to error:', refineErr?.message || refineErr);
            }
          } else if (problematicCues.length > MAX_PROBLEMATIC_REWRITE_CUES) {
            console.log(`[Gemini Standards Refine] Skipped: ${problematicCues.length} cues flagged, exceeding safety threshold (max ${MAX_PROBLEMATIC_REWRITE_CUES}). Preserving token quota.`);
          }

          // Populate TM with newly translated cues for future reuse
          if (settings.enableTranslationMemory !== false) {
            const toSave = effectiveTargetBatch.map(b => {
              const res = validatedResponses.find(r => r.id === b.id);
              return res ? { sourceText: b.text, translatedText: res.translatedText } : null;
            }).filter(Boolean) as { sourceText: string; translatedText: string }[];

            if (toSave.length > 0) {
              addBatchToMemory(toSave);
            }
          }

          if (cachedResponsesFromTM.length > 0) {
            return [...cachedResponsesFromTM, ...validatedResponses].sort((a, b) => a.id - b.id);
          }

          return validatedResponses;
        }

        // Validation issues detected: selective retry only for problematic/unresolved cues
        validationRetries++;
        attempt++;
        currentTargetBatch = remainingUnresolved;

        // If retries exhausted, perform soft-fill fallback for remaining cues to preserve subtitle alignment
        if (attempt >= totalAllowedAttempts || validationRetries >= maxRetries) {
          console.warn(`[Gemini Selective Retry] Max retries reached with ${remainingUnresolved.length} unresolved cue(s). Applying soft-fill fallback.`);
          for (const block of remainingUnresolved) {
            accumulatedValidResponses.set(
              block.id,
              block.previousTranslatedText?.trim() || block.text
            );
          }

          const fallbackResponses: BatchResponse[] = effectiveTargetBatch.map(b => ({
            id: b.id,
            translatedText: accumulatedValidResponses.get(b.id)!
          }));

          if (settings.enableTranslationMemory !== false) {
            const validToSave = effectiveTargetBatch
              .filter(b => !remainingUnresolved.some(r => r.id === b.id))
              .map(b => ({ sourceText: b.text, translatedText: accumulatedValidResponses.get(b.id)! }));
            if (validToSave.length > 0) {
              addBatchToMemory(validToSave);
            }
          }

          if (cachedResponsesFromTM.length > 0) {
            return [...cachedResponsesFromTM, ...fallbackResponses].sort((a, b) => a.id - b.id);
          }

          return fallbackResponses;
        }

        // Small adaptive delay for validation retry
        await delay(Math.min(baseDelay * Math.pow(1.2, validationRetries), 1500));
        continue;
      }

      // Non-Gemini validation
      const validatedResponses = validateBatchResponse(targetIds, JSON.parse(extractJsonArray(response.text)));
      return validatedResponses;

    } catch (error: any) {
      if (isAbortError(error, signal)) throw error;
      const errorMessage = extractErrorDetails(error);
      if (settings.aiProvider === 'lm_studio' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('lm studio'))) {
        throw new Error('⚠️ اتصال به LM Studio برقرار نشد. Local Server را در LM Studio روشن کنید و آدرس/نام مدل را بررسی کنید.');
      }
      if (settings.aiProvider === 'openai_compatible' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('openai') || errorMessage.includes('compatible') || errorMessage.includes('401') || errorMessage.includes('404'))) {
        const service = settings.openAICompatibleServices.find(item => item.id === settings.activeOpenAICompatibleServiceId) || settings.openAICompatibleServices[0];
        throw new Error(getOpenAICompatibleFriendlyError(error, service?.name));
      }
      if (errorMessage.includes('fetch failed') || errorMessage.includes('location')) throw new Error(getFriendlyErrorMessage(error, currentModelName));
      
      // Intelligent Gemini Model Fallback on 503 / overloaded / UNAVAILABLE / high demand
      if (settings.aiProvider === 'gemini' && isModelOverloadedError(errorMessage)) {
        blacklistModelInSession(currentModelName);

        if (modelSwitchCount < MAX_MODEL_FALLBACK_SWITCHES) {
          const nextChain = getActiveGeminiFallbackChain(baseModel);
          const nextModel = nextChain.find(m => m !== currentModelName);

          if (nextModel && nextModel !== currentModelName) {
            const prevModel = currentModelName;
            currentModelName = nextModel;
            modelSwitchCount++;

            notifyModelFallback(prevModel, nextModel, errorMessage, modelSwitchCount);

            // Invalidate context cache for congested model
            geminiContextCacheMap.delete(`${prevModel}_${currentApiKey.slice(-6)}_${getCoreSystemInstruction(settings.targetLanguage, forceParagraphMode ? 'paragraph' : 'default').length}`);

            // Small adaptive delay and immediately continue with new model and current target batch
            await delay(1200);
            continue;
          }
        }

        overloadRetries++;
        if (overloadRetries <= 2) {
          await delay(Math.min(overloadWaitMs, 10000));
          continue;
        }
      }

      const isOverloaded = errorMessage.includes('503') || errorMessage.includes('overloaded') || errorMessage.includes('unavailable');
      if (isOverloaded) {
          overloadRetries++;
          await delay(overloadWaitMs);
          continue; 
      }

      if (errorMessage.includes("429")) {
        keyManager.markCurrentAsRateLimited();
        if (onKeyRateLimit && currentApiKey) onKeyRateLimit(currentApiKey);
        if (!keyManager.hasAvailableKeys()) throw new Error("429 Quota Exhausted");
        await delay(1000); 
        continue;
      }

      if (
        errorMessage.includes('Invalid model response') ||
        errorMessage.includes('JSON') ||
        errorMessage.includes('Empty response') ||
        errorMessage.includes('missing ids') ||
        errorMessage.includes('unexpected id') ||
        errorMessage.includes('repeated translations')
      ) {
        validationRetries++;
      }
      attempt++;

      if (settings.aiProvider === 'gemini') {
        currentTargetBatch = effectiveTargetBatch.filter(b => !accumulatedValidResponses.has(b.id));

        // Soft-fill if retry budget exhausted
        if (attempt >= totalAllowedAttempts || validationRetries >= maxRetries) {
          if (accumulatedValidResponses.size > 0) {
            for (const block of effectiveTargetBatch) {
              if (!accumulatedValidResponses.has(block.id)) {
                accumulatedValidResponses.set(block.id, block.previousTranslatedText?.trim() || block.text);
              }
            }
            const fallbackResponses: BatchResponse[] = effectiveTargetBatch.map(b => ({
              id: b.id,
              translatedText: accumulatedValidResponses.get(b.id)!
            }));
            if (cachedResponsesFromTM.length > 0) {
              return [...cachedResponsesFromTM, ...fallbackResponses].sort((a, b) => a.id - b.id);
            }
            return fallbackResponses;
          }
        }
      }

      await delay(baseDelay * Math.pow(1.5, attempt));
    }
  }

  if (settings.aiProvider === 'gemini' && accumulatedValidResponses.size > 0) {
    for (const block of effectiveTargetBatch) {
      if (!accumulatedValidResponses.has(block.id)) {
        accumulatedValidResponses.set(block.id, block.previousTranslatedText?.trim() || block.text);
      }
    }
    const fallbackResponses: BatchResponse[] = effectiveTargetBatch.map(b => ({
      id: b.id,
      translatedText: accumulatedValidResponses.get(b.id)!
    }));
    if (cachedResponsesFromTM.length > 0) {
      return [...cachedResponsesFromTM, ...fallbackResponses].sort((a, b) => a.id - b.id);
    }
    return fallbackResponses;
  }

  throw new Error("Batch processing failed after retries.");
};


export const retranslateSelectedBlocks = async (
  targetBatch: BatchRequest[],
  contextPre: BatchRequest[],
  contextPost: BatchRequest[],
  settings: AppSettings,
  onKeyRateLimit?: (key: string) => void,
  signal?: AbortSignal
): Promise<BatchResponse[]> => {
  let attempt = 0;
  let validationRetries = 0;
  const { maxRetries, baseDelay, overloadWaitMs } = APP_CONFIG.retryConfig;
  const targetIds = targetBatch.map(block => block.id);
  const userPrompt = buildSelectedRetranslationPrompt(targetBatch, contextPre, contextPost);
  const systemInstruction = getSystemInstruction(
    settings.tone,
    settings.topic,
    settings.customPrompt,
    settings.outputStandard,
    settings.glossary,
    settings.doNotTranslateTerms,
    settings.targetLanguage,
    'default',
    settings.aiProvider
  );

  const baseModel = getResolvedGeminiModel(settings.model);
  const initialChain = settings.aiProvider === 'gemini'
    ? getActiveGeminiFallbackChain(baseModel)
    : [baseModel];

  let currentModelName = initialChain[0] || baseModel;
  let modelSwitchCount = 0;

  const keyManager = new APIKeyManager(settings.apiKeys);
  const totalAllowedAttempts = maxRetries + settings.apiKeys.length * 2;

  while (attempt < totalAllowedAttempts) {
    let currentApiKey = '';
    try {
      if (isFreeProvider(settings.aiProvider)) {
        const translations = await Promise.all(targetBatch.map(async block => ({ id: block.id, translatedText: await translateWithFreeProvider(block.text, settings) })));
        return validateBatchResponse(targetIds, translations);
      }

      if (settings.aiProvider === 'lm_studio') {
        signal?.throwIfAborted();
        const lmStudioRetryPrompt = `${userPrompt}

STRICT JSON OUTPUT MANDATE:
- Output MUST be strictly and exclusively a raw JSON array matching [{"id": number, "translatedText": "..."}].
- Absolutely NO introductory or concluding text, conversation, notes, or explanations before or after the array.
- Absolutely NO markdown code blocks, backticks, or formatting (strictly NO \`\`\` or \`\`\`json).
- Stop output immediately after the closing bracket ] of the JSON array.`;
        const text = await callLmStudioChat(settings, systemInstruction, lmStudioRetryPrompt);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      if (settings.aiProvider === 'openai_compatible') {
        const service = getActiveOpenAICompatibleService(settings);
        const text = await callOpenAICompatibleChat(service, Math.max(0.2, settings.temperature - 0.1), systemInstruction, `${userPrompt}\n\nReturn ONLY a JSON array, with no markdown.`);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      currentApiKey = keyManager.getActiveKey();
      const ai = createGeminiClient(currentApiKey);

      // Dynamic temperature for Gemini retranslation (validationRetries + 1 ensures disciplined focus)
      const geminiTemp = getGeminiTemperature(
        settings.temperature,
        settings.topic,
        settings.tone,
        settings.model,
        validationRetries + 1
      );

      // Apply Core/Dynamic separation and Context Caching for Gemini retranslation
      const coreInstruction = getCoreSystemInstruction(settings.targetLanguage, 'default');
      const dynamicInstruction = getDynamicSystemInstruction(
        settings.tone,
        settings.topic,
        settings.customPrompt,
        settings.outputStandard,
        settings.glossary,
        settings.doNotTranslateTerms,
        settings.targetLanguage
      );

      let cachedContentName: string | null = null;
      try {
        cachedContentName = await getOrEstablishGeminiCache(ai, currentModelName, currentApiKey, coreInstruction, signal);
      } catch {
        cachedContentName = null;
      }

      const generateConfig: any = {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: geminiTemp,
        safetySettings: SAFETY_SETTINGS,
      };

      // Disable heavy thinking/reasoning overhead on 3.8 and 3.7 flash models to avoid 503 high demand & latency
      if (currentModelName.includes('3.8-flash') || currentModelName.includes('3.7-flash')) {
        generateConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      let contents = userPrompt;
      if (cachedContentName) {
        generateConfig.cachedContent = cachedContentName;
        if (dynamicInstruction) {
          contents = `--- DYNAMIC RULES ---\n${dynamicInstruction}\n\n${userPrompt}`;
        }
      } else {
        generateConfig.systemInstruction = systemInstruction;
      }

      let response: any;
      try {
        response = await ai.models.generateContent({
          model: currentModelName,
          contents: contents,
          config: generateConfig,
        });
      } catch (err: any) {
        if (cachedContentName) {
          geminiContextCacheMap.delete(`${currentModelName}_${currentApiKey.slice(-6)}_${coreInstruction.length}`);
          response = await ai.models.generateContent({
            model: currentModelName,
            contents: userPrompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: responseSchema,
              temperature: geminiTemp,
              safetySettings: SAFETY_SETTINGS,
            },
          });
        } else {
          throw err;
        }
      }

      if (!response.text) throw new Error("Empty selected retranslation response from Gemini");
      return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(response.text)));
    } catch (error: any) {
      if (isAbortError(error, signal)) throw error;
      const errorMessage = extractErrorDetails(error);
      if (settings.aiProvider === 'lm_studio' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('lm studio'))) {
        throw new Error('⚠️ اتصال به LM Studio برقرار نشد. Local Server را در LM Studio روشن کنید و آدرس/نام مدل را بررسی کنید.');
      }
      if (settings.aiProvider === 'openai_compatible' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('openai') || errorMessage.includes('compatible') || errorMessage.includes('401') || errorMessage.includes('404'))) {
        const service = settings.openAICompatibleServices.find(item => item.id === settings.activeOpenAICompatibleServiceId) || settings.openAICompatibleServices[0];
        throw new Error(getOpenAICompatibleFriendlyError(error, service?.name));
      }
      if (errorMessage.includes('fetch failed') || errorMessage.includes('location')) throw new Error(getFriendlyErrorMessage(error, currentModelName));
      
      if (settings.aiProvider === 'gemini' && isModelOverloadedError(errorMessage)) {
        blacklistModelInSession(currentModelName);
        if (modelSwitchCount < MAX_MODEL_FALLBACK_SWITCHES) {
          const nextChain = getActiveGeminiFallbackChain(baseModel);
          const nextModel = nextChain.find(m => m !== currentModelName);
          if (nextModel && nextModel !== currentModelName) {
            const prevModel = currentModelName;
            currentModelName = nextModel;
            modelSwitchCount++;
            notifyModelFallback(prevModel, nextModel, errorMessage, modelSwitchCount);
            await delay(1200);
            continue;
          }
        }
        await delay(overloadWaitMs);
        continue;
      }
      if (errorMessage.includes('503') || errorMessage.includes('overloaded') || errorMessage.includes('unavailable')) {
        await delay(overloadWaitMs);
        continue;
      }
      if (errorMessage.includes("429")) {
        keyManager.markCurrentAsRateLimited();
        if (onKeyRateLimit && currentApiKey) onKeyRateLimit(currentApiKey);
        if (!keyManager.hasAvailableKeys()) throw new Error("429 Quota Exhausted");
        await delay(1000);
      } else {
        if (
          errorMessage.includes('Invalid model response') ||
          errorMessage.includes('JSON') ||
          errorMessage.includes('Empty') ||
          errorMessage.includes('missing ids') ||
          errorMessage.includes('unexpected id') ||
          errorMessage.includes('repeated translations')
        ) {
          validationRetries++;
        }
        attempt++;
        await delay(baseDelay * Math.pow(1.5, attempt));
      }
    }
  }

  throw new Error("Selected retranslation failed after retries.");
};

export const translateFreeText = async (text: string, settings: AppSettings, targetLang: TargetLanguage = 'fa'): Promise<string> => {
    if (!text || !text.trim()) return '';
    if (isFreeProvider(settings.aiProvider)) return translateWithFreeProvider(text, settings);
    if (settings.aiProvider === 'lm_studio') {
        return callLmStudioChat(settings, `${LANGUAGE_PROMPTS[targetLang]}\n${targetLang === 'fa' ? 'Use natural Persian.' : 'Use natural target-language grammar and style.'}`, `${text}\n\nReturn only the translated text.`);
    }
    if (settings.aiProvider === 'openai_compatible') {
        const service = getActiveOpenAICompatibleService(settings);
        return callOpenAICompatibleChat(service, settings.temperature, `${LANGUAGE_PROMPTS[targetLang]}\n${targetLang === 'fa' ? 'Use natural Persian.' : 'Use natural target-language grammar and style.'}`, `${text}\n\nReturn only the translated text.`);
    }
    const ai = createGeminiClient(new APIKeyManager(settings.apiKeys).getActiveKey());
    const modelName = getResolvedGeminiModel(settings.model);
    const response = await ai.models.generateContent({
        model: modelName,
        contents: text,
        config: {
            systemInstruction: `${LANGUAGE_PROMPTS[targetLang]}\nTone: ${settings.tone}. Native flow, no translationese.`,
            temperature: settings.temperature,
            safetySettings: SAFETY_SETTINGS,
        },
    });
    return response.text || '';
};

/** Dedicated raw tagged call used only by the opt-in Skeleton STR method. */
export const translateSkeletonPayload = async (content: string, settings: AppSettings, signal?: AbortSignal): Promise<string> => {
  const isSubtitleTranslator = settings.translationMethod === 'subtitle_translator';
  let systemInstruction: string;
  if (isSubtitleTranslator) {
    systemInstruction = getSubtitleTranslatorSystemInstruction(settings, settings.targetLanguage);
  } else {
    // Reuse the app-wide tone, topic, glossary, protected terms, custom prompt and
    // output-standard rules, then override only the wire format for Skeleton STR.
    const styleInstruction = getSystemInstruction(
      settings.tone,
      settings.topic,
      settings.customPrompt,
      settings.outputStandard,
      settings.glossary,
      settings.doNotTranslateTerms,
      settings.targetLanguage,
      'skeleton_str',
      settings.aiProvider
    );
  const persianOrthographyInstruction = settings.targetLanguage === 'fa'
    ? '\nFor Persian output, preserve and use the real zero-width non-joiner (U+200C) wherever Persian orthography requires it. Write, for example, می‌رود, نمی‌دانم, کتاب‌ها, بهینه‌تر, and برنامه‌نویسی; never replace the half-space with a normal space, hyphen, tatweel, or nothing.'
    : '';
    systemInstruction = `${styleInstruction}\n\n--- Skeleton STR response contract ---\nTranslate into the configured target language with natural, human, professional subtitle writing. Preserve meaning, context, tone and speaker intent; avoid literal/word-for-word or machine-like phrasing.${persianOrthographyInstruction}\nReturn ONLY the numbered [TRANSLATE_X]...[/TRANSLATE_X] tags requested by the user. Do not return JSON, explanations, markdown, or any extra text.`;
  }
  if (isFreeProvider(settings.aiProvider)) return translateTaggedPayloadWithFreeProvider(content, settings, signal);
  if (settings.aiProvider === 'lm_studio') return callLmStudioChat(settings, systemInstruction, content, signal);
  if (settings.aiProvider === 'openai_compatible') return callOpenAICompatibleChat(getActiveOpenAICompatibleService(settings), settings.temperature, systemInstruction, content, signal);
  signal?.throwIfAborted();
  const ai = createGeminiClient(new APIKeyManager(settings.apiKeys).getActiveKey());
  const modelName = getResolvedGeminiModel(settings.model);
  const response = await ai.models.generateContent({ model: modelName, contents: content, config: { systemInstruction, temperature: settings.temperature, safetySettings: SAFETY_SETTINGS } });
  signal?.throwIfAborted();
  return response.text || '';
};
