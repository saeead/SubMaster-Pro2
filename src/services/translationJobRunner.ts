import { TranslationJob, TranslationJobStatus } from '../types';

export type TranslationJobHandler = (job: TranslationJob, signal: AbortSignal) => Promise<void>;
export type TranslationJobListener = (job: TranslationJob) => void;

export class TranslationJobRunner {
  private queue: TranslationJob[] = [];
  private activeJob: TranslationJob | null = null;
  private controller: AbortController | null = null;
  private listeners = new Set<TranslationJobListener>();

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
      this.abortActive('cancelled');
    } else {
      this.dequeue(fileId);
    }
  }

  public isProcessing(): boolean {
    return this.activeJob !== null || this.queue.length > 0;
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

  public cancelAll(): void {
    this.abortActive('cancelled');
    this.queue.splice(0).forEach(job => this.finish(job, 'cancelled'));
  }

  public async run(): Promise<void> {
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

      if ((job.status as TranslationJobStatus) === 'paused' || (job.status as TranslationJobStatus) === 'cancelled') break;
    }
  }

  private abortActive(status: Extract<TranslationJobStatus, 'paused' | 'cancelled'>): void {
    if (!this.activeJob) return;
    this.activeJob.status = status;
    this.activeJob.completedAt = new Date().toISOString();
    this.emit(this.activeJob);
    this.controller?.abort();
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
