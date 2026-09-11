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

const geminiService = require(path.join(repoRoot, 'src/services/geminiService.ts'));
const { getTranslationDiagnostic } = geminiService;

const mockSettings = {
  apiKeys: [],
  model: 'standard',
  aiProvider: 'gemini',
  openAICompatibleServices: [],
  activeOpenAICompatibleServiceId: '',
  lmStudioBaseUrl: 'http://localhost:1234/v1',
};

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('Suspended key error is accurately diagnosed and classified', () => {
  const suspendedError = new Error('{"error":{"code":403,"message":"permission denied: consumer \'api_key:aizasycs6kcpjs8kuhzd6bbleh8udwk5h6cbncu\' has been suspended"}}');
  const diagnostic = getTranslationDiagnostic(suspendedError, mockSettings);
  
  assert.equal(diagnostic.code, 'api_key_suspended');
  assert.equal(diagnostic.severity, 'error');
  assert.ok(diagnostic.title.includes('تعلیق یا مسدود'));
  assert.ok(diagnostic.cause.includes('has been suspended'));
  assert.ok(diagnostic.recovery.includes('Google AI Studio'));
});

test('Permission denied error is accurately classified', () => {
  const permissionError = new Error('{"error":{"code":403,"message":"permission denied: The caller does not have permission"}}');
  const diagnostic = getTranslationDiagnostic(permissionError, mockSettings);

  assert.equal(diagnostic.code, 'api_key_permission_denied');
  assert.equal(diagnostic.severity, 'error');
  assert.ok(diagnostic.title.includes('عدم دسترسی'));
});

test('Geo-location error is distinguished from suspended key', () => {
  const geoError = new Error('{"error":{"code":403,"message":"User location is not supported for the API use."}}');
  const diagnostic = getTranslationDiagnostic(geoError, mockSettings);

  assert.equal(diagnostic.code, 'access_forbidden');
});
