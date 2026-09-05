
const MEMORY_KEY = 'submaster_translation_memory_v1';
const MAX_MEMORY_ITEMS = 10000; // Limit to ~10k sentences to keep LocalStorage fast and under 5MB

let memoryCache: Record<string, string> | null = null;

/**
 * Normalizes text for storage key.
 */
const normalizeKey = (text: string): string => {
  return text.trim();
};

export const loadTranslationMemory = (): Record<string, string> => {
  if (memoryCache) return memoryCache;
  try {
    const stored = localStorage.getItem(MEMORY_KEY);
    memoryCache = stored ? JSON.parse(stored) : {};
    return memoryCache!;
  } catch (e) {
    console.error("Failed to load translation memory", e);
    return {};
  }
};

/**
 * Saves memory to LocalStorage with Quota Management.
 * If quota is exceeded, it removes old entries and retries.
 */
export const saveTranslationMemory = (memory: Record<string, string>) => {
  memoryCache = memory;
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch (e: any) {
    // Check for QuotaExceededError
    if (
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.toString().includes('quota')
    ) {
      console.warn("Translation Memory Full! Cleaning up old entries...");
      
      // Prune 20% of the oldest items (assuming insertion order is roughly preserved)
      const keys = Object.keys(memory);
      const itemsToRemove = Math.max(1, Math.floor(keys.length * 0.2));
      
      for (let i = 0; i < itemsToRemove; i++) {
        delete memory[keys[i]];
      }
      
      memoryCache = memory;
      // Retry save
      try {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
      } catch (retryErr) {
        console.error("Failed to save even after cleanup", retryErr);
      }
    } else {
      console.warn("Failed to save translation memory", e);
    }
  }
};

export const getFromMemory = (sourceText: string): string | undefined => {
  if (!sourceText) return undefined;
  const memory = loadTranslationMemory();
  const trimmed = sourceText.trim();
  
  // 1. Direct exact match
  if (memory[trimmed] !== undefined) {
    return memory[trimmed];
  }

  // 2. Whitespace-normalized match (e.g. collapses multiple spaces or newlines)
  const normalizedWs = trimmed.replace(/\s+/g, ' ');
  if (memory[normalizedWs] !== undefined) {
    return memory[normalizedWs];
  }

  // 3. Dialogue prefix normalization (e.g. "- Hello" vs "Hello")
  const prefixMatch = trimmed.match(/^[-–—]\s*(.*)$/);
  if (prefixMatch && prefixMatch[1]) {
    const rawContent = prefixMatch[1].trim();
    if (memory[rawContent] !== undefined) {
      return `- ${memory[rawContent]}`;
    }
  }

  // 4. HTML tag normalization (e.g. <i>Hello</i> vs Hello)
  const tagMatch = trimmed.match(/^<([a-z]+)>(.*?)<\/\1>$/i);
  if (tagMatch && tagMatch[2]) {
    const tagName = tagMatch[1];
    const inner = tagMatch[2].trim();
    if (memory[inner] !== undefined) {
      return `<${tagName}>${memory[inner]}</${tagName}>`;
    }
  }

  // 5. Case-insensitive fallback for short dialogue cues (< 50 chars)
  if (trimmed.length < 50) {
    const lower = trimmed.toLowerCase();
    for (const key of Object.keys(memory)) {
      if (key.toLowerCase() === lower) {
        return memory[key];
      }
    }
  }

  return undefined;
};

export const addToMemory = (sourceText: string, translatedText: string) => {
  if (!sourceText || !translatedText) return;
  const key = normalizeKey(sourceText);
  
  const memory = loadTranslationMemory();
  memory[key] = translatedText.trim();

  // Check Soft Limit
  const keys = Object.keys(memory);
  if (keys.length > MAX_MEMORY_ITEMS) {
    const oldestKey = keys[0];
    delete memory[oldestKey];
  }

  saveTranslationMemory(memory);
};

/**
 * High-performance batch insertion for Translation Memory.
 * Avoids repeated JSON parsing/serialization across multiple cues in a batch.
 */
export const addBatchToMemory = (items: { sourceText: string; translatedText: string }[]) => {
  if (!items || items.length === 0) return;
  const memory = loadTranslationMemory();
  let hasChanges = false;

  for (const item of items) {
    if (!item.sourceText || !item.translatedText) continue;
    const key = normalizeKey(item.sourceText);
    const value = item.translatedText.trim();
    if (memory[key] !== value) {
      memory[key] = value;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    const keys = Object.keys(memory);
    if (keys.length > MAX_MEMORY_ITEMS) {
      const overflow = keys.length - MAX_MEMORY_ITEMS;
      for (let i = 0; i < overflow; i++) {
        delete memory[keys[i]];
      }
    }
    saveTranslationMemory(memory);
  }
};

/**
 * Partitions a target batch into cached responses (from TM) and uncached blocks.
 * Enables zero-token bypass for already translated cues.
 */
export const filterBatchWithMemory = <T extends { id: number; text: string }>(
  blocks: T[]
): { cachedResponses: { id: number; translatedText: string }[]; uncachedBatch: T[] } => {
  const cachedResponses: { id: number; translatedText: string }[] = [];
  const uncachedBatch: T[] = [];

  for (const block of blocks) {
    const cached = getFromMemory(block.text);
    if (cached) {
      cachedResponses.push({ id: block.id, translatedText: cached });
    } else {
      uncachedBatch.push(block);
    }
  }

  return { cachedResponses, uncachedBatch };
};

export const clearMemory = () => {
  memoryCache = {};
  localStorage.removeItem(MEMORY_KEY);
};

export const getMemorySize = (): number => {
  return Object.keys(loadTranslationMemory()).length;
};
