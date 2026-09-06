/**
 * High-Resilience Tag Parser & Extractor for Subtitle Translator Strategy.
 * Designed to handle local LLM anomalies (unclosed tags, variations in tag syntax,
 * markdown wrappers, escaped line breaks, and renumbering) while ensuring 100% tag integrity.
 */

const invisibleChars = /[\u200B\u200D\u2060\uFEFF]/g;

export const normalizeForAlignment = (value: string): string => {
  if (!value) return '';
  return value
    .replace(/\[\/?(?:TRANSLATE(?:_\d+)?|TRANSLTranslate_\d+|CONTEXT)\]/gi, '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Strips tag artifacts, markdown wrappers, timestamp hints, and JSON escapes from a translated slot.
 * Carefully preserves the real Persian Zero-Width Non-Joiner (U+200C).
 */
export const cleanTranslatedSlot = (value: string): string => {
  if (!value) return '';
  return value
    // 1. Strip any opening/closing/broken translate or context tags
    // Supports square brackets [ ], angle brackets < >, and malformed tag combinations like [TRANSLATE_6> or [/TRANSLATE_6>
    .replace(/[\[<]\/?(?:TRANSLATE(?:[_\s:-]*\d+)?|TRANSLTranslate_\d+|CONTEXT)[\]>]/gi, '')
    // 2. Strip dangling tag fragments at the start or end of text
    .replace(/[\[<]\/?(?:TRANSLATE|CONTEXT)[_\s:-]*\d*.*$/gim, '')
    .replace(/^[\[<]\/?(?:TRANSLATE|CONTEXT)[_\s:-]*\d*[\]>:\s-]*/gim, '')
    // 3. Remove markdown bolding or backticks around content
    .replace(/^\s*[`*]+|[`*]+\s*$/g, '')
    // 4. Strip echoed timestamp headers (e.g., {00:01:23,456 --> 00:01:25,789})
    .replace(/^\s*[\[({«"']*\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*(?:--?>|<--|←|→)\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*[\])}»"']*\s*/g, '')
    // 5. Strip outer enclosing brackets or quotes if the model wrapped the entire sentence
    .replace(/^\s*[«"']+|[»"']+\s*$/g, '')
    // 6. Strip invisible zero-width formatting characters (keep \u200C)
    .replace(invisibleChars, '')
    // 7. Convert escaped linebreaks to spaces (subtitles are one single flowing string per cue)
    .replace(/\\[nNr]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export interface ExtractOptions {
  fallbackToSource?: boolean;
}

/**
 * Extracts translated subtitle lines matched strictly by marker IDs.
 * Implements multi-tier parsing strategies to recover from local model syntax quirks.
 */
export const extractSubtitleTranslatorLinesByMarkerIds = (
  response: string,
  expectedMarkerIds: number[],
  sourceLines: string[] = [],
  contextLines: string[] = [],
  options: ExtractOptions = {}
): string[] => {
  if (!response || typeof response !== 'string') {
    return options.fallbackToSource ? expectedMarkerIds.map((_, i) => sourceLines[i] || '') : Array(expectedMarkerIds.length).fill('');
  }

  // Pre-clean response: strip markdown code blocks if the model wrapped the output in ``` ... ```
  let sanitized = response.replace(/^```[a-zA-Z]*\n?/gm, '').replace(/```$/gm, '');

  const idToSlot = new Map(expectedMarkerIds.map((id, index) => [id, index]));
  const slots = Array<string>(expectedMarkerIds.length).fill('');

  // Tier 1: Flexible matching [TRANSLATE_X]...[/TRANSLATE_X] supporting both ] and > endings
  const tier1Pattern = /[\[<]TRANSLATE[_\s:-]+(\d+)[\]>]([\s\S]*?)[\[<]\/(?:TRANSLATE[_\s:-]*\1|TRANSLATE)[\]>]/gi;
  let match: RegExpExecArray | null;
  while ((match = tier1Pattern.exec(sanitized))) {
    const id = Number(match[1]);
    const slot = idToSlot.get(id);
    if (slot !== undefined && slots[slot] === '') {
      slots[slot] = cleanTranslatedSlot(match[2]);
    }
  }

  // Tier 2: Unclosed tags lookahead (when model omits closing tag before starting the next tag)
  if (slots.some(val => val === '')) {
    const tier2Pattern = /[\[<]TRANSLATE[_\s:-]+(\d+)[\]>]([\s\S]*?)(?=[\[<]TRANSLATE[_\s:-]+\d+[\]>]|$)/gi;
    while ((match = tier2Pattern.exec(sanitized))) {
      const id = Number(match[1]);
      const slot = idToSlot.get(id);
      if (slot !== undefined && slots[slot] === '') {
        const rawContent = match[2].replace(/[\[<]\/?TRANSLATE.*?[\]>]?/gi, '');
        slots[slot] = cleanTranslatedSlot(rawContent);
      }
    }
  }

  // Tier 3: Zero-based fallback mapping (if model re-indexed tags 0, 1, 2... instead of using source IDs)
  if (!slots.some(Boolean) && !expectedMarkerIds.every((id, index) => id === index)) {
    const zeroBasedIds = Array.from({ length: expectedMarkerIds.length }, (_, index) => index);
    const zeroIdToSlot = new Map(zeroBasedIds.map((id, index) => [id, index]));
    const zeroSlots = Array<string>(expectedMarkerIds.length).fill('');
    const zeroPattern = /[\[<]TRANSLATE[_\s:-]+(\d+)[\]>]([\s\S]*?)[\[<]\/(?:TRANSLATE[_\s:-]*\1|TRANSLATE)[\]>]/gi;
    while ((match = zeroPattern.exec(sanitized))) {
      const id = Number(match[1]);
      const slot = zeroIdToSlot.get(id);
      if (slot !== undefined && zeroSlots[slot] === '') {
        zeroSlots[slot] = cleanTranslatedSlot(match[2]);
      }
    }
    if (zeroSlots.some(Boolean)) {
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] === '') slots[i] = zeroSlots[i];
      }
    }
  }

  // Tier 4: JSON fallback (if local model reverted to standard JSON schema)
  if (!slots.some(Boolean)) {
    try {
      const start = sanitized.indexOf('[');
      const end = sanitized.lastIndexOf(']');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(sanitized.slice(start, end + 1));
        if (Array.isArray(parsed)) {
          const byId = new Map<number, string>();
          for (const item of parsed) {
            if (!item || typeof item !== 'object') continue;
            const id = Number(item.id);
            const text = item.translatedText;
            if (Number.isInteger(id) && typeof text === 'string' && !byId.has(id)) {
              byId.set(id, cleanTranslatedSlot(text));
            }
          }
          expectedMarkerIds.forEach((id, index) => {
            const found = byId.get(id) ?? byId.get(index);
            if (found && slots[index] === '') slots[index] = found;
          });
        }
      }
    } catch {
      // Not JSON; ignore and proceed
    }
  }

  // Tier 5: Context leak & Hallucination loop protection
  // Intelligent filtering: Allows valid identical short responses ("بله", "نه", "سلام", "باشه")
  // but blocks verbatim echoing of context cues or runaway infinite repetition loops.
  const frequencyMap = new Map<string, number>();
  slots.forEach(val => {
    if (val) frequencyMap.set(val, (frequencyMap.get(val) || 0) + 1);
  });

  const processed = slots.map((value, index) => {
    if (!value) {
      return options.fallbackToSource ? (sourceLines[index] || '') : '';
    }

    // Echo check: if the model echoed the context line verbatim, discard
    const ownSource = normalizeForAlignment(sourceLines[index] || '');
    if (contextLines.some(ctx => normalizeForAlignment(ctx) === value) && ownSource !== value) {
      return options.fallbackToSource ? (sourceLines[index] || '') : '';
    }

    // Runaway loop check: if an identical translation was repeated more than 3 times
    // while the source lines were different and long (> 20 chars), it's a loop
    const freq = frequencyMap.get(value) || 0;
    if (freq > 3 && value.length > 15) {
      const areSourcesIdentical = sourceLines.every(s => s === sourceLines[0]);
      if (!areSourcesIdentical) {
        return options.fallbackToSource ? (sourceLines[index] || '') : '';
      }
    }

    return value;
  });

  return processed;
};

/**
 * Extracts sequential translated lines by expected count (starting from 0).
 */
export const extractTranslatedLinesWithNumbers = (
  response: string,
  expectedCount: number,
  sourceLines: string[] = [],
  contextLines: string[] = []
): string[] => {
  const expectedIds = Array.from({ length: expectedCount }, (_, index) => index);
  return extractSubtitleTranslatorLinesByMarkerIds(response, expectedIds, sourceLines, contextLines);
};
