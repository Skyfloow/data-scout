import { ScraperType, ProductScrapeResult } from '../../../types';
import { IScraper } from '../adapters/IScraper';
import { CrawleeAdapter } from '../adapters/CrawleeAdapter';
import { FireCrawlAdapter } from '../adapters/FirecrawlAdapter';
import { jobService } from '../../storage/services/JobService';
import { storageService } from '../../storage/services/StorageService';
import { appendPriceSnapshot, getPriceHistory } from '../../../services/PriceHistoryService';
import { calculateDataQualityScore } from '../../../utils/scoring';
import { stabilizeProductPriceWithHistory } from '../../../services/PriceAnomalyService';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'ScrapingService' });

export class ScrapingService {
  private firecrawlAdapter: IScraper;

  constructor() {
    this.firecrawlAdapter = new FireCrawlAdapter();
  }

  triggerScrape(url: string, scraper: ScraperType): string {
    const jobId = jobService.createJob(url, scraper);
    this.processJob(jobId, url, scraper).catch((err) => {
      logger.error({ err }, `Unhandled error during background process for job ${jobId}`);
    });
    return jobId;
  }

    private async processJob(jobId: string, url: string, scraper: ScraperType): Promise<void> {
    try {
      let result: ProductScrapeResult;

      if (scraper === 'crawler') {
        const crawlerAdapter = new CrawleeAdapter();
        result = await crawlerAdapter.scrapeProduct(url);
      } else {
        result = await this.firecrawlAdapter.scrapeProduct(url);
      }

      if (result.error || !result.product) {
        logger.error(`[Job ${jobId}] Scraping failed: ${result.error || 'No product'}`);
        jobService.updateJobStatus(jobId, 'failed', undefined, result.error || 'Scraping returned no product');
        return;
      }

      // Calculate DataQualityScore
      const score = calculateDataQualityScore(result.product);
      result.product.metrics.dataQualityScore = score;
      const history = await getPriceHistory(url, result.product.metrics.asin);
      result.product = stabilizeProductPriceWithHistory(result.product, history);

      // Save to storage
      await storageService.saveProduct(scraper, result.product);

      // Append price snapshot to history only if quality is decent
      if (score >= 50) {
        await appendPriceSnapshot(url, result.product);
      } else {
        logger.warn(`[Job ${jobId}] Product bypassed PriceHistory due to low DataQualityScore: ${score}`);
      }

      jobService.updateJobStatus(jobId, 'completed', result.product.id);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      jobService.updateJobStatus(jobId, 'failed', undefined, errorMessage);
    }
  }
}

export const scrapingService = new ScrapingService();
