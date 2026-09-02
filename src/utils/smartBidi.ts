/**
 * Smart Bi-directional text and placeholder alignment utility.
 * Intelligently aligns Persian/Arabic text to right (RTL)
 * and English/Latin text to left (LTR) across all input fields, textareas,
 * placeholders, and dynamic DOM elements.
 */

// Comprehensive Persian & Arabic Unicode blocks
const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_REGEX = /[A-Za-z]/;

/**
 * Detects whether a string has primarily RTL (Persian/Arabic) or LTR (English) directional flow
 * by inspecting the first strongly directional character.
 */
export function detectTextDirection(text: string | null | undefined): 'rtl' | 'ltr' {
  if (!text) return 'rtl';
  const trimmed = text.trim();
  if (!trimmed) return 'rtl';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (RTL_REGEX.test(char)) return 'rtl';
    if (LTR_REGEX.test(char)) return 'ltr';
  }

  return 'rtl';
}

/**
 * Synchronizes the direction and text alignment of an input or textarea element.
 * Prioritizes the element's actual value; if empty, inspects the placeholder.
 */
export function syncElementBidi(element: HTMLInputElement | HTMLTextAreaElement): void {
  // If the element has an explicitly locked data-dir-lock attribute, skip auto-sync
  if (element.hasAttribute('data-dir-lock')) return;

  const value = element.value;
  const placeholder = element.getAttribute('placeholder') || '';

  let resolvedDir: 'rtl' | 'ltr' = 'rtl';

  if (value && value.trim().length > 0) {
    resolvedDir = detectTextDirection(value);
  } else if (placeholder && placeholder.trim().length > 0) {
    resolvedDir = detectTextDirection(placeholder);
  } else {
    // If no value and no placeholder, default based on parent or document
    resolvedDir = element.closest('[dir="ltr"]') ? 'ltr' : 'rtl';
  }

  element.dir = resolvedDir;
  element.style.textAlign = resolvedDir === 'rtl' ? 'right' : 'left';
}

/**
 * Scans all input and textarea elements in a subtree (or document) and applies smart bidi.
 */
export function scanAndApplyBidi(root: ParentNode = document): void {
  const elements = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="file"]):not([type="range"]), textarea');
  elements.forEach(syncElementBidi);
}

/**
 * Initializes global smart bidi listeners and mutation observer.
 * Call this once when application boots.
 */
export function initSmartBidi(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  // Handle immediate scan
  scanAndApplyBidi(document);

  // Event handlers for user interaction
  const handleInputEvent = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      syncElementBidi(target);
    }
  };

  document.addEventListener('input', handleInputEvent, true);
  document.addEventListener('focusin', handleInputEvent, true);
  document.addEventListener('focusout', handleInputEvent, true);

  // Observe dynamically created modal or page inputs
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
              syncElementBidi(node);
            } else {
              scanAndApplyBidi(node);
            }
          }
        });
      } else if (mutation.type === 'attributes' && (mutation.attributeName === 'placeholder' || mutation.attributeName === 'value')) {
        const target = mutation.target as HTMLElement;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          syncElementBidi(target);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['placeholder', 'value']
  });

  return () => {
    document.removeEventListener('input', handleInputEvent, true);
    document.removeEventListener('focusin', handleInputEvent, true);
    document.removeEventListener('focusout', handleInputEvent, true);
    observer.disconnect();
  };
}
