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
          // Dynamic JSON response for target cue IDs (extract from TARGET MARKED PARAGRAPH section or exclude schema example 123)
          const targetSection = userMsg.includes('TARGET MARKED PARAGRAPH') 
            ? userMsg.split('TARGET MARKED PARAGRAPH')[1].split('FUTURE CONTEXT')[0]
            : userMsg;
          const markerMatches = [...targetSection.matchAll(/⟦(\d+)⟧/g)];
          let ids = [];
          if (markerMatches.length > 0) {
            ids = Array.from(new Set(markerMatches.map(m => parseInt(m[1], 10))));
          } else {
            const idMatches = [...targetSection.matchAll(/"id"\s*:\s*(\d+)/g)];
            ids = Array.from(new Set(idMatches.map(m => parseInt(m[1], 10)))).filter(id => id !== 123);
          }
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
        res.writeHead(200, { 'Content-Type': 'application/json', 'Connection': 'close' });
        res.end(JSON.stringify(responseData));
      } catch (serverErr) {
        console.error('MOCK SERVER ERROR:', serverErr);
        res.writeHead(500, { 'Content-Type': 'application/json', 'Connection': 'close' });
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

    // 7. Test LM Studio few-shot prompt injection in Conversational Tone
    const conversationalSettings = {
      ...defaultGemmaSettings,
      tone: 'conversational'
    };
    const conversationalBatch = [
      { id: 201, text: 'You gotta be kidding me, no way this works!' }
    ];
    await geminiService.translateBatch(conversationalBatch, [], [], conversationalSettings, undefined, true);
    const convBody = receivedBodies[receivedBodies.length - 1];
    const convUserMsg = convBody.messages.find(m => m.role === 'user')?.content || '';
    assert.ok(convUserMsg.includes('FEW-SHOT EXAMPLES'), 'User prompt for LM Studio must include FEW-SHOT EXAMPLES');
    assert.ok(convUserMsg.includes('مگه عقلت رو از دست دادی؟ همین الان بذارش زمین!'), 'Must include conversational few-shot example');
    assert.ok(convUserMsg.includes('الگوریتم بهینه‌سازی، بازده محاسباتی را به طور چشمگیری افزایش می‌دهد.'), 'Must include formal/educational few-shot example');
    console.log('PASS: LM Studio conversational prompt contains authentic cinematic few-shot example');

    // 8. Test LM Studio few-shot prompt injection in Formal Tone
    const formalSettings = {
      ...defaultGemmaSettings,
      tone: 'formal'
    };
    const formalBatch = [
      { id: 202, text: 'The empirical analysis demonstrates statistical significance across all test parameters.' }
    ];
    await geminiService.translateBatch(formalBatch, [], [], formalSettings, undefined, true);
    const formalBody = receivedBodies[receivedBodies.length - 1];
    const formalUserMsg = formalBody.messages.find(m => m.role === 'user')?.content || '';
    assert.ok(formalUserMsg.includes('FEW-SHOT EXAMPLES'), 'User prompt for LM Studio formal tone must include FEW-SHOT EXAMPLES');
    assert.ok(formalUserMsg.includes('الگوریتم بهینه‌سازی، بازده محاسباتی را به طور چشمگیری افزایش می‌دهد.'), 'Must include formal/educational few-shot example');
    console.log('PASS: LM Studio formal prompt contains precise educational few-shot example');

    // 9. Verify Gemini Prompt does NOT contain the LM Studio few-shot block (Strict Isolation)
    const geminiPrompt = geminiService.buildContextualTranslationPrompt(
      conversationalBatch,
      [],
      [],
      true,
      true, // isGemini = true
      [],
      '',
      'gemini'
    );
    assert.ok(!geminiPrompt.includes('FEW-SHOT EXAMPLES (Strictly follow this JSON structure'), 'Gemini prompt must remain strictly unchanged without LM Studio few-shot block');
    console.log('PASS: Strict isolation verified - Gemini prompt remains completely intact without LM Studio few-shot block');

    // 10. Test LM Studio pipeline with 'movie' tone
    const movieSettings = {
      ...defaultGemmaSettings,
      tone: 'movie'
    };
    const movieBatch = [
      { id: 301, text: 'Look at me. We are not walking away from this empty-handed.' }
    ];
    const movieResults = await geminiService.translateBatch(movieBatch, [], [], movieSettings, undefined, true);
    assert.equal(movieResults.length, 1);
    assert.equal(movieResults[0].id, 301);

    const movieBody = receivedBodies[receivedBodies.length - 1];
    const movieSysMsg = movieBody.messages.find(m => m.role === 'system')?.content || '';
    assert.ok(movieSysMsg.includes('ترجمه باید طوری باشد که اگر کسی نسخه انگلیسی را ندیده باشد، فکر کند این دیالوگ از اول به فارسی نوشته شده است.'), 'Movie tone must include key naturalness rule');
    assert.ok(movieSysMsg.includes('تأکید ویژه بر ضرباهنگ صحنه، ریتم دیالوگ، حس و حال دراماتیک'), 'Movie tone must emphasize dramatic rhythm and scene flow');
    assert.ok(movieSysMsg.includes('دوری اکید از شکسته کردن مکانیکی و اجباری واژگان'), 'Movie tone must strictly avoid mechanical word breaking');
    console.log('PASS: LM Studio pipeline with movie tone successfully verified with enhanced dramatic and native rhythm rules');

    // 11. Test LM Studio pipeline with 'conversational' tone system instruction verification
    const convBodyFull = receivedBodies.find(b => b.messages.some(m => m.role === 'system' && m.content.includes('لحن دیالوگ: محاوره‌ای و سینمایی پرکشش (Tehrani Spoken)')));
    assert.ok(convBodyFull, 'Conversational tone request must include reinforced Tehrani Spoken rules');
    const convSysMsg = convBodyFull.messages.find(m => m.role === 'system')?.content || '';
    assert.ok(convSysMsg.includes('ترجمه باید طوری باشد که اگر کسی نسخه انگلیسی را ندیده باشد، فکر کند این دیالوگ از اول به فارسی نوشته شده است.'), 'Conversational tone must include key naturalness rule');
    assert.ok(convSysMsg.includes('تأکید بر ریتم دیالوگ، گرمی، حس و حال و معادل‌های طبیعی ایرانی'), 'Conversational tone must emphasize rhythm and natural Iranian equivalents');
    assert.ok(convSysMsg.includes('دوری اکید از شکسته کردن مکانیکی و اجباری واژگان'), 'Conversational tone must strictly avoid mechanical breaking');
    console.log('PASS: LM Studio pipeline with conversational tone successfully verified with enhanced warmth, rhythm, and naturalness');

    // 12. Verify Gemini Movie tone isolation
    const geminiMovieInstruction = constants.getSystemInstruction('movie', 'entertainment', '', 'netflix', [], '', 'fa', 'default', 'gemini');
    assert.ok(geminiMovieInstruction.includes('لحن سینمایی، بومی‌سازی اصطلاحات عامیانه و حفظ بار دراماتیک (Slang)'), 'Gemini movie tone retains original concise instruction');
    assert.ok(!geminiMovieInstruction.includes('فکر کند این دیالوگ از اول به فارسی نوشته شده است'), 'Gemini instruction must NOT contain local-only additions');
    console.log('PASS: Gemini movie tone isolation verified');

    // 13. Verify Strict JSON Output Mandate in user prompt for LM Studio
    const lastLmBody = receivedBodies[receivedBodies.length - 1];
    const lastUserMsg = lastLmBody.messages.find(m => m.role === 'user')?.content || '';
    assert.ok(lastUserMsg.includes('STRICT JSON OUTPUT MANDATE'), 'User prompt must include STRICT JSON OUTPUT MANDATE');
    assert.ok(lastUserMsg.includes('Stop output immediately after the closing bracket ]'), 'User prompt must instruct stopping after closing bracket ]');
    assert.ok(lastUserMsg.includes('Absolutely NO markdown code blocks'), 'User prompt must forbid markdown code blocks');
    console.log('PASS: Strict JSON Output Mandate successfully injected at the end of LM Studio user prompt');

    // 14. Multi-Batch Parsing Stress Test for LM Studio
    console.log('\n--- Executing Multi-Batch JSON Parsing Reliability Test for LM Studio ---');
    const testBatches = [
      [{ id: 401, text: 'First dialogue line for stress testing.' }],
      [
        { id: 402, text: 'Second dialogue line in multi-item test.' },
        { id: 403, text: 'Third dialogue line in multi-item test.' }
      ],
      [
        { id: 404, text: 'Fourth dialogue with questions? How are you doing?' },
        { id: 405, text: 'Fifth dialogue with exclamation! Stay back!' },
        { id: 406, text: 'Sixth dialogue with numbers like 100% and 42.' }
      ],
      [{ id: 407, text: 'Seventh standalone line with special characters: "Quotes" & symbols.' }]
    ];

    let successCount = 0;
    for (let i = 0; i < testBatches.length; i++) {
      const batch = testBatches[i];
      const res = await geminiService.translateBatch(batch, [], [], defaultGemmaSettings, undefined, true);
      assert.equal(res.length, batch.length, `Batch ${i + 1} item count mismatch`);
      for (let j = 0; j < batch.length; j++) {
        assert.equal(res[j].id, batch[j].id, `Batch ${i + 1} cue id mismatch at index ${j}`);
        assert.ok(res[j].translatedText && res[j].translatedText.length > 0, `Batch ${i + 1} empty text`);
      }
      successCount++;
    }
    assert.equal(successCount, testBatches.length, 'All test batches must succeed');
    console.log(`PASS: Multi-batch stress test completed: ${successCount}/${testBatches.length} batches parsed successfully (100% success rate)`);

    console.log('\n--- ALL GEMMA 4 SAMPLING & PIPELINE TESTS COMPLETED SUCCESSFULLY! ---');
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    server.close();
  }
}

testGemma4SamplingPipeline().catch(err => {
  console.error('Gemma 4 sampling test failed:', err);
  process.exit(1);
});
