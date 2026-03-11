import { v4 as uuidv4 } from 'uuid';
import { ScraperType, ProductScrapeResult, Product, ProductMetrics } from '../../../types';
import { IScraper } from '../adapters/IScraper';
import { CrawleeAdapter } from '../adapters/CrawleeAdapter';
import { FireCrawlAdapter } from '../adapters/FirecrawlAdapter';
import { jobService } from '../../storage/services/JobService';
import { storageService } from '../../storage/services/StorageService';
import { appendPriceSnapshot, getPriceHistory } from '../../../services/PriceHistoryService';
import { calculateDataQualityScore } from '../../../utils/scoring';
import { stabilizeProductPriceWithHistory } from '../../../services/PriceAnomalyService';
import { logger as baseLogger } from '../../../utils/logger';
import { llmSelectorCache } from '../extractors/LLMSelectorCache';
import { multimodalFallbackExtractor } from '../extractors/MultimodalFallbackExtractor';
import { config } from '../../../config';

const logger = baseLogger.child({ module: 'ScrapingService' });

export class ScrapingService {
  private crawleeAdapter: IScraper;
  private firecrawlAdapter: IScraper;

  constructor() {
    this.crawleeAdapter = new CrawleeAdapter();
    this.firecrawlAdapter = new FireCrawlAdapter();
  }

  triggerScrape(url: string, scraper: ScraperType): string {
    const jobId = jobService.createJob(url, scraper);
    this.processJob(jobId, url, scraper).catch((err) => {
      logger.error({ err }, `Unhandled error during background process for job ${jobId}`);
    });
    return jobId;
  }

  private async processJob(jobId: string, url: string, scraperType: ScraperType): Promise<void> {
    try {
      let finalProduct: Product | undefined;
      let needsHeavyFallback = false;
      const phaseErrors: string[] = [];

      let crawleeResult: ProductScrapeResult = {};
      
      if (scraperType === 'firecrawl' || (url.includes('etsy.com') && config.firecrawlApiKey && config.etsyForceFirecrawl)) {
          logger.info(`[Job ${jobId}] explicitly requested 'firecrawl' or config.etsyForceFirecrawl is true. Skipping Phase 1 Crawlee Pass.`);
          needsHeavyFallback = true;
          phaseErrors.push('Phase 1 (Crawlee) skipped intentionally.');
      } else {
          // Phase 1: Fast Pass (Crawlee + Cheerio + Pre-Cached Selectors)
          logger.info(`[Job ${jobId}] Starting Phase 1 Fast Pass for ${url}`);
          crawleeResult = await this.crawleeAdapter.scrapeProduct(url);

          // Evaluate Phase 1 completeness
          if (crawleeResult.product && crawleeResult.product.metrics.price) {
             finalProduct = crawleeResult.product;
             logger.info(`[Job ${jobId}] Phase 1 succeeded natively!`);
          } else {
             needsHeavyFallback = true;
             const p1Error = crawleeResult.error || 'Missing critical data (price)';
             phaseErrors.push(`Phase 1 (Crawlee) failed: ${p1Error}`);
             logger.warn(`[Job ${jobId}] Phase 1 missed critical data or block: ${p1Error}. Planning Heavy Fallback.`);
             
             // Phase 2: Async Self-Healing (Cache new selector for FUTURE requests)
             if (crawleeResult.html && !crawleeResult.error?.includes('Blocked')) {
                 logger.info(`[Job ${jobId}] Triggering Phase 2 Self-Healing async task...`);
                 llmSelectorCache.heal(url, crawleeResult.html, 'price').catch(e => {
                     logger.error(`[Job ${jobId}] Phase 2 Healing failed: ${e.message}`);
                 });
             } else if (!crawleeResult.html) {
                 phaseErrors.push(`Phase 2 (Healing) skipped: No HTML returned from Phase 1.`);
             } else {
                 phaseErrors.push(`Phase 2 (Healing) skipped: Request was blocked by CAPTCHA.`);
             }
          }
      }

      // Phase 3: Heavy Multimodal Fallback (Gemini + Firecrawl Markdown + Crawlee Screenshot)
      if (needsHeavyFallback) {
         logger.info(`[Job ${jobId}] Starting Phase 3 Multimodal Fallback. Fetching markdown...`);
         const firecrawlResult = await this.firecrawlAdapter.scrapeProduct(url);
         
         if (firecrawlResult.markdown) {
             let marketplace = 'unknown';
             if (url.includes('amazon')) marketplace = 'amazon';
             else if (url.includes('etsy')) marketplace = 'etsy';

             const multimodalResult = await multimodalFallbackExtractor.extract(
                 url, 
                 firecrawlResult.markdown, 
                 crawleeResult.screenshotBase64, 
                 marketplace
             );
             
             if (multimodalResult.success) {
                   const mMetrics = multimodalResult.metrics || {};
                   const finalMetrics = {
                     currency: mMetrics.currency || 'USD',
                     description: mMetrics.description || '',
                     imageUrl: mMetrics.imageUrl || '',
                     brand: mMetrics.brand || '',
                     availability: mMetrics.availability || 'Unknown',
                     features: mMetrics.features || [],
                     imageUrls: mMetrics.imageUrls || [],
                     offers: mMetrics.offers || [],
                     ...mMetrics
                   } as ProductMetrics;
                   
                   finalProduct = {
                      id: uuidv4(),
                      title: multimodalResult.title || 'Unknown Product',
                      url,
                      marketplace,
                      metrics: finalMetrics,
                      scrapedAt: new Date().toISOString(),
                      scrapedBy: 'firecrawl'
                   };
                  logger.info(`[Job ${jobId}] Phase 3 Heavy Fallback succeeded!`);
             } else {
                  const p3Error = multimodalResult.error || 'Unknown Gemini extraction error';
                  phaseErrors.push(`Phase 3 (Gemini Extract) failed: ${p3Error}`);
                  logger.error(`[Job ${jobId}] Phase 3 Extract Failed: ${p3Error}`);
             }
         } else {
             const fcError = firecrawlResult.error || 'Empty markdown returned';
             phaseErrors.push(`Phase 3 (Firecrawl Fetch) failed: ${fcError}`);
             logger.error(`[Job ${jobId}] Phase 3 aborted. Firecrawl error: ${fcError}`);
         }
      }

      if (!finalProduct) {
        throw new Error(`Scraping Waterfall Failed:\n - ${phaseErrors.join('\n - ')}`);
      }

      // Final processing: Scoring and History
      const score = calculateDataQualityScore(finalProduct);
      finalProduct.metrics.dataQualityScore = score;
      
      const history = await getPriceHistory(url, finalProduct.metrics.asin);
      finalProduct = stabilizeProductPriceWithHistory(finalProduct, history);

      // Save to storage
      await storageService.saveProduct(finalProduct.scrapedBy, finalProduct);

      // Append price snapshot if quality is good
      if (score >= 50 && finalProduct.metrics.price) {
        await appendPriceSnapshot(url, finalProduct);
      } else {
        logger.warn(`[Job ${jobId}] Product bypassed PriceHistory due to low DataQualityScore (${score}) or missing price.`);
      }

      jobService.updateJobStatus(jobId, 'completed', finalProduct.id);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`[Job ${jobId}] Scraping job completely failed:\n${errorMessage}`);
      jobService.updateJobStatus(jobId, 'failed', undefined, errorMessage);
    }
  }
}

export const scrapingService = new ScrapingService();
