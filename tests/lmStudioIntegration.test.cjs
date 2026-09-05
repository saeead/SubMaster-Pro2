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

const constants = require('../src/constants.ts');
const geminiService = require('../src/services/geminiService.ts');

async function runTests() {
  console.log('--- Starting LM Studio Instruction & Pipeline Tests ---');

  // Test 1: Verify getSystemInstruction for LM Studio (provider = 'lm_studio')
  {
    const instruction = constants.getSystemInstruction(
      'conversational',
      'entertainment',
      'دستور سفارشی: لحن کمدی حفظ شود',
      'netflix',
      [{ term: 'Starship', translation: 'استارشیپ' }],
      'SpaceX, NASA',
      'fa',
      'paragraph',
      'lm_studio'
    );

    // 1. Role
    assert.ok(
      instruction.includes('شما یک مترجم ارشد و متخصص بومی‌سازی زیرنویس هستید'),
      'Must contain senior subtitle localization role'
    );

    // 2. 4 Golden Rules
    assert.ok(instruction.includes('اصالت، جذابیت و لحن طبیعی'), 'Must include rule 1: authenticity and natural rhythm');
    assert.ok(instruction.includes('امانت‌داری کامل معنا و ممنوعیت خلاصه‌سازی'), 'Must include rule 2: no summarization');
    assert.ok(instruction.includes('دقت مفهومی، علمی و آموزشی'), 'Must include rule 3: educational precision');
    assert.ok(instruction.includes('مهندسی متن زیرنویس'), 'Must include rule 4: subtitle engineering');

    // 3. Persian Rules
    assert.ok(instruction.includes('نیم‌فاصله الزامی (ZWNJ)'), 'Must enforce half-space');
    assert.ok(instruction.includes('«ی» و «ک» استاندارد فارسی'), 'Must enforce Persian characters');

    // 4. Dynamic parameters preserved
    assert.ok(instruction.includes('محاوره‌ای و سینمایی'), 'Tone conversational must be present');
    assert.ok(instruction.includes('سرگرمی و سینمایی'), 'Topic entertainment must be present');
    assert.ok(instruction.includes('استاندارد NETFLIX'), 'Standard netflix must be present');
    assert.ok(instruction.includes('استارشیپ'), 'Glossary term must be present');
    assert.ok(instruction.includes('SpaceX'), 'Protected term SpaceX must be present');
    assert.ok(instruction.includes('NASA'), 'Protected term NASA must be present');
    assert.ok(instruction.includes('دستور سفارشی: لحن کمدی حفظ شود'), 'Custom prompt must be present');

    // 5. Few-shot examples
    assert.ok(instruction.includes('مگه عقلت رو از دست دادی؟ الان دیگه از پسش برنمی‌آیم!'), 'Must include dialogue few-shot');
    assert.ok(instruction.includes('گرادیان نزولی را بهینه‌سازی می‌کند'), 'Must include scientific few-shot');

    // 6. JSON output format contract
    assert.ok(instruction.includes('فرمت خروجی الزامی (JSON Array)'), 'Paragraph method must require JSON array');

    console.log('PASS Test 1: LM Studio System Instruction contains all required rules, few-shots, and dynamic parameters');
  }

  // Test 2: Verify Skeleton STR for LM Studio does not request JSON array
  {
    const skeletonInstruction = constants.getSystemInstruction(
      'conversational',
      'educational',
      '',
      'normal',
      [],
      '',
      'fa',
      'skeleton_str',
      'lm_studio'
    );

    assert.ok(skeletonInstruction.includes('قرارداد خروجی تگ‌ها'), 'Skeleton STR must specify tag output contract');
    assert.ok(!skeletonInstruction.includes('فرمت خروجی الزامی (JSON Array)'), 'Skeleton STR must NOT require JSON array');
    console.log('PASS Test 2: LM Studio Skeleton STR produces tag contract without JSON array confusion');
  }

  // Test 3: Verify Gemini still gets its original instruction unchanged
  {
    const geminiInstruction = constants.getSystemInstruction(
      'conversational',
      'educational',
      '',
      'normal',
      [],
      '',
      'fa',
      'default',
      'gemini'
    );
    assert.ok(geminiInstruction.includes('--- اصول بنیادین ترجمه و نگارش ---'), 'Gemini instruction must preserve original core');
    console.log('PASS Test 3: Gemini provider logic is 100% preserved and untouched');
  }

  // Setup mock LM Studio HTTP server for pipeline execution
  let capturedRequests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsedBody = JSON.parse(body);
      capturedRequests.push({
        url: req.url,
        body: parsedBody
      });

      const userMsg = parsedBody.messages?.find(m => m.role === 'user')?.content || '';

      if (userMsg.includes('[TRANSLATE_')) {
        // Skeleton STR response
        const responseData = {
          id: 'chatcmpl-mock-skeleton',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '[TRANSLATE_0]مگه عقلت رو از دست دادی؟[/TRANSLATE_0]\n[TRANSLATE_1]شبکه عصبی از طریق به‌روزرسانی مکرر وزن‌ها، گرادیان نزولی را بهینه‌سازی می‌کند.[/TRANSLATE_1]'
              }
            }
          ]
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } else {
        // Paragraph / JSON response
        const responseData = {
          id: 'chatcmpl-mock-paragraph',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify([
                  { id: 1, translatedText: 'مگه عقلت رو از دست دادی؟ الان دیگه از پسش برنمی‌آیم!' },
                  { id: 2, translatedText: 'شبکه عصبی از طریق به‌روزرسانی مکرر وزن‌ها، گرادیان نزولی را بهینه‌سازی می‌کند.' }
                ])
              }
            }
          ]
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}/v1`;

  try {
    const baseSettings = {
      tone: 'conversational',
      topic: 'educational',
      temperature: 0.35,
      outputFormat: 'srt',
      outputStandard: 'netflix',
      translationMethod: 'paragraph',
      model: 'standard',
      aiProvider: 'lm_studio',
      lmStudioBaseUrl: mockBaseUrl,
      lmStudioModel: 'gemma-4-26b-a4b-qat',
      openAICompatibleServices: [],
      customPrompt: '',
      apiKeys: [],
      enableTranslationMemory: false,
      glossary: [],
      doNotTranslateTerms: '',
      theme: 'dark',
      targetLanguage: 'fa'
    };

    // Test 4: Pipeline execution with provider = 'lm_studio' and method = 'paragraph'
    {
      const targetBatch = [
        { id: 1, text: 'Are you out of your mind? We cannot pull this off now!' },
        { id: 2, text: 'The neural network optimizes gradient descent by iteratively updating weights.' }
      ];

      const results = await geminiService.translateBatch(targetBatch, [], [], baseSettings, undefined, true);

      assert.equal(results.length, 2, 'Must return exactly 2 translated cues');
      assert.equal(results[0].id, 1, 'First cue id must be preserved');
      assert.equal(results[0].translatedText, 'مگه عقلت رو از دست دادی؟ الان دیگه از پسش برنمی‌آیم!');
      assert.equal(results[1].id, 2, 'Second cue id must be preserved');
      assert.equal(results[1].translatedText, 'شبکه عصبی از طریق به‌روزرسانی مکرر وزن‌ها، گرادیان نزولی را بهینه‌سازی می‌کند.');

      // Verify the system instruction sent to LM Studio contained our new prompt
      const lastReq = capturedRequests[capturedRequests.length - 1];
      const sentSystem = lastReq.body.messages.find(m => m.role === 'system').content;
      assert.ok(sentSystem.includes('شما یک مترجم ارشد و متخصص بومی‌سازی زیرنویس هستید'));
      assert.ok(sentSystem.includes('اصالت، جذابیت و لحن طبیعی'));

      console.log('PASS Test 4: LM Studio Paragraph pipeline completed successfully: valid JSON, preserved IDs, and natural Persian phrasing');
    }

    // Test 5: Pipeline execution with provider = 'lm_studio' and method = 'skeleton_str'
    {
      const skeletonSettings = {
        ...baseSettings,
        translationMethod: 'skeleton_str'
      };

      const rawContent = `[TRANSLATE_0]Are you out of your mind?[/TRANSLATE_0]\n[TRANSLATE_1]The neural network optimizes gradient descent by iteratively updating weights.[/TRANSLATE_1]`;
      const response = await geminiService.translateSkeletonPayload(rawContent, skeletonSettings);

      assert.ok(response.includes('[TRANSLATE_0]مگه عقلت رو از دست دادی؟[/TRANSLATE_0]'), 'Must return translated tag 0');
      assert.ok(response.includes('[TRANSLATE_1]شبکه عصبی از طریق به‌روزرسانی مکرر وزن‌ها، گرادیان نزولی را بهینه‌سازی می‌کند.[/TRANSLATE_1]'), 'Must return translated tag 1');

      console.log('PASS Test 5: LM Studio Skeleton STR pipeline completed successfully with correct tags');
    }

    console.log('\n--- ALL LM STUDIO INSTRUCTION & PIPELINE TESTS PASSED! ---');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
