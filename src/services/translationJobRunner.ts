import { TranslationJob, TranslationJobStatus } from '../types';

export type TranslationJobHandler = (job: TranslationJob, signal: AbortSignal) => Promise<void>;
export type TranslationJobListener = (job: TranslationJob) => void;

export class TranslationJobRunner {
  private queue: TranslationJob[] = [];
  private activeJob: TranslationJob | null = null;
  private controller: AbortController | null = null;
  private listeners = new Set<TranslationJobListener>();
  private isCancelledAll = false;
  private runningPromise: Promise<void> | null = null;

  constructor(private readonly handler: TranslationJobHandler) {}

  public enqueue(fileId: string): TranslationJob {
    const existing = this.queue.find(j => j.fileId === fileId);
    if (existing) return existing;
    if (this.activeJob?.fileId === fileId) return this.activeJob;

    const job: TranslationJob = {
      id: crypto.randomUUID(),
      fileId,
      status: 'queued',
      createdAt: new Date().toISOString()
    };
    this.queue.push(job);
    this.emit(job);
    return job;
  }

  public dequeue(fileId: string): void {
    const index = this.queue.findIndex(job => job.fileId === fileId);
    if (index !== -1) {
      const [removed] = this.queue.splice(index, 1);
      this.finish(removed, 'cancelled');
    }
  }

  public abortFile(fileId: string): void {
    if (this.activeJob?.fileId === fileId) {
      this.cancelActive();
    } else {
      this.dequeue(fileId);
    }
  }

  public isProcessing(): boolean {
    return this.activeJob !== null || this.queue.length > 0;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveJob(): TranslationJob | null {
    return this.activeJob ? { ...this.activeJob } : null;
  }

  public getCancelledAll(): boolean {
    return this.isCancelledAll;
  }

  public onChange(listener: TranslationJobListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getSnapshot(): TranslationJob[] {
    return [...(this.activeJob ? [this.activeJob] : []), ...this.queue].map(job => ({ ...job }));
  }

  public pauseActive(): void {
    this.abortActive('paused');
  }

  public cancelActive(): void {
    this.abortActive('cancelled');
  }

  public cancelAll(): void {
    this.isCancelledAll = true;
    this.abortActive('cancelled');
    const pending = this.queue.splice(0);
    pending.forEach(job => this.finish(job, 'cancelled'));
  }

  public async run(): Promise<void> {
    if (this.runningPromise) return this.runningPromise;

    this.isCancelledAll = false;
    this.runningPromise = (async () => {
      try {
        while (this.queue.length > 0) {
          const job = this.queue.shift()!;
          this.activeJob = job;
          this.controller = new AbortController();
          job.status = 'running';
          job.startedAt = new Date().toISOString();
          this.emit(job);

          try {
            await this.handler(job, this.controller.signal);
            if (job.status === 'running') this.finish(job, 'completed');
          } catch (error: any) {
            const isAbort = this.controller?.signal.aborted
              || error?.name === 'AbortError'
              || String(error?.message || error).toLowerCase().includes('aborted');
            if (isAbort) {
              if (job.status === 'running') this.finish(job, 'cancelled');
            } else {
              job.error = error?.message || String(error);
              this.finish(job, 'failed');
            }
          } finally {
            this.activeJob = null;
            this.controller = null;
          }

          // Crucial: Only break if user explicitly paused or cancelled the ENTIRE batch.
          // If a single file was cancelled or deleted, the runner MUST continue processing the remaining queued files!
          if ((job.status as TranslationJobStatus) === 'paused' || this.isCancelledAll) {
            break;
          }
        }
      } finally {
        this.runningPromise = null;
      }
    })();

    return this.runningPromise;
  }

  private abortActive(status: Extract<TranslationJobStatus, 'paused' | 'cancelled'>): void {
    if (!this.activeJob) return;
    this.activeJob.status = status;
    this.activeJob.completedAt = new Date().toISOString();
    this.emit(this.activeJob);
    try {
      this.controller?.abort(new DOMException(status === 'paused' ? 'Translation paused by user' : 'Translation cancelled by user', 'AbortError'));
    } catch {
      this.controller?.abort();
    }
  }

  private finish(job: TranslationJob, status: TranslationJobStatus): void {
    job.status = status;
    job.completedAt = new Date().toISOString();
    this.emit(job);
  }

  private emit(job: TranslationJob): void {
    this.listeners.forEach(listener => listener({ ...job }));
  }
}
