import { ScraperType, ProductScrapeResult } from '../../../types';
import { IScraper } from '../adapters/IScraper';
import { CrawleeAdapter } from '../adapters/CrawleeAdapter';
import { FireCrawlAdapter } from '../adapters/FirecrawlAdapter';
import { CrawlerAdapter } from '../adapters/CrawlerAdapter';
import { jobService } from '../../storage/services/JobService';
import { storageService } from '../../storage/services/StorageService';
import { appendPriceSnapshot, getPriceHistory } from '../../../services/PriceHistoryService';
import { calculateDataQualityScore } from '../../../utils/scoring';
import { isCriticalDataMissing } from '../extractors/types';
import { stabilizeProductPriceWithHistory } from '../../../services/PriceAnomalyService';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'ScrapingService' });

export class ScrapingService {
  private crawleeAdapter: IScraper;
  private firecrawlAdapter: IScraper;
  private legacyCrawlerAdapter: IScraper;

  constructor() {
    this.crawleeAdapter = new CrawleeAdapter();
    this.firecrawlAdapter = new FireCrawlAdapter();
    this.legacyCrawlerAdapter = new CrawlerAdapter();
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
        result = await this.crawleeAdapter.scrapeProduct(url);
        const isDataMissing = result.product ? isCriticalDataMissing(result.product) : true;

        if (result.error || isDataMissing) {
          logger.warn(
            `[Job ${jobId}] Crawlee (+ LLM) failed or missing critical data for ${url}.` +
            ` ${result.error ? ` Reason: ${result.error}.` : ''}` +
            ' Trying Firecrawl (+ LLM) fallback...',
          );
          const fallbackResult = await this.firecrawlAdapter.scrapeProduct(url);
          const fallbackIsMissing = fallbackResult.product ? isCriticalDataMissing(fallbackResult.product) : true;

          if (!fallbackResult.error && fallbackResult.product) {
            // If fallback succeeded completely, or original didn't even return a product, use fallback
            if (!fallbackIsMissing || !result.product) {
              result = fallbackResult;
            }
          }
        }
      } else {
        result = await this.firecrawlAdapter.scrapeProduct(url);
        const isDataMissing = result.product ? isCriticalDataMissing(result.product) : true;

        if (result.error || isDataMissing) {
          const firecrawlError = result.error || 'Firecrawl missing critical data';
          logger.warn(
            `[Job ${jobId}] Firecrawl (+ LLM) failed or missing critical data for ${url}.` +
            ` ${result.error ? ` Reason: ${result.error}.` : ''}` +
            ' Trying Crawlee (+ LLM) fallback...',
          );
          const fallbackResult = await this.crawleeAdapter.scrapeProduct(url);
          const fallbackIsMissing = fallbackResult.product ? isCriticalDataMissing(fallbackResult.product) : true;

          if (!fallbackResult.error && fallbackResult.product) {
            if (!fallbackIsMissing || !result.product) {
              result = fallbackResult;
            }
          } else {
            const crawleeError = fallbackResult.error || 'Crawlee fallback returned no product';
            if (url.toLowerCase().includes('etsy')) {
              logger.warn(
                `[Job ${jobId}] Crawlee fallback also failed for ${url}. Trying legacy crawler...`,
              );
              const legacyResult = await this.legacyCrawlerAdapter.scrapeProduct(url);
              const legacyIsMissing = legacyResult.product ? isCriticalDataMissing(legacyResult.product) : true;

              if (!legacyResult.error && legacyResult.product && (!legacyIsMissing || !result.product)) {
                result = legacyResult;
              } else if (!result.product) {
                const legacyError = legacyResult.error || 'Legacy crawler fallback failed';
                result = { error: `Firecrawl failed: ${firecrawlError}; Crawlee failed: ${crawleeError}; Legacy failed: ${legacyError}` };
              }
            } else if (!result.product) {
              result = { error: `Firecrawl failed: ${firecrawlError}; Crawlee fallback failed: ${crawleeError}` };
            }
          }
        }
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
      await storageService.saveProduct(result.product.scrapedBy, result.product);

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
