const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const Module = require('node:module');

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

const geminiService = require('../src/services/geminiService.ts');

async function testGemma4SamplingPipeline() {
  console.log('--- Testing Gemma 4 Sampling Parameters in LM Studio Pipeline ---');

  let receivedBodies = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        receivedBodies.push(parsed);

        const userMsg = parsed.messages?.find(m => m.role === 'user')?.content || '';
        let responseContent = '';

        if (userMsg.includes('[TRANSLATE_')) {
          // Dynamic Skeleton STR response for all requested tags
          const tagMatches = [...userMsg.matchAll(/\[TRANSLATE_(\d+)\]/g)];
          const tags = Array.from(new Set(tagMatches.map(m => m[1])));
          responseContent = tags.map(tag => `[TRANSLATE_${tag}]ترجمه طبیعی و روان برای دیالوگ بخش ${tag}[/TRANSLATE_${tag}]`).join('\n');
        } else {
          // Dynamic JSON response for all requested cue IDs
          const idMatches = [
            ...userMsg.matchAll(/"id"\s*:\s*(\d+)/g),
            ...userMsg.matchAll(/⟦(\d+)⟧/g)
          ];
          const ids = Array.from(new Set(idMatches.map(m => parseInt(m[1], 10))));
          if (ids.length > 0) {
            const items = ids.map(id => ({
              id,
              translatedText: id === 101 ? 'فکر کردی کی هستی؟ زودباش دستت رو از روی اون بردار!'
                : id === 102 ? 'سیستم بهینه‌ساز با تحلیل الگوها، بازدهی نهایی را ارتقا می‌دهد.'
                : `جمله و دیالوگ اختصاصی شماره ${id} که به زیبایی معادل‌سازی شده است.`
            }));
            responseContent = JSON.stringify(items);
          } else {
            responseContent = JSON.stringify([
              { id: 101, translatedText: 'فکر کردی کی هستی؟ زودباش دستت رو از روی اون بردار!' },
              { id: 102, translatedText: 'سیستم بهینه‌ساز با تحلیل الگوها، بازدهی نهایی را ارتقا می‌دهد.' }
            ]);
          }
        }

        const responseData = {
          id: 'chatcmpl-gemma4-test',
          choices: [
            {
              message: {
                role: 'assistant',
                content: responseContent
              }
            }
          ]
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (serverErr) {
        console.error('MOCK SERVER ERROR:', serverErr);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(serverErr) }));
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}/v1`;

  try {
    // 1. Test Default Gemma 4 parameters with conversational tone
    const testBatch = [
      { id: 101, text: 'Who do you think you are? Get your hands off that right now!' },
      { id: 102, text: 'The optimization system enhances final throughput by analyzing recurring patterns.' }
    ];

    const defaultGemmaSettings = {
      tone: 'conversational',
      topic: 'entertainment',
      temperature: 0.35,
      outputFormat: 'srt',
      outputStandard: 'netflix',
      translationMethod: 'paragraph',
      model: 'standard',
      aiProvider: 'lm_studio',
      lmStudioBaseUrl: mockBaseUrl,
      lmStudioModel: 'gemma-4-26b-a4b-it',
      openAICompatibleServices: [],
      customPrompt: '',
      apiKeys: [],
      enableTranslationMemory: false,
      glossary: [],
      doNotTranslateTerms: '',
      theme: 'dark',
      targetLanguage: 'fa'
    };

    const results = await geminiService.translateBatch(testBatch, [], [], defaultGemmaSettings, undefined, true);

    assert.equal(results.length, 2);
    assert.equal(results[0].id, 101);
    assert.equal(results[1].id, 102);

    const firstRequest = receivedBodies[0];
    assert.equal(firstRequest.model, 'gemma-4-26b-a4b-it');
    assert.equal(firstRequest.top_p, 0.95, 'Default top_p should be 0.95');
    assert.equal(firstRequest.top_k, 64, 'Default top_k should be 64');
    assert.equal(firstRequest.repeat_penalty, 1.08, 'Default repeat_penalty should be 1.08');
    assert.ok(firstRequest.max_tokens >= 1500 && firstRequest.max_tokens <= 3000, `max_tokens (${firstRequest.max_tokens}) should be between 1500 and 3000`);
    // Tone conversational should boost temperature slightly (0.35 + 0.05 = 0.40)
    assert.equal(firstRequest.temperature, 0.40, 'Conversational tone should have slightly higher temperature (0.40)');

    console.log('PASS: Default Gemma 4 parameters (top_p=0.95, top_k=64, repeat_penalty=1.08, adaptive max_tokens & tone-adjusted temp) verified');

    // 2. Test Tone 'news' / 'formal' (should suggest lower temperature)
    const newsSettings = {
      ...defaultGemmaSettings,
      tone: 'news',
      temperature: 0.35
    };
    await geminiService.translateBatch(testBatch, [], [], newsSettings, undefined, true);
    const secondRequest = receivedBodies[1];
    assert.equal(secondRequest.temperature, 0.30, 'News tone should have slightly lower temperature (0.30)');
    console.log('PASS: News tone adjusted temperature downwards (0.30) for higher precision');

    // 3. Test Custom Settings overrides for top_p, top_k, repeat_penalty, max_tokens
    const customSettings = {
      ...defaultGemmaSettings,
      lmStudioTopP: 0.90,
      lmStudioTopK: 40,
      lmStudioRepeatPenalty: 1.15,
      lmStudioMaxTokens: 2500
    };
    await geminiService.translateBatch(testBatch, [], [], customSettings, undefined, true);
    const thirdRequest = receivedBodies[2];
    assert.equal(thirdRequest.top_p, 0.90, 'User custom top_p should override default');
    assert.equal(thirdRequest.top_k, 40, 'User custom top_k should override default');
    assert.equal(thirdRequest.repeat_penalty, 1.15, 'User custom repeat_penalty should override default');
    assert.equal(thirdRequest.max_tokens, 2500, 'User custom max_tokens should override default');
    console.log('PASS: User overrides for all LM Studio sampling parameters successfully applied');

    // 4. Test Adaptive Batch Sizing for LM Studio (Gemma 4 26B A4B)
    const constants = require('../src/constants.ts');
    assert.equal(constants.getAdaptiveTranslationBatchSize('lm_studio', 'standard', 'paragraph'), 20, 'LM Studio paragraph batch size should be 20');
    assert.equal(constants.getAdaptiveTranslationBatchSize('lm_studio', 'standard', 'default'), 22, 'LM Studio default batch size should be 22');
    assert.equal(constants.getAdaptiveTranslationBatchSize('lm_studio', 'standard', 'skeleton_str'), 24, 'LM Studio skeleton_str batch size should be 24');
    assert.equal(constants.getAdaptiveTranslationBatchSize('lm_studio', 'standard', 'subtitle_translator'), 10, 'LM Studio subtitle_translator batch size should be 10');

    // Long cue auto-reduction
    const reducedParagraph = constants.getAdaptiveTranslationBatchSize('lm_studio', 'standard', 'paragraph', 150);
    assert.equal(reducedParagraph, 14, 'LM Studio paragraph should auto-scale down for long cues (>120 chars)');
    const reducedSkeleton = constants.getAdaptiveTranslationBatchSize('lm_studio', 'standard', 'skeleton_str', 150);
    assert.equal(reducedSkeleton, 18, 'LM Studio skeleton_str should auto-scale down for long cues (>120 chars)');
    console.log('PASS: LM Studio adaptive batch sizing (paragraph=20, default=22, skeleton_str=24, and long cue auto-scaling) verified');

    // 5. Test Full Pipeline Batch Execution with paragraph method (20 cues)
    const paragraphBatch = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      text: `Line ${i + 1}: The quick brown fox jumps over the lazy dog.`
    }));
    const paragraphResults = await geminiService.translateBatch(paragraphBatch, [], [], defaultGemmaSettings, undefined, true);
    assert.equal(paragraphResults.length, 20);
    assert.equal(paragraphResults[0].id, 1);
    assert.equal(paragraphResults[19].id, 20);
    console.log('PASS: LM Studio pipeline with paragraph batch size 20 executed with 100% ID fidelity');

    // 6. Test Full Pipeline Batch Execution with skeleton_str method (24 cues)
    const skeletonSettings = {
      ...defaultGemmaSettings,
      translationMethod: 'skeleton_str'
    };
    const rawSkeletonContent = Array.from({ length: 24 }, (_, i) => 
      `[TRANSLATE_${i}]Dialogue cue ${i + 1}: We must proceed with caution.[/TRANSLATE_${i}]`
    ).join('\n');
    const skeletonResponse = await geminiService.translateSkeletonPayload(rawSkeletonContent, skeletonSettings);
    assert.ok(skeletonResponse.includes('[TRANSLATE_0]'), 'Must return translated tag 0');
    assert.ok(skeletonResponse.includes('[TRANSLATE_23]'), 'Must return translated tag 23');
    console.log('PASS: LM Studio pipeline with skeleton_str batch size 24 executed with 100% tag fidelity');

    console.log('\n--- ALL GEMMA 4 SAMPLING & PIPELINE TESTS COMPLETED SUCCESSFULLY! ---');
  } finally {
    server.close();
  }
}

testGemma4SamplingPipeline().catch(err => {
  console.error('Gemma 4 sampling test failed:', err);
  process.exit(1);
});
