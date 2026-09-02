
import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { BatchRequest, BatchResponse, AppSettings, UserAPIKey, TargetLanguage, OpenAICompatibleService, TranslationDiagnostic } from "../types";
import { APP_CONFIG, getSystemInstruction, LANGUAGE_PROMPTS } from "../constants";
import { SKELETON_STR_PERSIAN_ORTHOGRAPHY_INSTRUCTION } from "./methods/skeleton_str";

const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.INTEGER, description: "The exact ID from the input block" },
      translatedText: { type: Type.STRING, description: "The translation text in the configured target language" }
    },
    required: ["id", "translatedText"]
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

TARGET BLOCKS TO RETRANSLATE:
${toSelectedRetranslationItems(targetBatch)}

FUTURE CONTEXT (reference only; do not return these IDs):
${contextPost.length ? toMarkedSubtitleParagraph(contextPost) : 'N/A'}

Retranslation goals:
- Use Previous Persian only as a reference; freely improve it when it is incomplete, awkward, inconsistent, too literal, or machine-like.
- Preserve meaning, speaker intent, tone, and continuity with surrounding subtitles.
- Return ONLY the target IDs listed above, every target ID exactly once.
- Keep the result concise and subtitle-friendly: max 2 lines, no markdown, no explanations, no raw markers.

Return ONLY a valid JSON array: [{"id": number, "translatedText": "..."}].`;


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
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.lmStudioModel || 'local-model',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ],
      temperature: settings.temperature,
      stream: false
    }),
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

export const buildContextualTranslationPrompt = (
  targetBatch: BatchRequest[],
  contextPre: BatchRequest[],
  contextPost: BatchRequest[],
  useParagraphMode: boolean
): string => {
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
- The LAST item in PAST CONTEXT immediately precedes TARGET BATCH in dialogue.
- If the first item of TARGET BATCH continues a sentence, clause, or conversational thought from the last item of PAST CONTEXT, you MUST ensure that its grammar, verb tense, pronouns, and tone (formal/colloquial) connect seamlessly with the previous translation, without abrupt cuts or grammatical orphans.`;
    }
    prompt += `

TARGET BATCH (Translate these):
${JSON.stringify(targetBatch)}`;
    if (contextPost.length > 0) prompt += `

FUTURE CONTEXT (Study for flow):
${JSON.stringify(contextPost)}`;
    prompt += `

Task: Translate TARGET BATCH into the configured target language.
Ensure the flow matches the scenario. Use "Tehrani Spoken" rules if conversational.
Return JSON array matching the schema.`;
    return prompt;
  }

  let prompt = `--- HIGH QUALITY PARAGRAPH SUBTITLE TRANSLATION PROTOCOL ---
`;
  prompt += `You will receive subtitle blocks as one continuous marked paragraph. Read the whole passage first to understand topic, speaker intent, pronouns, references, and emotional flow.
`;
  prompt += `Each target block starts with a marker like ⟦123⟧. Treat every marker as a HARD subtitle cue boundary. Keep the exact IDs in your final JSON so the app can place each translation back into its original timing.
`;
  if (contextPre.length > 0) {
    prompt += `
PAST CONTEXT (reference only; do not translate these IDs):
${toMarkedSubtitleParagraph(contextPre)}

CRITICAL BOUNDARY CONTINUITY & SEAMLESS STITCHING:
- The last cue in PAST CONTEXT immediately precedes the first cue of TARGET MARKED PARAGRAPH.
- If the first target cue continues a sentence, clause, or thought from that last cue, stitch it seamlessly with matching grammar, person/pronouns, and tone.
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
  if (msg.includes('location') || msg.includes('region') || msg.includes('403')) {
    return '⛔ خطای تحریم (IP): گوگل اجازه دسترسی نمی‌دهد. لطفاً VPN خود را روشن یا سرور آن را تغییر دهید.';
  }
  if (msg.includes('fetch failed') || msg.includes('network')) {
    return '⚠️ خطای شبکه: اتصال به سرور گوگل مسدود شده است.';
  }
  if (msg.includes('429') || msg.includes('quota')) {
    return 'پایان اعتبار (429): سقف استفاده از کلید API پر شده است.';
  }
  if (msg.includes('503') || msg.includes('overloaded')) {
    return 'خطای سرور گوگل (503): مدل موقتاً شلوغ است. در حال تلاش مجدد...';
  }
  return `خطای سیستمی: ${msg.substring(0, 100)}...`;
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

  if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('service unavailable')) {
    return {
      code: 'model_overloaded',
      severity: 'warning',
      title: 'مدل موقتاً شلوغ یا در دسترس نیست',
      cause: `سرویس ${providerName} با خطای ازدحام یا عدم دسترسی موقت پاسخ داده است.`,
      recovery: 'پروژه متوقف شده تا داده‌ها حفظ شوند. چند دقیقه صبر کنید، مدل سبک‌تر انتخاب کنید یا ادامه ترجمه را بزنید.',
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
  if (!apiKey) return false;
  try {
     const ai = new GoogleGenAI({ apiKey: apiKey });
     await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Hi' });
     return true;
  } catch (e: any) {
     const errorMessage = extractErrorDetails(e);
     return errorMessage.includes("429");
  }
};

export const diagnoseConnection = async (apiKey?: string, settings?: AppSettings): Promise<string | null> => {
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
        if (!apiKey) return 'هیچ کلید API معتبری یافت نشد.';
        const ai = new GoogleGenAI({ apiKey: apiKey });
        await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'ping' });
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
        return getFriendlyErrorMessage(e, 'gemini-2.5-flash');
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
  let overloadRetries = 0; 
  const { maxRetries, baseDelay, overloadWaitMs } = APP_CONFIG.retryConfig;

  let modelName = APP_CONFIG.geminiModels.standard;
  if (settings.model === 'professional') modelName = APP_CONFIG.geminiModels.professional;
  else if (settings.model === 'flash') modelName = APP_CONFIG.geminiModels.flash;
  else if (settings.model === 'flash_lite') modelName = APP_CONFIG.geminiModels.flash_lite;

  const keyManager = new APIKeyManager(settings.apiKeys);
  const totalAllowedAttempts = maxRetries + settings.apiKeys.length * 2;
  const targetIds = targetBatch.map(block => block.id);
  
  while (attempt < totalAllowedAttempts) {
    let currentApiKey = '';
    try {
      if (settings.aiProvider === 'gemini') {
        currentApiKey = keyManager.getActiveKey();
      }

      // Local/OpenAI-compatible models usually translate better when subtitle fragments are sent
      // as one marked paragraph instead of isolated JSON rows.
      const promptMethod = forceParagraphMode || settings.aiProvider !== 'gemini' ? 'paragraph' : 'default';
      const userPrompt = buildContextualTranslationPrompt(
        targetBatch,
        contextPre,
        contextPost,
        promptMethod === 'paragraph'
      );

      const systemInstruction = getSystemInstruction(
        settings.tone, 
        settings.topic, 
        settings.customPrompt, 
        settings.outputStandard,
        settings.glossary,
        settings.doNotTranslateTerms,
        settings.targetLanguage,
        promptMethod
      );

      if (isFreeProvider(settings.aiProvider)) {
        const translations = await Promise.all(targetBatch.map(async block => ({ id: block.id, translatedText: await translateWithFreeProvider(block.text, settings, signal) })));
        return validateBatchResponse(targetIds, translations);
      }

      if (settings.aiProvider === 'lm_studio') {
        signal?.throwIfAborted();
        const text = await callLmStudioChat(settings, systemInstruction, `${userPrompt}\n\nReturn ONLY a JSON array, with no markdown.`, signal);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      if (settings.aiProvider === 'openai_compatible') {
        const service = getActiveOpenAICompatibleService(settings);
        signal?.throwIfAborted();
        const text = await callOpenAICompatibleChat(service, settings.temperature, systemInstruction, `${userPrompt}\n\nReturn ONLY a JSON array, with no markdown.`, signal);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      signal?.throwIfAborted();
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: settings.temperature,
          safetySettings: SAFETY_SETTINGS,
        },
      });

      signal?.throwIfAborted();
      if (!response.text) throw new Error("Empty response from Gemini");

      return validateBatchResponse(targetIds, JSON.parse(response.text));

    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      const errorMessage = extractErrorDetails(error);
      if (settings.aiProvider === 'lm_studio' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('lm studio'))) {
        throw new Error('⚠️ اتصال به LM Studio برقرار نشد. Local Server را در LM Studio روشن کنید و آدرس/نام مدل را بررسی کنید.');
      }
      if (settings.aiProvider === 'openai_compatible' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('openai') || errorMessage.includes('compatible') || errorMessage.includes('401') || errorMessage.includes('404'))) {
        const service = settings.openAICompatibleServices.find(item => item.id === settings.activeOpenAICompatibleServiceId) || settings.openAICompatibleServices[0];
        throw new Error(getOpenAICompatibleFriendlyError(error, service?.name));
      }
      if (errorMessage.includes('fetch failed') || errorMessage.includes('location')) throw new Error(getFriendlyErrorMessage(error, modelName));
      
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
      } else {
        attempt++;
        await delay(baseDelay * Math.pow(1.5, attempt));
      }
    }
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
    settings.targetLanguage
  );

  let modelName = APP_CONFIG.geminiModels.standard;
  if (settings.model === 'professional') modelName = APP_CONFIG.geminiModels.professional;
  else if (settings.model === 'flash') modelName = APP_CONFIG.geminiModels.flash;
  else if (settings.model === 'flash_lite') modelName = APP_CONFIG.geminiModels.flash_lite;

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
        const text = await callLmStudioChat(settings, systemInstruction, `${userPrompt}\n\nReturn ONLY a JSON array, with no markdown.`);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      if (settings.aiProvider === 'openai_compatible') {
        const service = getActiveOpenAICompatibleService(settings);
        const text = await callOpenAICompatibleChat(service, Math.max(0.2, settings.temperature - 0.1), systemInstruction, `${userPrompt}\n\nReturn ONLY a JSON array, with no markdown.`);
        return validateBatchResponse(targetIds, JSON.parse(extractJsonArray(text)));
      }

      currentApiKey = keyManager.getActiveKey();
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
          temperature: Math.max(0.2, settings.temperature - 0.1),
          safetySettings: SAFETY_SETTINGS,
        },
      });

      if (!response.text) throw new Error("Empty selected retranslation response from Gemini");
      return validateBatchResponse(targetIds, JSON.parse(response.text));
    } catch (error: any) {
      if (error?.name === 'AbortError') throw error;
      const errorMessage = extractErrorDetails(error);
      if (settings.aiProvider === 'lm_studio' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('lm studio'))) {
        throw new Error('⚠️ اتصال به LM Studio برقرار نشد. Local Server را در LM Studio روشن کنید و آدرس/نام مدل را بررسی کنید.');
      }
      if (settings.aiProvider === 'openai_compatible' && (errorMessage.includes('fetch failed') || errorMessage.includes('failed to fetch') || errorMessage.includes('openai') || errorMessage.includes('compatible') || errorMessage.includes('401') || errorMessage.includes('404'))) {
        const service = settings.openAICompatibleServices.find(item => item.id === settings.activeOpenAICompatibleServiceId) || settings.openAICompatibleServices[0];
        throw new Error(getOpenAICompatibleFriendlyError(error, service?.name));
      }
      if (errorMessage.includes('fetch failed') || errorMessage.includes('location')) throw new Error(getFriendlyErrorMessage(error, modelName));
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
    const ai = new GoogleGenAI({ apiKey: new APIKeyManager(settings.apiKeys).getActiveKey() });
    const response = await ai.models.generateContent({
        model: APP_CONFIG.geminiModels.standard,
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
    settings.translationMethod === 'subtitle_translator' ? 'subtitle_translator' : 'skeleton_str'
  );
  const persianOrthographyInstruction = settings.targetLanguage === 'fa'
    ? '\nFor Persian output, preserve and use the real zero-width non-joiner (U+200C) wherever Persian orthography requires it. Write, for example, می‌رود, نمی‌دانم, کتاب‌ها, بهینه‌تر, and برنامه‌نویسی; never replace the half-space with a normal space, hyphen, tatweel, or nothing.'
    : '';
  const systemInstruction = `${styleInstruction}\n\n--- ${settings.translationMethod === 'subtitle_translator' ? 'Subtitle Translator' : 'Skeleton STR'} response contract ---\nTranslate into the configured target language with natural, human, professional subtitle writing. Preserve meaning, context, tone and speaker intent; avoid literal/word-for-word or machine-like phrasing.${persianOrthographyInstruction}\nReturn ONLY the numbered [TRANSLATE_X]...[/TRANSLATE_X] tags requested by the user. Do not return JSON, explanations, markdown, or any extra text.`;
  if (isFreeProvider(settings.aiProvider)) return translateTaggedPayloadWithFreeProvider(content, settings, signal);
  if (settings.aiProvider === 'lm_studio') return callLmStudioChat(settings, systemInstruction, content, signal);
  if (settings.aiProvider === 'openai_compatible') return callOpenAICompatibleChat(getActiveOpenAICompatibleService(settings), settings.temperature, systemInstruction, content, signal);
  signal?.throwIfAborted();
  const ai = new GoogleGenAI({ apiKey: new APIKeyManager(settings.apiKeys).getActiveKey() });
  const response = await ai.models.generateContent({ model: APP_CONFIG.geminiModels.standard, contents: content, config: { systemInstruction, temperature: settings.temperature, safetySettings: SAFETY_SETTINGS } });
  signal?.throwIfAborted();
  return response.text || '';
};
