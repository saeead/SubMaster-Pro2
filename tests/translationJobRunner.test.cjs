const assert = require('assert');

// Simulate the logic of TranslationJobRunner
class MockTranslationJobRunner {
  constructor(handler) {
    this.handler = handler;
    this.queue = [];
    this.activeJob = null;
    this.controller = null;
    this.listeners = new Set();
  }

  enqueue(fileId) {
    const existing = this.queue.find(j => j.fileId === fileId);
    if (existing) return existing;
    if (this.activeJob?.fileId === fileId) return this.activeJob;

    const job = {
      id: Math.random().toString(36).substring(2),
      fileId,
      status: 'queued',
      createdAt: new Date().toISOString()
    };
    this.queue.push(job);
    this.emit(job);
    return job;
  }

  dequeue(fileId) {
    const index = this.queue.findIndex(job => job.fileId === fileId);
    if (index !== -1) {
      const [removed] = this.queue.splice(index, 1);
      this.finish(removed, 'cancelled');
    }
  }

  abortFile(fileId) {
    if (this.activeJob?.fileId === fileId) {
      this.abortActive('cancelled');
    } else {
      this.dequeue(fileId);
    }
  }

  abortActive(status) {
    if (!this.activeJob) return;
    this.activeJob.status = status;
    this.activeJob.completedAt = new Date().toISOString();
    this.emit(this.activeJob);
    this.controller?.abort();
  }

  finish(job, status) {
    job.status = status;
    job.completedAt = new Date().toISOString();
    this.emit(job);
  }

  emit(job) {
    this.listeners.forEach(l => l({ ...job }));
  }

  async run() {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      this.activeJob = job;
      this.controller = { signal: { aborted: false }, abort: () => { this.controller.signal.aborted = true; } };
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      this.emit(job);

      try {
        await this.handler(job, this.controller.signal);
        if (job.status === 'running') this.finish(job, 'completed');
      } catch (error) {
        if (this.controller.signal.aborted) {
          if (job.status === 'running') this.finish(job, 'cancelled');
        } else {
          job.error = error?.message || String(error);
          this.finish(job, 'failed');
        }
      } finally {
        this.activeJob = null;
        this.controller = null;
      }

      if (job.status === 'paused' || job.status === 'cancelled') break;
    }
  }
}

async function testDynamicQueueDuringTranslation() {
  const processedOrder = [];
  let runner;

  runner = new MockTranslationJobRunner(async (job, signal) => {
    processedOrder.push(`start_${job.fileId}`);
    
    // Simulate user adding file2 and file3 while file1 is actively translating
    if (job.fileId === 'file1') {
      runner.enqueue('file2');
      runner.enqueue('file3');
    }

    // Small async delay to simulate translation
    await new Promise(r => setTimeout(r, 20));
    processedOrder.push(`finish_${job.fileId}`);
  });

  // Initially enqueue only file1
  runner.enqueue('file1');

  // Run batch
  await runner.run();

  assert.deepStrictEqual(
    processedOrder,
    [
      'start_file1',
      'finish_file1',
      'start_file2',
      'finish_file2',
      'start_file3',
      'finish_file3'
    ],
    'Dynamically enqueued files must be seamlessly processed in sequential order without stopping'
  );

  console.log('PASS dynamic enqueue during active translation processes all files continuously');
}

async function testDequeueAndAbort() {
  const processedOrder = [];
  let runner;

  runner = new MockTranslationJobRunner(async (job, signal) => {
    processedOrder.push(job.fileId);
    await new Promise(r => setTimeout(r, 10));
  });

  runner.enqueue('fileA');
  runner.enqueue('fileB');
  runner.enqueue('fileC');

  // Remove fileB from queue before it runs
  runner.dequeue('fileB');

  await runner.run();

  assert.deepStrictEqual(processedOrder, ['fileA', 'fileC']);
  console.log('PASS dequeue cleanly removes a file from the active translation queue');
}

(async () => {
  await testDynamicQueueDuringTranslation();
  await testDequeueAndAbort();
})();
