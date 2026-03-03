import { JobStatus, ScrapeJob, ScraperType } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../config';

export class JobService {
  private jobs: Map<string, ScrapeJob> = new Map();
  private readonly retentionMs = config.jobRetentionMs;
  private readonly maxJobs = config.maxJobs;

  private prune(): void {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : 0;
      if (finishedAt > 0 && now - finishedAt > this.retentionMs) {
        this.jobs.delete(jobId);
      }
    }

    if (this.jobs.size <= this.maxJobs) return;
    const sorted = Array.from(this.jobs.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const overflow = this.jobs.size - this.maxJobs;
    for (let i = 0; i < overflow; i++) {
      const target = sorted[i];
      if (target) this.jobs.delete(target.jobId);
    }
  }

  createJob(url: string, scraper: ScraperType): string {
    this.prune();
    const jobId = uuidv4();
    this.jobs.set(jobId, {
      jobId,
      url,
      scraper,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    return jobId;
  }

  getJob(jobId: string): ScrapeJob | undefined {
    this.prune();
    return this.jobs.get(jobId);
  }

  updateJobStatus(jobId: string, status: JobStatus, resultId?: string, error?: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      if (resultId) job.resultId = resultId;
      if (error) job.error = error;
      
      // Calculate duration when job finishes
      if (status === 'completed' || status === 'failed') {
        const start = new Date(job.createdAt).getTime();
        job.durationMs = Date.now() - start;
        job.finishedAt = new Date().toISOString();
      }

      this.jobs.set(jobId, job);
    }
  }

  getAllJobs(): ScrapeJob[] {
    this.prune();
    return Array.from(this.jobs.values());
  }
}

// Singleton export
export const jobService = new JobService();
