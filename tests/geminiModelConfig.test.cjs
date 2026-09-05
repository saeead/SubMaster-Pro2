const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const repoRoot = path.resolve(__dirname, '..');

Module._extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  return module._compile(outputText, filename);
};

const constants = require(path.join(repoRoot, 'src/constants.ts'));
const { APP_CONFIG, DEFAULT_GEMINI_MODEL, getResolvedGeminiModel } = constants;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('Gemini model configuration has the latest Flash as default and free tier', () => {
  // Check default model is the latest fast & free Flash model
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.8-flash');
  assert.equal(APP_CONFIG.geminiModels.standard, 'gemini-3.8-flash');

  // Check dynamic resolution
  assert.equal(getResolvedGeminiModel('standard'), 'gemini-3.8-flash');
  assert.equal(getResolvedGeminiModel(undefined), 'gemini-3.8-flash');

  // Check dynamic flash alias
  assert.equal(getResolvedGeminiModel('flash'), 'gemini-flash-latest');

  // Check economic lite model
  assert.equal(getResolvedGeminiModel('flash_lite'), 'gemini-3.1-flash-lite');

  // Check premium paid pro model
  assert.equal(getResolvedGeminiModel('professional'), 'gemini-3.1-pro-preview');
});

test('APP_CONFIG geminiModels contains expected tier models', () => {
  assert.equal(typeof APP_CONFIG.geminiModels.standard, 'string');
  assert.equal(typeof APP_CONFIG.geminiModels.professional, 'string');
  assert.equal(typeof APP_CONFIG.geminiModels.flash, 'string');
  assert.equal(typeof APP_CONFIG.geminiModels.flash_lite, 'string');
  assert.ok(APP_CONFIG.geminiModels.standard.includes('flash'));
  assert.ok(APP_CONFIG.geminiModels.professional.includes('pro'));
});

