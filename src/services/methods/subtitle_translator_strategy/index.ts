/** Subtitle Translator Strategy phases 1 and 2. This module intentionally owns its parsing and
 * marker protocol so existing translation methods remain untouched. */
export type SubtitleTranslatorFileType = 'srt' | 'vtt' | 'sbv' | 'lrc' | 'ass';
export interface SubtitleTranslatorSplit { fileType: SubtitleTranslatorFileType; originalLines: string[]; contentLines: string[]; contentIndices: number[]; assContentStartIndex: number; lineEnding?: '\n' | '\r\n'; }
export interface AssPrepared { cleanLine: string; leadingTags: string; breaks: string[]; verbatim?: string; }

const TIMECODE = /^(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}[ \t]+-->[ \t]+(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}/;
const SBV = /^\d+:\d{2}:\d{2}\.\d{1,3},\d+:\d{2}:\d{2}\.\d{1,3}$/;
const LRC = /^\[\d{2}:\d{2}(?:\.\d{2,3})?\]/;
const invisible = /[\s\u200B\u200C\u200D\u2060\uFEFF]/g;
const PERSIAN_HALF_SPACE = '\u200C';
export const isBlankTarget = (value: string) => value.replace(invisible, '') === '';

export const detectSubtitleTranslatorFileType = (text: string): SubtitleTranslatorFileType => {
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

export const filterSubLines = (originalLines: string[], fileType: SubtitleTranslatorFileType): Omit<SubtitleTranslatorSplit, 'fileType'> => {
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

export const splitSubtitleTranslatorSkeleton = (text: string): SubtitleTranslatorSplit => { const originalLines = text.replace(/\r\n?/g, '\n').split('\n'); const fileType = detectSubtitleTranslatorFileType(text); const lineEnding = /\r\n/.test(text) ? '\r\n' : '\n'; return { fileType, ...filterSubLines(originalLines, fileType), lineEnding }; };

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

export interface SubtitleTranslatorPayloadOptions {
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

export const buildContextPayload = (lines: string[], start: number, end: number, window = 40, options: SubtitleTranslatorPayloadOptions = {}): string => {
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

export {
  normalizeSubtitleTranslatorPersianHalfSpaces,
  normalizePersianChars,
  cleanHalfSpaceArtifacts,
  PERSIAN_HALF_SPACE
} from './orthography';

export {
  SUBTITLE_TRANSLATOR_PERSIAN_ORTHOGRAPHY_INSTRUCTION,
  SUBTITLE_TRANSLATOR_FEW_SHOT_EXAMPLES,
  getSubtitleTranslatorToneInstruction,
  getSubtitleTranslatorSystemInstruction,
  buildSubtitleTranslatorUserPrompt
} from './prompts';

export {
  cleanTranslatedSlot,
  extractSubtitleTranslatorLinesByMarkerIds,
  extractSubtitleTranslatorLinesByMarkerIds as extractTranslatedLinesByMarkerIds,
  extractTranslatedLinesWithNumbers
} from './parser';

export const SUBTITLE_TRANSLATOR_SYSTEM_PROMPT = 'You are a professional subtitle translator. Respond only with the tagged lines. Do not add explanations, comments, markdown fences, or any extra text.';

export interface SubtitleTranslatorRestoreOptions {
  bilingual?: boolean;
  failures?: ReadonlySet<number>;
  lineEnding?: '\n' | '\r\n';
}

const findPreviousTimingLine = (lines: string[], index: number, type: SubtitleTranslatorFileType): number => {
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
export const restoreSubtitleTranslatorSkeleton = (split: SubtitleTranslatorSplit, translatedLines: string[], options: SubtitleTranslatorRestoreOptions = {}): string => {
  if (translatedLines.length !== split.contentLines.length) throw new Error('Subtitle Translator Strategy restore requires one translated slot per source line.');
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
