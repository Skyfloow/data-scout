import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { scrapingService } from '../modules/scraping/services/ScrapingService';
import { jobService } from '../modules/storage/services/JobService';
import { ScraperType } from '../types';
import { createApiErrorPayload } from '../utils/http';

interface ScrapeBody {
  url: string;
  scraper: ScraperType;
}

const scrapingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post<{ Body: ScrapeBody }>(
    '/scrape',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      },
      schema: {
        description: 'Triggers a web scraping job for a given URL and Scraper variant',
        tags: ['Scraping'],
        body: {
          type: 'object',
          required: ['url', 'scraper'],
          properties: {
            url: { type: 'string', format: 'uri' },
            scraper: { type: 'string', enum: ['crawler', 'firecrawl'] },
          },
        },
        response: {
          202: {
            description: 'Job Accepted',
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { url, scraper } = request.body;
      const jobId = scrapingService.triggerScrape(url, scraper);
      return reply.code(202).send({ jobId, status: 'pending' });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/jobs/:id',
    {
      schema: {
        description: 'Get the status of a scraping job',
        tags: ['Scraping'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Job Status',
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
              resultId: { type: 'string', nullable: true },
              error: { type: 'string', nullable: true },
            },
          },
          404: {
            description: 'Job Not Found',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const job = jobService.getJob(request.params.id);
      if (!job) {
        return reply.code(404).send(createApiErrorPayload('JOB_NOT_FOUND', 'Job not found', 404));
      }
      return {
        jobId: job.jobId,
        status: job.status,
        resultId: job.resultId,
        error: job.error,
      };
    }
  );
};

export default scrapingRoutes;
