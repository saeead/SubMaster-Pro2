
import { SubtitleBlock, AdjustmentConfig, NetflixError, VttStyleConfig, StyleConfig, OutputStandard, TargetLanguage } from '../types';
import { BATCH_SIZE, OVERLAP_SIZE, OPTIMIZATION_CONFIG } from '../constants';

// Helper to convert timestamp string to milliseconds
export const timeToMs = (timeString: string): number => {
  if (!timeString) return 0;
  const cleanTime = timeString.replace(',', '.').trim();
  const parts = cleanTime.split(':');
  if (parts.length < 2) return 0;
  const h = parts.length === 3 ? parseInt(parts[0]) : 0;
  const m = parseInt(parts[parts.length === 3 ? 1 : 0]);
  const sParts = parts[parts.length === 3 ? 2 : 1].split('.');
  const sec = parseInt(sParts[0]);
  let ms = 0;
  if (sParts[1]) {
      ms = sParts[1].length === 2 ? parseInt(sParts[1]) * 10 : parseInt(sParts[1].padEnd(3, '0').substring(0,3));
  }
  return (h * 3600000 + m * 60000 + sec * 1000 + ms);
};

export const msToTime = (ms: number): string => {
  const safeMs = Math.max(0, ms); 
  const h = Math.floor(safeMs / 3600000).toString().padStart(2, '0');
  const m = Math.floor((safeMs % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((safeMs % 60000) / 1000).toString().padStart(2, '0');
  const milli = (safeMs % 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${milli}`;
};

export const msToAssTime = (ms: number): string => {
  const safeMs = Math.max(0, ms);
  const h = Math.floor(safeMs / 3600000).toString();
  const m = Math.floor((safeMs % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((safeMs % 60000) / 1000).toString().padStart(2, '0');
  const cs = Math.floor((safeMs % 1000) / 10).toString().padStart(2, '0');
  return `${h}:${m}:${s}.${cs}`;
};

export const hexToAssColor = (hex: string, opacity: number = 100): string => {
    const alphaVal = Math.round(255 - (Math.max(0, Math.min(100, opacity)) / 100) * 255);
    const alphaHex = alphaVal.toString(16).padStart(2, '0').toUpperCase();
    if (!hex) return `&H${alphaHex}FFFFFF`;
    const clean = hex.replace('#', '');
    if (clean.length === 6) {
        const r = clean.substring(0, 2);
        const g = clean.substring(2, 4);
        const b = clean.substring(4, 6);
        return `&H${alphaHex}${b}${g}${r}`;
    }
    return `&H${alphaHex}FFFFFF`;
};

export const parseSRT = (content: string): SubtitleBlock[] => {
  const normalizeLineEndings = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks: SubtitleBlock[] = [];
  const srtPattern = /(\d+)\s+(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})\s+([\s\S]*?)(?=\n\n|\n*$)/g;
  let match;
  while ((match = srtPattern.exec(normalizeLineEndings)) !== null) {
    blocks.push({
      id: parseInt(match[1]),
      index: parseInt(match[1]),
      startTime: match[2],
      endTime: match[3],
      originalText: match[4].trim(),
      translatedText: ''
    });
  }
  return blocks;
};

export const parseVTT = (content: string): SubtitleBlock[] => {
  const normalizeLineEndings = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks: SubtitleBlock[] = [];
  const vttPattern = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+([\s\S]*?)(?=\n\n|\n*$)/g;
  let match;
  let indexCounter = 1;
  while ((match = vttPattern.exec(normalizeLineEndings)) !== null) {
    const startTime = match[1].replace('.', ',');
    const endTime = match[2].replace('.', ',');
    blocks.push({
      id: indexCounter,
      index: indexCounter,
      startTime: startTime,
      endTime: endTime,
      originalText: match[3].trim(),
      translatedText: ''
    });
    indexCounter++;
  }
  return blocks;
};

export const parseASS = (content: string): SubtitleBlock[] => {
  const normalizeLineEndings = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks: SubtitleBlock[] = [];
  const lines = normalizeLineEndings.split('\n');
  let indexCounter = 1;
  let inEvents = false;
  for (const line of lines) {
      if (line.trim() === '[Events]') { inEvents = true; continue; }
      if (!inEvents) continue;
      if (line.startsWith('Dialogue:')) {
          const parts = line.split(',');
          if (parts.length >= 10) {
              const start = parts[1].trim();
              const end = parts[2].trim();
              const text = parts.slice(9).join(',').replace(/\\N/g, '\n').replace(/{.*?}/g, '').trim();
              const startMs = timeToMs(start);
              const endMs = timeToMs(end);
              blocks.push({
                  id: indexCounter,
                  index: indexCounter,
                  startTime: msToTime(startMs),
                  endTime: msToTime(endMs),
                  originalText: text,
                  translatedText: ''
              });
              indexCounter++;
          }
      }
  }
  return blocks;
};

const countWords = (text: string): number => text.trim().split(/\s+/).length;
const countChars = (text: string): number => text.replace(/[\r\n]+/g, '').length;
const isSentenceComplete = (text: string): boolean => /[.?!؟!;]['"]?$/.test(text.trim());

export const formatPersianSubtitle = (text: string): string => {
  if (!text) return '';
  const clean = text.replace(/[\r\n]+/g, ' ').trim();
  const words = clean.split(/\s+/);
  const wordCount = words.length;
  if (wordCount <= 10) return clean;
  let minSplit = 8;
  let maxSplit = 15;
  if (wordCount <= 24) maxSplit = 12; 
  if (maxSplit >= wordCount) maxSplit = wordCount - 1;
  if (minSplit < 1) minSplit = 1;
  let bestSplitIndex = Math.min(12, Math.floor(wordCount / 2));
  let highestScore = -Infinity;
  for (let i = minSplit; i <= maxSplit; i++) {
    const word = words[i - 1];
    let score = 0;
    if (/[.?!؟!;]$/.test(word)) score += 50;
    else if (/[،,:]$/.test(word)) score += 25;
    const target = 12;
    const dist = Math.abs(i - target);
    score -= dist * 2;
    if (score >= highestScore) { highestScore = score; bestSplitIndex = i; }
  }
  const line1 = words.slice(0, bestSplitIndex).join(' ');
  const line2 = words.slice(bestSplitIndex).join(' ');
  return `${line1}\n${line2}`;
};


export const formatSubtitleForLanguage = (text: string, targetLanguage: TargetLanguage = 'fa'): string => {
  if (targetLanguage === 'fa') return formatPersianSubtitle(text);
  if (!text) return '';
  const clean = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= 42) return clean;
  const words = clean.split(' ');
  if (words.length <= 1) return clean;
  const targetLength = clean.length / 2;
  let bestIndex = Math.max(1, Math.floor(words.length / 2));
  let currentLength = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    currentLength += words[i - 1].length + 1;
    const punctuationBonus = /[,:;.!?]$/.test(words[i - 1]) ? -8 : 0;
    const score = Math.abs(currentLength - targetLength) + Math.max(0, currentLength - 42) * 2 + punctuationBonus;
    if (score < bestScore) { bestScore = score; bestIndex = i; }
  }
  return `${words.slice(0, bestIndex).join(' ')}\n${words.slice(bestIndex).join(' ')}`.trim();
};

export const optimizeSubtitleBlocks = (blocks: SubtitleBlock[], standard: OutputStandard = 'normal'): SubtitleBlock[] => {
  if (blocks.length === 0) return [];
  const config = OPTIMIZATION_CONFIG[standard.toUpperCase() as keyof typeof OPTIMIZATION_CONFIG] || OPTIMIZATION_CONFIG.NORMAL;
  const MAX_DURATION_MS = standard === 'normal' ? 12000 : 7000;
  const optimized: SubtitleBlock[] = [];
  let bufferBlock: SubtitleBlock = { ...blocks[0] };
  for (let i = 1; i < blocks.length; i++) {
    const nextBlock = blocks[i];
    const bufferWords = countWords(bufferBlock.originalText);
    const nextWords = countWords(nextBlock.originalText);
    const totalWords = bufferWords + nextWords;
    const bufferChars = countChars(bufferBlock.originalText);
    const nextChars = countChars(nextBlock.originalText);
    const bufferEndMs = timeToMs(bufferBlock.endTime);
    const nextStartMs = timeToMs(nextBlock.startTime);
    const nextEndMs = timeToMs(nextBlock.endTime);
    const bufferStartMs = timeToMs(bufferBlock.startTime);
    const gapMs = nextStartMs - bufferEndMs;
    const combinedDurationMs = nextEndMs - bufferStartMs;
    const isGapTooLarge = gapMs > config.MAX_MERGE_GAP_MS;
    const isTooLongDuration = combinedDurationMs > MAX_DURATION_MS;
    const isTooManyWords = totalWords > config.MAX_WORDS_PER_BLOCK;
    const isTooManyChars = (bufferChars + nextChars) > config.MAX_MERGE_CHARACTERS;
    const isDialogueSwitch = bufferBlock.originalText.trim().startsWith('-') && nextBlock.originalText.trim().startsWith('-');
    const mustBreak = isGapTooLarge || isTooLongDuration || isTooManyWords || isTooManyChars || isDialogueSwitch;
    const isBufferIncomplete = !isSentenceComplete(bufferBlock.originalText);
    const isBufferTooShort = bufferWords < config.MIN_WORDS_PER_BLOCK;
    if (!mustBreak && (isBufferIncomplete || isBufferTooShort)) {
        bufferBlock.endTime = nextBlock.endTime;
        const nextStartsWithHyphen = nextBlock.originalText.trim().startsWith('-');
        const isDialogList = bufferBlock.originalText.includes('\n-') || bufferBlock.originalText.startsWith('-');
        if (nextStartsWithHyphen || isDialogList) {
             bufferBlock.originalText = `${bufferBlock.originalText}\n${nextBlock.originalText}`;
        } else {
            bufferBlock.originalText = `${bufferBlock.originalText.trim()} ${nextBlock.originalText.trim()}`;
        }
    } else {
        const minReadingTime = countWords(bufferBlock.originalText) * config.MS_PER_WORD;
        const currentDuration = timeToMs(bufferBlock.endTime) - timeToMs(bufferBlock.startTime);
        if (currentDuration < minReadingTime) {
            const maxAllowedEnd = nextStartMs - config.STANDARD_GAP_MS;
            const targetEnd = timeToMs(bufferBlock.startTime) + minReadingTime;
            const finalEnd = Math.min(targetEnd, maxAllowedEnd);
            if (finalEnd > timeToMs(bufferBlock.startTime)) { bufferBlock.endTime = msToTime(finalEnd); }
        }
        optimized.push(bufferBlock);
        bufferBlock = { ...nextBlock };
    }
  }
  optimized.push(bufferBlock);
  for (let i = 0; i < optimized.length - 1; i++) {
     const b1 = optimized[i]; const b2 = optimized[i+1];
     const end1 = timeToMs(b1.endTime); const start2 = timeToMs(b2.startTime);
     if (end1 >= start2 - config.STANDARD_GAP_MS) {
         const newEnd = start2 - config.STANDARD_GAP_MS;
         if (newEnd > timeToMs(b1.startTime)) { b1.endTime = msToTime(newEnd); }
     }
  }
  return optimized.map((b, idx) => ({ ...b, id: idx + 1, index: idx + 1 }));
};

export const optimizePersianStructure = (blocks: SubtitleBlock[]): SubtitleBlock[] => {
    if (blocks.length === 0) return [];
    const processed: SubtitleBlock[] = [];
    const MAX_GAP = 1200;
    const MAX_CHARS = 85; 
    const connectors = ['که', 'و', 'ولی', 'اما', 'اگر', 'چون', 'تا', 'پس'];
    let buffer = { ...blocks[0] };
    for (let i = 1; i < blocks.length; i++) {
        const next = blocks[i];
        const textA = buffer.translatedText || buffer.originalText || '';
        const textB = next.translatedText || next.originalText || '';
        const gap = timeToMs(next.startTime) - timeToMs(buffer.endTime);
        const combinedLen = textA.length + textB.length + 1;
        const endsWithConnector = connectors.some(c => textA.trim().endsWith(` ${c}`));
        const isIncomplete = !/[.?!؟!;]$/.test(textA.trim());
        const isDialogue = textA.startsWith('-') || textB.startsWith('-');
        const shouldMerge = !isDialogue && gap < MAX_GAP && combinedLen < MAX_CHARS && (endsWithConnector || (isIncomplete && gap < 500));
        if (shouldMerge) {
            buffer.endTime = next.endTime;
            buffer.translatedText = `${textA.trim()} ${textB.trim()}`;
            buffer.originalText = `${buffer.originalText} ${next.originalText}`; 
            buffer.translatedText = formatPersianSubtitle(buffer.translatedText);
        } else {
            if (buffer.translatedText) buffer.translatedText = formatPersianSubtitle(buffer.translatedText);
            processed.push(buffer); buffer = { ...next };
        }
    }
    if (buffer.translatedText) buffer.translatedText = formatPersianSubtitle(buffer.translatedText);
    processed.push(buffer);
    return processed.map((b, idx) => ({ ...b, id: idx + 1, index: idx + 1 }));
};

export interface SubtitleChunk { id: number; blocks: SubtitleBlock[]; targetStartIndex: number; targetEndIndex: number; }

export const endsWithSentencePunctuation = (text: string): boolean => /[.!?؟…؛;]["')\]]?\s*$/.test(text.trim());
export const startsWithDialogueMarker = (text: string): boolean => /^\s*[-–—]\s+/.test(text);
export const hasSpeakerBoundary = (left?: SubtitleBlock, right?: SubtitleBlock): boolean => {
  if (!left || !right) return false;
  const leftIsDialogue = startsWithDialogueMarker(left.originalText);
  const rightIsDialogue = startsWithDialogueMarker(right.originalText);
  return leftIsDialogue || rightIsDialogue;
};

/**
 * Evaluates the naturalness of breaking a translation chunk between currentBlock and nextBlock.
 * Higher score indicates a natural point to separate requests (sentence end, speaker shift, speech pause).
 */
export const evaluateChunkBoundaryScore = (
  currentBlock: SubtitleBlock,
  nextBlock?: SubtitleBlock
): number => {
  let score = 0;
  const currentText = currentBlock.originalText.trim();

  // Terminal sentence punctuation is the strongest indicator of a natural boundary
  if (endsWithSentencePunctuation(currentText)) {
    score += 60;
  } else if (/[,:،-]$/.test(currentText)) {
    // Clause or phrase boundary
    score += 10;
  } else {
    // Incomplete sentence ending in a conjunction or preposition
    const words = currentText.toLowerCase().split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    const conjunctions = ['and', 'but', 'or', 'so', 'because', 'if', 'that', 'which', 'who', 'when', 'while', 'as', 'to', 'for', 'with', 'in', 'on', 'at', 'by', 'the', 'a', 'an', 'is', 'are', 'was', 'were'];
    if (conjunctions.includes(lastWord)) {
      score -= 35;
    }
  }

  if (nextBlock) {
    // Speaker transition (dialogue hyphen)
    if (hasSpeakerBoundary(currentBlock, nextBlock)) {
      score += 35;
    }

    // Natural speech pause between cues
    const gapMs = timeToMs(nextBlock.startTime) - timeToMs(currentBlock.endTime);
    if (gapMs >= 1500) {
      score += 45;
    } else if (gapMs >= 800) {
      score += 25;
    } else if (gapMs < 150) {
      score -= 15; // Tight contiguous speech
    }

    // Next block starts with a capital letter or quote
    if (/^[A-ZА-Я0-9"']/.test(nextBlock.originalText.trim())) {
      score += 15;
    }
  }

  return score;
};

/**
 * Finds the optimal boundary for the next chunk so sentences are not cut in half.
 */
export const findOptimalChunkBoundary = (
  blocks: SubtitleBlock[],
  start: number,
  desiredChunkSize: number
): number => {
  const total = blocks.length;
  const idealEnd = start + desiredChunkSize;
  if (idealEnd >= total) return total;

  const minBlocks = Math.max(1, Math.floor(desiredChunkSize * 0.65));
  const maxBlocks = Math.min(total - start, Math.ceil(desiredChunkSize * 1.35));

  const windowStart = start + minBlocks;
  const windowEnd = Math.min(total, start + maxBlocks);

  let bestIndex = idealEnd;
  let highestScore = -Infinity;

  for (let candidate = windowStart; candidate <= windowEnd; candidate++) {
    const current = blocks[candidate - 1];
    const next = candidate < total ? blocks[candidate] : undefined;
    const boundaryScore = evaluateChunkBoundaryScore(current, next);

    // Distance penalty prevents extreme drift from desired chunk size
    const distancePenalty = Math.abs(candidate - idealEnd) * 2.5;
    const totalScore = boundaryScore - distancePenalty;

    if (totalScore > highestScore) {
      highestScore = totalScore;
      bestIndex = candidate;
    }
  }

  return bestIndex;
};

export const getSmartContextWindow = (
  blocks: SubtitleBlock[],
  targetStart: number,
  targetEndExclusive: number,
  maxContextBlocks: number = 4
): { contextStart: number; contextEnd: number } => {
  // Always include at least 1-2 blocks of preceding context if available,
  // then expand further back if the boundary is in the middle of a sentence.
  const minContext = Math.min(2, maxContextBlocks);
  let contextStart = Math.max(0, targetStart - minContext);
  let contextEnd = Math.min(blocks.length, targetEndExclusive + minContext);

  while (
    contextStart > 0 &&
    targetStart - contextStart < maxContextBlocks &&
    !endsWithSentencePunctuation(blocks[contextStart - 1].originalText) &&
    !hasSpeakerBoundary(blocks[contextStart - 1], blocks[contextStart])
  ) {
    contextStart--;
  }

  while (
    contextEnd < blocks.length &&
    contextEnd - targetEndExclusive < maxContextBlocks &&
    !endsWithSentencePunctuation(blocks[contextEnd - 1].originalText) &&
    !hasSpeakerBoundary(blocks[contextEnd - 1], blocks[contextEnd])
  ) {
    contextEnd++;
  }

  return { contextStart, contextEnd };
};

export const smartChunking = (blocks: SubtitleBlock[], chunkSize: number = BATCH_SIZE): SubtitleChunk[] => {
  if (blocks.length === 0) return [];
  const chunks: SubtitleChunk[] = [];
  let i = 0;

  while (i < blocks.length) {
    const targetEnd = findOptimalChunkBoundary(blocks, i, chunkSize);
    const { contextStart, contextEnd } = getSmartContextWindow(blocks, i, targetEnd, OVERLAP_SIZE + 3);
    const start = contextStart;
    const end = contextEnd;
    const chunkBlocks = blocks.slice(start, end);
    const relativeStart = i - start;
    const relativeEnd = relativeStart + (targetEnd - i);
    chunks.push({ id: chunks.length, blocks: chunkBlocks, targetStartIndex: relativeStart, targetEndIndex: relativeEnd });
    i = targetEnd;
  }

  return chunks;
};


const PARAGRAPH_CHUNK_MAX_CHARS = 2600;
const PARAGRAPH_CHUNK_MIN_BLOCKS = 8;

const getBlockPlainText = (block: SubtitleBlock): string => block.originalText.replace(/\s+/g, ' ').trim();

/**
 * Paragraph method chunking: keeps the original subtitle blocks/timing intact,
 * but groups adjacent cue texts as coherent marked paragraphs before they are sent
 * to the model. The markers are later used by translateBatch to restore each
 * translated sentence to its source block id.
 */
export const paragraphChunking = (blocks: SubtitleBlock[], maxChars: number = PARAGRAPH_CHUNK_MAX_CHARS): SubtitleChunk[] => {
  const chunks: SubtitleChunk[] = [];
  let start = 0;

  while (start < blocks.length) {
    let end = start;
    let charCount = 0;
    let lastSafeEnd = start;

    while (end < blocks.length) {
      const nextText = getBlockPlainText(blocks[end]);
      const projected = charCount + nextText.length + 8; // marker and separator overhead
      const previous = blocks[end - 1];
      const current = blocks[end];
      const gapMs = previous && current ? timeToMs(current.startTime) - timeToMs(previous.endTime) : 0;
      const reachedSoftBoundary = end > start && (
        endsWithSentencePunctuation(previous?.originalText || '') ||
        hasSpeakerBoundary(previous, current) ||
        gapMs >= 1200
      );

      if (projected > maxChars && end > start) break;

      charCount = projected;
      end++;

      if (reachedSoftBoundary && end - start >= PARAGRAPH_CHUNK_MIN_BLOCKS) {
        lastSafeEnd = end;
      }
    }

    const targetEnd = lastSafeEnd > start && end < blocks.length ? lastSafeEnd : end;
    const { contextStart, contextEnd } = getSmartContextWindow(blocks, start, targetEnd, OVERLAP_SIZE + 3);
    const chunkBlocks = blocks.slice(contextStart, contextEnd);
    chunks.push({
      id: chunks.length,
      blocks: chunkBlocks,
      targetStartIndex: start - contextStart,
      targetEndIndex: targetEnd - contextStart
    });
    start = targetEnd;
  }
  return chunks;
};

export const stringifySRT = (blocks: SubtitleBlock[]): string => {
  return blocks.map(block => {
    const text = block.translatedText && block.translatedText.trim() !== '' ? block.translatedText : block.originalText;
    return `${block.index}\n${block.startTime} --> ${block.endTime}\n${text}`;
  }).join('\n\n');
};

export const stringifyVTT = (blocks: SubtitleBlock[], styles?: StyleConfig): string => {
  let header = `WEBVTT\n\n`;
  const styleClass = 'styled';
  if (styles && styles.useStyles) {
    header += `STYLE\n::cue(.${styleClass}) {\n  font-family: "${styles.fontFamily}";\n`;
    const sizePct = styles.fontSize ? Math.round((styles.fontSize / 18) * 100) : 100;
    header += `  font-size: ${sizePct}%;\n  color: ${styles.primaryColor};\n`;
    if (styles.borderStyle === 'box') {
        const hex = styles.backgroundColor; const opacity = styles.backgroundOpacity ?? 100;
        const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16);
        header += `  background-color: rgba(${r}, ${g}, ${b}, ${opacity / 100});\n`;
    } else { header += `  background-color: transparent;\n`; }
    if (styles.borderStyle === 'outline') header += `  text-shadow: -1px -1px 0 ${styles.secondaryColor}, 1px -1px 0 ${styles.secondaryColor}, -1px 1px 0 ${styles.secondaryColor}, 1px 1px 0 ${styles.secondaryColor};\n`;
    header += `  text-align: center;\n}\n\n`;
  }
  const content = blocks.map(block => {
    const start = block.startTime.replace(',', '.'); const end = block.endTime.replace(',', '.');
    let text = block.translatedText && block.translatedText.trim() !== '' ? block.translatedText : block.originalText;
    if (styles && styles.useStyles) text = `<c.${styleClass}>${text}</c>`;
    return `${start} --> ${end}\n${text}`;
  }).join('\n\n');
  return `${header}${content}`;
};

export const stringifyASS = (blocks: SubtitleBlock[], styles?: StyleConfig): string => {
  const font = styles?.fontFamily || 'Arial'; const size = styles?.fontSize || 20;
  const primary = hexToAssColor(styles?.primaryColor || '#FFFFFF'); const secondary = hexToAssColor(styles?.secondaryColor || '#000000');
  const opacity = styles?.backgroundOpacity !== undefined ? styles.backgroundOpacity : 100;
  const back = hexToAssColor(styles?.backgroundColor || '#000000', opacity);
  const bold = styles?.isBold ? -1 : 0; const borderStyle = styles?.borderStyle === 'box' ? 3 : 1;
  const outline = styles?.outlineWidth || 2; const shadow = styles?.shadowDepth || 0; const align = styles?.alignment || 2;
  const header = `[Script Info]\nTitle: SubMaster Pro Generated\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\nYCbCr Matrix: TV.601\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${font},${size},${primary},&H000000FF,${secondary},${back},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${align},10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const content = blocks.map(block => {
      const start = msToAssTime(timeToMs(block.startTime)); const end = msToAssTime(timeToMs(block.endTime));
      let text = block.translatedText && block.translatedText.trim() !== '' ? block.translatedText : block.originalText;
      text = text.replace(/\n/g, '\\N');
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).join('\n');
  return header + content;
};

export const generateSubtitleFile = (blocks: SubtitleBlock[], format: 'srt' | 'vtt' | 'ass', styles?: StyleConfig): string => {
  if (format === 'srt') return stringifySRT(blocks);
  else if (format === 'ass') return stringifyASS(blocks, styles);
  else return stringifyVTT(blocks, styles);
};

export const downloadFile = (filename: string, content: string) => {
  const element = document.createElement('a');
  const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

export const adjustBlockTiming = (blocks: SubtitleBlock[], config: AdjustmentConfig): SubtitleBlock[] => {
  return blocks.map((block, idx) => {
    let startMs = timeToMs(block.startTime);
    let endMs = timeToMs(block.endTime);
    let duration = endMs - startMs;
    const nextBlockStart = blocks[idx + 1] ? timeToMs(blocks[idx + 1].startTime) : Infinity;
    const textToUse = block.translatedText || block.originalText;
    switch (config.mode) {
      case 'seconds':
        const msValue = config.value * 1000;
        if (config.target === 'shift') { startMs += msValue; endMs += msValue; }
        else if (config.target === 'start') { startMs += msValue; }
        else if (config.target === 'end') { endMs += msValue; }
        else if (config.target === 'both') { startMs -= msValue / 2; endMs += msValue / 2; }
        break;
      case 'percent':
        const multiplier = config.value / 100; const newDuration = duration * multiplier;
        endMs = startMs + newDuration;
        break;
      case 'fixed':
        const fixedDurationMs = config.value * 1000; endMs = startMs + fixedDurationMs;
        break;
      case 'recalculate':
        const charCount = countChars(textToUse);
        const idealDurationSec = charCount / (config.value || 20); 
        const idealDurationMs = idealDurationSec * 1000;
        const constrainedDuration = Math.max(833, idealDurationMs); 
        endMs = startMs + constrainedDuration;
        break;
    }
    if (endMs <= startMs) endMs = startMs + 833; 
    if (config.mode !== 'seconds' || config.target !== 'shift') { if (endMs > nextBlockStart - 84) endMs = nextBlockStart - 84; }
    return { ...block, startTime: msToTime(startMs), endTime: msToTime(endMs) };
  });
};

export const validateNetflixStandards = (blocks: SubtitleBlock[], standard: OutputStandard = 'netflix'): NetflixError[] => {
  const errors: NetflixError[] = [];
  const config = OPTIMIZATION_CONFIG[standard.toUpperCase() as keyof typeof OPTIMIZATION_CONFIG] || OPTIMIZATION_CONFIG.NETFLIX;
  
  // Dynamic limits based on research
  const CPL_LIMIT = standard === 'bbc' ? 37 : standard === 'broadcast' ? 39 : 42;
  const CPS_LIMIT = standard === 'bbc' ? 17 : standard === 'broadcast' ? 18 : 20;

  blocks.forEach((block, idx) => {
    const text = block.translatedText || block.originalText;
    const startMs = timeToMs(block.startTime);
    const endMs = timeToMs(block.endTime);
    const durationSec = (endMs - startMs) / 1000;
    const charCount = countChars(text);
    const lines = text.split('\n');
    const blockErrors: NetflixError['types'] = [];
    const maxLineLength = Math.max(...lines.map(l => l.length));
    
    if (maxLineLength > CPL_LIMIT) blockErrors.push('max_chars');
    if (lines.length > 2) blockErrors.push('max_lines');
    const cps = durationSec > 0 ? charCount / durationSec : 0;
    if (cps > CPS_LIMIT) blockErrors.push('cps');
    if (durationSec < 0.833) blockErrors.push('min_duration');
    if (durationSec > 7) blockErrors.push('max_duration');
    if (idx < blocks.length - 1) {
      const nextStart = timeToMs(blocks[idx+1].startTime);
      const gap = nextStart - endMs;
      if (gap < config.STANDARD_GAP_MS && gap > -500) blockErrors.push('gap');
    }
    if (blockErrors.length > 0) {
      let msg = '';
      if (blockErrors.includes('cps')) msg += `سرعت بالا (${cps.toFixed(1)} CPS). `;
      if (blockErrors.includes('max_chars')) msg += `طول خط بیش از ${CPL_LIMIT}. `;
      if (blockErrors.includes('max_lines')) msg += `بیش از 2 خط. `;
      if (blockErrors.includes('min_duration')) msg += `زمان کوتاه. `;
      if (blockErrors.includes('gap')) msg += `فاصله کم. `;
      errors.push({ blockId: block.id, types: blockErrors, message: msg.trim() });
    }
  });
  return errors;
};

const smartSplitText = (text: string, maxLen: number = 42): string => {
  const clean = text.replace(/[\r\n]+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const words = clean.split(' ');
  const targetSplit = clean.length / 2;
  let currentLen = 0; let splitIndex = 0;
  for (let i = 0; i < words.length; i++) {
    currentLen += words[i].length + 1; 
    if (currentLen >= targetSplit) { splitIndex = i; break; }
  }
  const p1 = words.slice(0, splitIndex + 1).join(' '); const p2 = words.slice(splitIndex + 1).join(' ');
  if (p1.length > maxLen) {
      let fitLen = 0; let fitIndex = 0;
      for (let i=0; i<words.length; i++) { if (fitLen + words[i].length > maxLen) break; fitLen += words[i].length + 1; fitIndex = i; }
      return words.slice(0, fitIndex+1).join(' ') + '\n' + words.slice(fitIndex+1).join(' ');
  } 
  return p1 + '\n' + p2;
};

export const fixNetflixStandards = (blocks: SubtitleBlock[], standard: OutputStandard = 'netflix'): SubtitleBlock[] => {
  let sorted = [...blocks].sort((a, b) => timeToMs(a.startTime) - timeToMs(b.startTime));
  sorted = JSON.parse(JSON.stringify(sorted));
  
  const CPL_LIMIT = standard === 'bbc' ? 37 : standard === 'broadcast' ? 39 : 42;
  const CPS_LIMIT = standard === 'bbc' ? 17 : standard === 'broadcast' ? 18 : 20;
  const MIN_DURATION_MS = 833; 
  const MAX_DURATION_MS = 7000; 
  const MIN_GAP_MS = standard === 'bbc' ? 120 : 84; 

  return sorted.map((block, idx) => {
    let text = block.translatedText || block.originalText || "";
    text = text.trim();
    const lines = text.split('\n');
    if (lines.length > 2 || lines.some((l: string) => l.length > CPL_LIMIT)) {
      text = smartSplitText(text, CPL_LIMIT);
      block.translatedText = text;
    }
    const charCount = countChars(text);
    let idealDurationMs = (charCount / CPS_LIMIT) * 1000;
    if (idealDurationMs < MIN_DURATION_MS) idealDurationMs = MIN_DURATION_MS;
    if (idealDurationMs > MAX_DURATION_MS) idealDurationMs = MAX_DURATION_MS;
    const startMs = timeToMs(block.startTime);
    let endMs = startMs + idealDurationMs;
    if (idx < sorted.length - 1) {
        const nextBlock = sorted[idx + 1]; const nextStartMs = timeToMs(nextBlock.startTime);
        const maxAllowedEndMs = nextStartMs - MIN_GAP_MS;
        if (endMs > maxAllowedEndMs) endMs = maxAllowedEndMs;
        if (endMs <= startMs) {
            const emergencyGap = 20; 
            if (nextStartMs - startMs > emergencyGap) endMs = nextStartMs - emergencyGap;
            else endMs = startMs + 100; 
        }
    }
    return { ...block, endTime: msToTime(endMs) };
  });
};
