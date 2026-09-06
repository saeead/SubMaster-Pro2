const assert = require('assert');

// Reproduction test for the user's reported bug:
// Tag leak in output:
// "اولین قدم برای پیدا کردن مخاطب خاص، شناسایی علایق و مهارتهای شماست؛\n[/TRANSLATE_6>"
// "جذابی بسازید که مخاطبان همسو با خودتون رو به سمتتون بکشونه.\nقدم بعدی اینه که تحقیق بازار انجام بدید. [/TRANSLATE_11>"

const invisibleChars = /[\u200B\u200D\u2060\uFEFF]/g;

const cleanTranslatedSlot = (value) => {
  if (!value) return '';
  return value
    // Strip any opening/closing/broken translate or context tags (supporting [ ], < >, and malformed endings like [TRANSLATE_6>)
    .replace(/[\[<]\/?(?:TRANSLATE(?:[_\s:-]*\d+)?|TRANSLTranslate_\d+|CONTEXT)[\]>]/gi, '')
    // Strip dangling tag fragments at the start or end
    .replace(/[\[<]\/?(?:TRANSLATE|CONTEXT)[_\s:-]*\d*.*$/gim, '')
    .replace(/^[\[<]\/?(?:TRANSLATE|CONTEXT)[_\s:-]*\d*[\]>:\s-]*/gim, '')
    // Remove markdown bolding or backticks around content
    .replace(/^\s*[`*]+|[`*]+\s*$/g, '')
    // Strip echoed timestamp headers (e.g., {00:01:23,456 --> 00:01:25,789})
    .replace(/^\s*[\[({«"']*\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*(?:--?>|<--|←|→)\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*[\])}»"']*\s*/g, '')
    // Strip outer enclosing quotes if the model wrapped the entire sentence
    .replace(/^\s*[«"']+|[»"']+\s*$/g, '')
    // Strip invisible zero-width formatting characters (keep \u200C)
    .replace(invisibleChars, '')
    // Convert escaped linebreaks to spaces
    .replace(/\\[nNr]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractSubtitleTranslatorLinesByMarkerIds = (
  response,
  expectedMarkerIds,
  sourceLines = [],
  contextLines = []
) => {
  if (!response || typeof response !== 'string') {
    return Array(expectedMarkerIds.length).fill('');
  }

  // Pre-clean response: strip markdown code blocks
  let sanitized = response.replace(/^```[a-zA-Z]*\n?/gm, '').replace(/```$/gm, '');

  const idToSlot = new Map(expectedMarkerIds.map((id, index) => [id, index]));
  const slots = Array(expectedMarkerIds.length).fill('');

  // Tier 1: Flexible bracket matching supporting both ] and > for open and close tags
  const tier1Pattern = /[\[<]TRANSLATE[_\s:-]+(\d+)[\]>]([\s\S]*?)[\[<]\/(?:TRANSLATE[_\s:-]*\1|TRANSLATE)[\]>]/gi;
  let match;
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

  return slots;
};

// Test with the exact user case:
const userPayloadResponse = `
[TRANSLATE_6]اولین قدم برای پیدا کردن مخاطب خاص، شناسایی علایق و مهارتهای شماست؛
[/TRANSLATE_6>
[TRANSLATE_10]جذابی بسازید که مخاطبان همسو با خودتون رو به سمتتون بکشونه.[/TRANSLATE_10]
[TRANSLATE_11]قدم بعدی اینه که تحقیق بازار انجام بدید. [/TRANSLATE_11>
`;

const result = extractSubtitleTranslatorLinesByMarkerIds(userPayloadResponse, [6, 10, 11]);

console.log('Result for tag 6:', JSON.stringify(result[0]));
console.log('Result for tag 10:', JSON.stringify(result[1]));
console.log('Result for tag 11:', JSON.stringify(result[2]));

assert.strictEqual(result[0], 'اولین قدم برای پیدا کردن مخاطب خاص، شناسایی علایق و مهارتهای شماست؛');
assert.strictEqual(result[1], 'جذابی بسازید که مخاطبان همسو با خودتون رو به سمتتون بکشونه.');
assert.strictEqual(result[2], 'قدم بعدی اینه که تحقیق بازار انجام بدید.');

// Verify that cleanTranslatedSlot strips any malformed tag variant
assert.strictEqual(cleanTranslatedSlot('اولین قدم برای پیدا کردن مخاطب خاص، شناسایی علایق و مهارتهای شماست؛\n[/TRANSLATE_6>'), 'اولین قدم برای پیدا کردن مخاطب خاص، شناسایی علایق و مهارتهای شماست؛');
assert.strictEqual(cleanTranslatedSlot('قدم بعدی اینه که تحقیق بازار انجام بدید. [/TRANSLATE_11>'), 'قدم بعدی اینه که تحقیق بازار انجام بدید.');
assert.strictEqual(cleanTranslatedSlot('[TRANSLATE_5] سلام دنیا'), 'سلام دنیا');
assert.strictEqual(cleanTranslatedSlot('سلام دنیا </TRANSLATE_5>'), 'سلام دنیا');

// Test unclosed tag 10 with malformed tag 11
const unclosedTest = `
[TRANSLATE_10]جذابی بسازید که مخاطبان همسو با خودتون رو به سمتتون بکشونه.
[TRANSLATE_11]قدم بعدی اینه که تحقیق بازار انجام بدید. [/TRANSLATE_11>
`;
const unclosedRes = extractSubtitleTranslatorLinesByMarkerIds(unclosedTest, [10, 11]);
assert.strictEqual(unclosedRes[0], 'جذابی بسازید که مخاطبان همسو با خودتون رو به سمتتون بکشونه.');
assert.strictEqual(unclosedRes[1], 'قدم بعدی اینه که تحقیق بازار انجام بدید.');

console.log('ALL REPRODUCTION & FIX TESTS PASSED!');

