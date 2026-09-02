const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const repoRoot = path.resolve(__dirname, '..');

Module._extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  return module._compile(outputText, filename);
};

const strategy = require(path.join(repoRoot, 'src/services/methods/subtitle_translator_strategy/index.ts'));

function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}

test('Subtitle Translator strategy extracts only dialogue and restores timing skeleton', () => {
  const input = 'WEBVTT\n\nNOTE keep me\nmetadata\n\nintro-id\n00:00:01.000 --> 00:00:02.000\nHello <c.red>world</c>\n\n00:00:03.000 --> 00:00:04.000\nHow are you?';
  const split = strategy.splitSubtitleTranslatorSkeleton(input);
  assert.deepEqual(split.contentLines, ['Hello world', 'How are you?']);
  const output = strategy.restoreSubtitleTranslatorSkeleton(split, ['سلام دنیا', 'حالت چطور است؟']);
  assert.match(output, /NOTE keep me/);
  assert.match(output, /00:00:01\.000 --> 00:00:02\.000\nسلام دنیا/);
  assert.match(output, /00:00:03\.000 --> 00:00:04\.000\nحالت چطور است؟/);
});

test('Subtitle Translator prompt requires exact tagged response and professional Persian', () => {
  const payload = strategy.buildContextPayload(['Before', 'Translate me', 'After'], 1, 2, 4, { targetMarkerIds: [42] });
  assert.match(payload, /\[TRANSLATE_42\]Translate me\[\/TRANSLATE_42\]/);
  assert.match(payload, /\[CONTEXT\]Before\[\/CONTEXT\]/);
  const prompt = strategy.buildSubtitleTranslatorUserPrompt(payload, 1, 'fa', [42]);
  assert.match(prompt, /Translate exactly these marker IDs/i);
  assert.match(prompt, /professional subtitle translator/i);
  assert.match(prompt, /Persian \(Farsi\)/);
});
