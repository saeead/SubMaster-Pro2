/** Skeleton STR phases 1 and 2. This module intentionally owns its parsing and
 * marker protocol so existing translation methods remain untouched. */
export type SkeletonFileType = 'srt' | 'vtt' | 'sbv' | 'lrc' | 'ass';
export interface SkeletonSplit { fileType: SkeletonFileType; originalLines: string[]; contentLines: string[]; contentIndices: number[]; assContentStartIndex: number; lineEnding?: '\n' | '\r\n'; }
export interface AssPrepared { cleanLine: string; leadingTags: string; breaks: string[]; verbatim?: string; }

const TIMECODE = /^(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}[ \t]+-->[ \t]+(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}/;
const SBV = /^\d+:\d{2}:\d{2}\.\d{1,3},\d+:\d{2}:\d{2}\.\d{1,3}$/;
const LRC = /^\[\d{2}:\d{2}(?:\.\d{2,3})?\]/;
const invisible = /[\s\u200B\u200C\u200D\u2060\uFEFF]/g;
const PERSIAN_HALF_SPACE = '\u200C';
export const isBlankTarget = (value: string) => value.replace(invisible, '') === '';

export const detectSkeletonFileType = (text: string): SkeletonFileType => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sample = lines.filter(line => line.trim()).slice(0, 50);
  if (sample[0]?.trim() === 'WEBVTT') return 'vtt';
  const arrows = sample.filter(line => TIMECODE.test(line.trim())).length;
  const sbv = sample.filter(line => SBV.test(line.trim())).length;
  const ass = sample.filter(line => /^Dialogue:\s*[^,]+,\s*[^,]+,\s*[^,]+,/i.test(line) || /^\[Script Info\]$/i.test(line.trim())).length;
  if (ass > arrows && ass > sbv && ass > 0) return 'ass';
  if (arrows) return 'srt';
  if (!arrows && !sbv && sample.some(line => LRC.test(line.trim()))) return 'lrc';
  if (sbv) return 'sbv';
  throw new Error('Unsupported subtitle format: no recognizable subtitle content was found.');
};

const isCueNumber = (lines: string[], index: number, lastSequence: number): boolean => {
  if (!/^\d+$/.test(lines[index].trim()) || !TIMECODE.test((lines[index + 1] || '').trim())) return false;
  const previousBlank = index === 0 || lines[index - 1].trim() === '';
  return previousBlank || Number(lines[index].trim()) === lastSequence + 1;
};

export const filterSubLines = (originalLines: string[], fileType: SkeletonFileType): Omit<SkeletonSplit, 'fileType'> => {
  const contentLines: string[] = [], contentIndices: number[] = [];
  const push = (line: string, index: number) => { if (!isBlankTarget(line)) { contentLines.push(line); contentIndices.push(index); } };
  if (fileType === 'ass') {
    let inEvents = false, start = 9;
    for (const line of originalLines) { if (/^\[Events\]$/i.test(line.trim())) inEvents = true; if (inEvents && /^Format:/i.test(line.trim())) { start = Math.max(0, line.slice(line.indexOf(':') + 1).split(',').length - 1); break; } }
    if (start === 9) { const commas = originalLines.filter(line => /^Dialogue:/i.test(line)).slice(0, 100).map(line => (line.match(/,/g) || []).length); if (commas.length) start = Math.min(...commas); }
    originalLines.forEach((line, index) => { if (/^Dialogue:/i.test(line.trim())) { const body = line.slice(line.indexOf(':') + 1); const text = body.split(',').slice(start).join(','); if (!isBlankTarget(text)) { contentLines.push(text); contentIndices.push(index); } } });
    return { originalLines, contentLines, contentIndices, assContentStartIndex: start };
  }
  if (fileType === 'lrc') { originalLines.forEach((line, index) => { const lyric = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').replace(/<\d{2}:\d{2}(?:\.\d{2,3})?>/g, ''); if (!isBlankTarget(lyric)) { contentLines.push(lyric); contentIndices.push(index); } }); return { originalLines, contentLines, contentIndices, assContentStartIndex: 9 }; }
  let started = false, lastSequence = 0, skippingVttBlock = false;
  originalLines.forEach((line, index) => {
    const trimmed = line.trim(); const boundary = index === 0 || originalLines[index - 1].trim() === '';
    if (fileType === 'vtt') {
      if (boundary && /^(NOTE|STYLE|REGION)(?:\s|$)/.test(trimmed)) skippingVttBlock = true;
      if (skippingVttBlock && TIMECODE.test(trimmed)) skippingVttBlock = false;
      if (skippingVttBlock || trimmed === 'WEBVTT' || /^X-TIMESTAMP-MAP/i.test(trimmed)) return;
      if (TIMECODE.test(trimmed)) { started = true; return; }
      if (started && trimmed && TIMECODE.test((originalLines[index + 1] || '').trim()) && boundary) return;
    } else if (fileType === 'sbv') { if (SBV.test(trimmed)) { started = true; return; } }
    else { if (isCueNumber(originalLines, index, lastSequence)) { lastSequence = Number(trimmed); return; } if (TIMECODE.test(trimmed)) { started = true; return; } }
    if (started && trimmed && !(fileType === 'sbv' && SBV.test(trimmed))) push(fileType === 'vtt' ? line.replace(/<\/?c\b[^>]*>/gi, '').replace(/<\d+:\d{2}:\d{2}\.\d{1,3}>/g, '') : line, index);
  });
  return { originalLines, contentLines, contentIndices, assContentStartIndex: 9 };
};

export const splitSkeleton = (text: string): SkeletonSplit => { const originalLines = text.replace(/\r\n?/g, '\n').split('\n'); const fileType = detectSkeletonFileType(text); const lineEnding = /\r\n/.test(text) ? '\r\n' : '\n'; return { fileType, ...filterSubLines(originalLines, fileType), lineEnding }; };

export const prepareAssForTranslation = (line: string): AssPrepared => {
  if (/\{\\p[1-9]\}/i.test(line)) return { cleanLine: '', leadingTags: '', breaks: [], verbatim: line };
  const leading = line.match(/^(?:\{[^}]*\})+/)?.[0] || ''; const breaks: string[] = [];
  let clean = line.slice(leading.length).replace(/(?:\{[^}]*\})*\\[Nn](?:\{[^}]*\})*/g, match => `###${breaks.push(match) - 1}###`).replace(/\{[^}]*\}/g, '');
  if (!clean.replace(/###\d+###/g, '').match(/\p{L}/u)) return { cleanLine: '', leadingTags: '', breaks: [], verbatim: line };
  return { cleanLine: clean, leadingTags: leading, breaks };
};
export const restoreAssAfterTranslation = (translation: string, prepared: AssPrepared): string => {
  if (prepared.verbatim !== undefined) return prepared.verbatim;
  let output = translation.replace(/[\r\n]+/g, '\\N');
  prepared.breaks.forEach((value, index) => { const exact = new RegExp(`###${index}###`, 'g'); const loose = new RegExp(`#\{1,3} ?${index} ?#\{1,3}`, 'g'); output = output.replace(exact, value).replace(loose, value); });
  return prepared.leadingTags + output.replace(/#{1,3} ?\d+ ?#{1,3}/g, '');
};

export interface SkeletonPayloadOptions {
  markerBase?: number;
  targetMarkerIds?: number[];
}

const normalizeForAlignment = (value: string): string => value
  .replace(/\[\/?(?:TRANSLATE(?:_\d+)?|TRANSLTranslate_\d+|CONTEXT)\]/g, '')
  .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Alignment may ignore invisible characters, but subtitle output must retain
// the real U+200C character supplied by the model.
const cleanTranslatedSlot = (value: string): string => value
  .replace(/\[\/?(?:TRANSLATE(?:_\d+)?|TRANSLTranslate_\d+|CONTEXT)\]/g, '')
  .replace(/^\s*[\[({«"']*\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*(?:--?>|<--|←|→)\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*[\])}»"']*\s*/g, '')
  .replace(/^\s*[\[({«"']+|[\])}»"']+\s*$/g, '')
  .replace(/[\u200B\u200D\u2060\uFEFF]/g, '')
  // Some providers return an escaped line break in their raw tagged response.
  // It is subtitle text, not JSON, so the escape is otherwise shown literally
  // as "\\n" in the editor.
  .replace(/\\[nNr]/g, ' ')
  .replace(/[\r\n]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const buildContextPayload = (lines: string[], start: number, end: number, window = 40, options: SkeletonPayloadOptions = {}): string => {
  const padding = Math.min(80, Math.max(1, Math.floor(window / 2)));
  const from = Math.max(0, start - padding);
  return lines
    .slice(from, Math.min(lines.length, end + padding))
    .map((line, relative) => {
      const absolute = from + relative;
      const markerId = absolute >= start && absolute < end
        ? options.targetMarkerIds?.[absolute - start] ?? (options.markerBase ?? 0) + absolute - start
        : undefined;
      return markerId !== undefined
        ? `[TRANSLATE_${markerId}]${line}[/TRANSLATE_${markerId}]`
        : `[CONTEXT]${line}[/CONTEXT]`;
    })
    .join('\n');
};

export const SKELETON_STR_SYSTEM_PROMPT = 'You are a professional subtitle translator. Respond only with the tagged lines. Do not add explanations, comments, markdown fences, or any extra text.';

/** Persian-only writing rules for Skeleton STR model responses. */
export const SKELETON_STR_PERSIAN_ORTHOGRAPHY_INSTRUCTION = `For Persian output, apply the Persian Academy's orthography consistently:
- Use the exact zero-width non-joiner character (U+200C), never a regular space, hyphen, or tatweel, in required compounds and affixes: می‌رود، نمی‌دانم، کتاب‌ها، نوشته‌ام، بزرگ‌تر، بهینه‌سازی، و فارسی‌زبان.
- Do not remove an existing required U+200C or attach words without it; write neither «می رود» nor «بهینهتر».
- Use standard Persian punctuation: no space before «،»، «؛»، «؟»، «!» or «.»; use one ordinary space after punctuation when another word follows.
- Use Persian ی and ک, apply the correct میانجیِ ی in اضافه constructions when needed, and avoid extra or missing spaces.
- Preserve these rules in every tagged line while keeping the subtitle concise and natural.`;

/**
 * Repairs common model substitutions for U+200C in Persian Skeleton STR output.
 * This is intentionally limited to unambiguous prefixes, suffixes, and compounds
 * so a malformed response cannot reach the subtitle formatter with a regular
 * space, hyphen, or tatweel in place of a required half-space.
 */
export const normalizeSkeletonPersianHalfSpaces = (value: string): string => value
  .replace(/ي/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/ـ+/g, PERSIAN_HALF_SPACE)
  .replace(/(می|نمی)(?:\s|\u200C)*(رود|دانم|دانی|داند|دانیم|دانید|دانند|شود|شوند|شوم|شویم|شوید|توانم|توانی|تواند|توانند|توانیم|توانید|کنم|کنی|کند|کنند|کنیم|کنید|باشم|باشی|باشد|باشند|باشیم|باشید)/gu, `$1${PERSIAN_HALF_SPACE}$2`)
  .replace(/(کتاب)(?:\s|-|ـ|\u200C)*(هایی|های|ها)/gu, `$1${PERSIAN_HALF_SPACE}$2`)
  .replace(/(بهینه|بزرگ|کوچک)(?:\s|-|ـ|\u200C)*(ترین|تر)/gu, `$1${PERSIAN_HALF_SPACE}$2`)
  .replace(/(برنامه|دست|کتاب|صفر|نیم|فارسی|بهینه)(?:\s|-|ـ|\u200C)*(نویس(?:ی)?|خانه|عرض|فاصله|زبان|سازی)/gu, `$1${PERSIAN_HALF_SPACE}$2`);
const TARGET_LANGUAGE_NAMES: Record<string, string> = {
  fa: 'Persian (Farsi)', en: 'English', ru: 'Russian', zh: 'Chinese', de: 'German', es: 'Spanish'
};
export const buildSkeletonUserPrompt = (content: string, count: number, targetLanguage = 'fa', expectedMarkerIds?: number[]): string => {
  const language = TARGET_LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  const markerRequirement = expectedMarkerIds?.length
    ? `Translate exactly these marker IDs and no others: ${expectedMarkerIds.map(id => `TRANSLATE_${id}`).join(', ')}.`
    : `Do NOT skip any numbers from 0 to ${count - 1}.`;
  return `Context: This is part of a subtitle file. First read the whole marked passage as one coherent paragraph so you understand the topic, speaker intent, pronouns, references, emotional flow, timestamps, and the best natural word choices in ${language}. Then translate every marked line into ${language}. Only translate the lines marked with [TRANSLATE_X][/TRANSLATE_X] tags. Use [CONTEXT][/CONTEXT] lines only for understanding.

CRITICAL REQUIREMENTS:
1. You MUST translate ALL ${count} lines marked with [TRANSLATE_X] tags into ${language}; never return an empty tag and never leave a requested marker untranslated
2. ${markerRequirement}
3. Keep the exact same marker IDs in the exact format: [TRANSLATE_X]translation[/TRANSLATE_X]
4. NEVER merge lines; retain one tag per source line.
5. Preserve the complete meaning of every line, but keep each subtitle concise and balanced for its timestamp duration. Do not summarize, omit details, or move content between tags; also do not overfill one tag while leaving another too short or empty.
6. Maintain seamless boundary continuity and grammar stitching with preceding [CONTEXT] lines: if the first [TRANSLATE_X] line continues a clause or sentence from an existing translation in [CONTEXT], match its verb tense, pronouns, and tone so the speech flows continuously without disjointed breaks.
7. Perform translation and quality review in this single request: before responding, internally verify every tagged output for target-language fluency, timing-appropriate subtitle length, terminology consistency, and no source-text leakage. Do not make a second pass or ask for another request.
8. If a source line includes a leading timestamp hint such as {00:00:01,000 --> 00:00:03,000}, use it only to fit subtitle length and context; do not include the timestamp hint in the translated text.
9. Do not answer in English unless English is the selected target language.

${content}`;
};

export const extractTranslatedLinesWithNumbers = (response: string, expectedCount: number, sourceLines: string[], contextLines: string[]): string[] => {
  const expectedIds = Array.from({ length: expectedCount }, (_, index) => index);
  if (expectedCount > 1 && !response.includes('[TRANSLATE_0]') && response.includes(`[TRANSLATE_${expectedCount}]`)) return Array(expectedCount).fill('');
  if (expectedCount > 1 && /\[TRANSLATE_\d+\]\s*\[\/TRANSLATE_\d+\]/.test(response)) return Array(expectedCount).fill('');
  return extractTranslatedLinesByMarkerIds(response, expectedIds, sourceLines, contextLines);
};

export const extractTranslatedLinesByMarkerIds = (response: string, expectedMarkerIds: number[], sourceLines: string[], contextLines: string[]): string[] => {
  const readSlots = (markerIds: number[]): string[] => {
    const slots = Array<string>(markerIds.length).fill('');
    const idToSlot = new Map(markerIds.map((id, index) => [id, index]));
    const pattern = /\[TRANSLATE_(\d+)\]([\s\S]*?)\[\/(?:TRANSLATE|TRANSLTranslate)_\1\]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(response))) {
      const slot = idToSlot.get(Number(match[1]));
      if (slot !== undefined && slots[slot] === '') slots[slot] = cleanTranslatedSlot(match[2]);
    }
    return slots;
  };

  let output = readSlots(expectedMarkerIds);
  // Some otherwise capable models renumber tags from zero despite being given
  // subtitle IDs. Accept that unambiguous response without issuing more API
  // calls; App maps the ordered slots back to the original subtitle IDs.
  if (!output.some(Boolean) && !expectedMarkerIds.every((id, index) => id === index)) {
    output = readSlots(Array.from({ length: expectedMarkerIds.length }, (_, index) => index));
  }

  // Older provider configurations may still follow the former JSON contract.
  // Decode that response locally instead of silently replacing every cue with
  // its source text. Tagged output remains the primary, documented protocol.
  if (!output.some(Boolean)) {
    try {
      const start = response.indexOf('[');
      const end = response.lastIndexOf(']');
      const parsed = JSON.parse(start >= 0 && end > start ? response.slice(start, end + 1) : response) as unknown;
      if (Array.isArray(parsed)) {
        const byId = new Map<number, string>();
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const id = Number((item as { id?: unknown }).id);
          const text = (item as { translatedText?: unknown }).translatedText;
          if (Number.isInteger(id) && typeof text === 'string' && !byId.has(id)) byId.set(id, cleanTranslatedSlot(text));
        }
        output = expectedMarkerIds.map((id, index) => byId.get(id) || byId.get(index) || '');
      }
    } catch {
      // This was neither a tagged response nor valid JSON; existing fallback
      // behavior keeps the original cue rather than corrupting the subtitle.
    }
  }

  const seen = new Map<string, number>();
  return output.map((value, index) => {
    if (!value) return '';
    const ownSource = normalizeForAlignment(sourceLines[index] || '');
    if (contextLines.some(context => normalizeForAlignment(context) === value) && ownSource !== value) return '';
    const duplicateSource = seen.get(value);
    if (duplicateSource !== undefined && normalizeForAlignment(sourceLines[duplicateSource] || '') !== normalizeForAlignment(sourceLines[index] || '')) return '';
    seen.set(value, index);
    return value;
  });
};

export interface SkeletonRestoreOptions {
  bilingual?: boolean;
  failures?: ReadonlySet<number>;
  lineEnding?: '\n' | '\r\n';
}

const findPreviousTimingLine = (lines: string[], index: number, type: SkeletonFileType): number => {
  const matcher = type === 'sbv' ? SBV : TIMECODE;
  for (let cursor = index - 1; cursor >= 0; cursor--) if (matcher.test(lines[cursor].trim())) return cursor;
  return -1;
};

const assPrefix = (line: string, contentStartIndex: number): string => {
  const colon = line.indexOf(':');
  const body = line.slice(colon + 1);
  return `${line.slice(0, colon + 1)}${body.split(',').slice(0, contentStartIndex).join(',')},`;
};

const lrcPrefix = (line: string): string => line.match(/^(?:\[\d{2}:\d{2}(?:\.\d{2,3})?\])+/)?.[0] || '';

/**
 * Phase 3: writes known translated slots into a copy of the source lines. It
 * never parses model output for cues, so model-shaped dialogue cannot alter
 * timings, cue IDs, headers, or block boundaries.
 */
export const restoreSkeleton = (split: SkeletonSplit, translatedLines: string[], options: SkeletonRestoreOptions = {}): string => {
  if (translatedLines.length !== split.contentLines.length) throw new Error('Skeleton STR restore requires one translated slot per source line.');
  const output = [...split.originalLines];
  const failures = options.failures || new Set<number>();
  const bilingualGroups = new Map<number, number[]>();

  split.contentIndices.forEach((physicalIndex, index) => {
    const source = split.contentLines[index];
    const translated = translatedLines[index];
    // I3/I4: an empty response must preserve the original physical line.
    if (!translated || isBlankTarget(translated)) return;
    if (options.bilingual && split.fileType !== 'ass' && split.fileType !== 'lrc') {
      const group = findPreviousTimingLine(split.originalLines, physicalIndex, split.fileType);
      const members = bilingualGroups.get(group) || [];
      members.push(index); bilingualGroups.set(group, members);
      return;
    }
    if (split.fileType === 'ass') {
      if (failures.has(index)) return;
      const restoredText = options.bilingual
        ? `${source}\\N${translated.replace(/^\{[^}]*\}/, '')}`
        : translated;
      output[physicalIndex] = `${assPrefix(split.originalLines[physicalIndex], split.assContentStartIndex)}${restoredText}`;
    } else if (split.fileType === 'lrc') {
      output[physicalIndex] = options.bilingual && !failures.has(index)
        ? `${lrcPrefix(split.originalLines[physicalIndex])}${source} / ${translated}`
        : `${lrcPrefix(split.originalLines[physicalIndex])}${translated}`;
    } else {
      output[physicalIndex] = translated;
    }
  });

  if (options.bilingual && split.fileType !== 'ass' && split.fileType !== 'lrc') {
    bilingualGroups.forEach((members) => {
      const successful = members.filter(index => !failures.has(index) && !isBlankTarget(translatedLines[index]));
      if (successful.length === 0) return;
      const first = split.contentIndices[members[0]];
      const originals = members.map(index => split.contentLines[index]);
      const translations = successful.map(index => translatedLines[index]);
      output[first] = [...originals, ...translations].join(options.lineEnding || split.lineEnding || '\n');
      members.slice(1).forEach(index => { output[split.contentIndices[index]] = ''; });
    });
  }

  const lineEnding = options.lineEnding || split.lineEnding || '\n';
  return output.join(lineEnding);
};
