
const MEMORY_KEY = 'submaster_translation_memory_v1';
const MAX_MEMORY_ITEMS = 10000; // Limit to ~10k sentences to keep LocalStorage fast and under 5MB

/**
 * Normalizes text for storage key.
 */
const normalizeKey = (text: string): string => {
  return text.trim();
};

export const loadTranslationMemory = (): Record<string, string> => {
  try {
    const stored = localStorage.getItem(MEMORY_KEY);
    return stored ? JSON.parse(stored) : {};
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
  return memory[normalizeKey(sourceText)];
};

export const addToMemory = (sourceText: string, translatedText: string) => {
  if (!sourceText || !translatedText) return;
  const key = normalizeKey(sourceText);
  
  // Optimization: Don't reload entire memory if key implies it's small/new
  // But for safety and simplicity we load it. 
  // Since we cap at 10k, parsing JSON is fast enough (few ms).
  const memory = loadTranslationMemory();
  
  // If already exists, just update (moves it to end in some implementations, or just updates value)
  // To implement LRU properly we would delete and re-add, but standard object update is fine for now.
  memory[key] = translatedText.trim();

  // Check Soft Limit
  const keys = Object.keys(memory);
  if (keys.length > MAX_MEMORY_ITEMS) {
    // Remove the first (oldest) item
    const oldestKey = keys[0];
    delete memory[oldestKey];
  }

  saveTranslationMemory(memory);
};

export const clearMemory = () => {
  localStorage.removeItem(MEMORY_KEY);
};

export const getMemorySize = (): number => {
    return Object.keys(loadTranslationMemory()).length;
};
