import { describe, it, expect, beforeEach } from 'vitest';
import { JobService } from '../src/modules/storage/services/JobService';

describe('JobService', () => {
  let jobService: JobService;

  beforeEach(() => {
    jobService = new JobService();
  });

  it('should create a new job with pending status', () => {
    const jobId = jobService.createJob('https://example.com/product', 'crawler');
    expect(jobId).toBeDefined();

    const job = jobService.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe('pending');
    expect(job?.url).toBe('https://example.com/product');
    expect(job?.scraper).toBe('crawler');
  });

  it('should update job status', () => {
    const jobId = jobService.createJob('https://example.com/product', 'firecrawl');
    jobService.updateJobStatus(jobId, 'completed', 'result-123');

    const job = jobService.getJob(jobId);
    expect(job?.status).toBe('completed');
    expect(job?.resultId).toBe('result-123');
  });

  it('should update job to failed with an error', () => {
    const jobId = jobService.createJob('https://example.com/product', 'crawler');
    jobService.updateJobStatus(jobId, 'failed', undefined, 'Captcha blocked');

    const job = jobService.getJob(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toBe('Captcha blocked');
  });
});
