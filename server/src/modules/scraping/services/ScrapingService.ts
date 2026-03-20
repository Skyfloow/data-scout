import { v4 as uuidv4 } from 'uuid';
import { ScraperType, ProductScrapeResult, Product, ProductMetrics, Offer, BuyBoxInfo } from '../../../types';
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

  private normalizeOffer(raw: any, fallbackCurrency: string): Offer | null {
    if (!raw || typeof raw !== 'object') return null;
    const sellerName = String(raw.sellerName || raw.seller || '').trim();
    const parsedPrice = Number(raw.price);
    if (!sellerName || !Number.isFinite(parsedPrice) || parsedPrice <= 0) return null;
    return {
      offerId: raw.offerId ? String(raw.offerId).trim() : undefined,
      offerUrl: raw.offerUrl ? String(raw.offerUrl).trim() : undefined,
      sellerName,
      price: parsedPrice,
      currency: String(raw.currency || fallbackCurrency || 'USD'),
      stockStatus: String(raw.stockStatus || raw.availability || 'In Stock'),
      stockCount: typeof raw.stockCount === 'number' ? raw.stockCount : null,
      condition: raw.condition ? String(raw.condition) : 'New',
      deliveryInfo: raw.deliveryInfo ? String(raw.deliveryInfo) : undefined,
      isFBA: Boolean(raw.isFBA),
    };
  }

  private isStableOfferId(value?: string): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith('aod-')) return false;
    if (normalized === 'aod-offer' || normalized === 'aod-offer-price' || normalized === 'aod-offer-list') return false;
    return normalized.length >= 12;
  }
  private extractSellerIdFromOfferUrl(offerUrl?: string): string {
    const raw = String(offerUrl || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, 'https://www.amazon.com');
      const sellerId = String(parsed.searchParams.get('smid') || parsed.searchParams.get('seller') || '').trim();
      if (sellerId) return sellerId.toLowerCase();
    } catch {
      // Fall through to regex extraction.
    }
    const match = raw.match(/[?&](?:smid|seller)=([^&#]+)/i);
    return String(match?.[1] || '').trim().toLowerCase();
  }

  private normalizeAmazonMetrics(metrics: ProductMetrics): ProductMetrics {
    const next = { ...metrics } as ProductMetrics;
    const fallbackCurrency = next.currency || 'USD';

    const amazonMetrics = next.amazonMetrics ? { ...next.amazonMetrics } : {};
    const rawOffers = [
      ...(Array.isArray(next.offers) ? next.offers : []),
      ...(Array.isArray(amazonMetrics.offers) ? amazonMetrics.offers : []),
    ];
    const normalizedOffers: Offer[] = [];
    const dedup = new Set<string>();
    for (const rawOffer of rawOffers) {
      const normalized = this.normalizeOffer(rawOffer, fallbackCurrency);
      if (!normalized) continue;
      const offerId = String(normalized.offerId || '').trim().toLowerCase();
      const stableOfferId = this.isStableOfferId(offerId) ? offerId : '';
      const sellerId = this.extractSellerIdFromOfferUrl(normalized.offerUrl);
      const key = sellerId
        ? [
            'seller-id',
            sellerId,
            normalized.price.toFixed(2),
            String(normalized.condition || '').toLowerCase(),
          ].join('|')
        : [
            'no-seller-id',
            stableOfferId || 'no-stable-id',
            normalized.sellerName.toLowerCase(),
            normalized.price.toFixed(2),
            String(normalized.condition || '').toLowerCase(),
            String(normalized.deliveryInfo || '').toLowerCase(),
            String(normalized.stockStatus || '').toLowerCase(),
            typeof normalized.stockCount === 'number' ? String(normalized.stockCount) : 'null',
            String(normalized.offerUrl || '').toLowerCase(),
            normalized.isFBA ? 'fba' : 'mfn',
          ].join('|');
      if (dedup.has(key)) continue;
      dedup.add(key);
      normalizedOffers.push(normalized);
    }

    const buyBoxFromAmazon = amazonMetrics.buyBox as BuyBoxInfo | undefined;
    const buyBoxFromTop = next.buyBox as BuyBoxInfo | undefined;
    const buyBoxSeller =
      String(
        buyBoxFromTop?.sellerName
          || buyBoxFromAmazon?.sellerName
          || (next as any).buyBoxSeller
          || normalizedOffers[0]?.sellerName
          || ''
      ).trim();

    if (buyBoxSeller) {
      const buyBoxPrice = Number(
        buyBoxFromTop?.price
          || buyBoxFromAmazon?.price
          || next.price
          || normalizedOffers[0]?.price
      );
      if (Number.isFinite(buyBoxPrice) && buyBoxPrice > 0) {
        next.buyBox = {
          sellerName: buyBoxSeller,
          price: buyBoxPrice,
          isFBA: Boolean(buyBoxFromTop?.isFBA || buyBoxFromAmazon?.isFBA),
          isAmazon: Boolean(buyBoxFromTop?.isAmazon || buyBoxFromAmazon?.isAmazon),
          observedAt: buyBoxFromTop?.observedAt || buyBoxFromAmazon?.observedAt,
          sellerRatingPercent: buyBoxFromTop?.sellerRatingPercent || buyBoxFromAmazon?.sellerRatingPercent,
          sellerRatingsCount: buyBoxFromTop?.sellerRatingsCount || buyBoxFromAmazon?.sellerRatingsCount,
          shipsFrom: buyBoxFromTop?.shipsFrom || buyBoxFromAmazon?.shipsFrom,
        };
      }
    }

    if (normalizedOffers.length > 0) {
      next.offers = normalizedOffers;
    } else if (next.buyBox?.sellerName && next.buyBox?.price && next.buyBox.price > 0) {
      next.offers = [{
        sellerName: next.buyBox.sellerName,
        price: next.buyBox.price,
        currency: next.currency || 'USD',
        stockStatus: next.availability || 'In Stock',
        stockCount: typeof next.stockCount === 'number' ? next.stockCount : null,
        condition: 'New',
        isFBA: next.buyBox.isFBA,
      }];
    }

    next.amazonMetrics = {
      ...amazonMetrics,
      buyBox: next.buyBox || buyBoxFromAmazon,
      offers: next.offers || amazonMetrics.offers || [],
      sellerCount: amazonMetrics.sellerCount || next.sellerCount || next.offers?.length || 0,
    };
    next.sellerCount = next.amazonMetrics.sellerCount;

    return next;
  }

  private hasValidPrice(product?: Product): boolean {
    const value = Number(product?.metrics?.price || product?.metrics?.itemPrice || 0);
    return Number.isFinite(value) && value > 0;
  }

  private isAmazonUrl(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase().includes('amazon.');
    } catch {
      return url.includes('amazon.');
    }
  }

  private isAmazonOwnedSellerName(name?: string): boolean {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) return false;
    return /^amazon(?:\.[a-z]{2,3})?$/.test(normalized)
      || normalized.includes('sold by amazon')
      || normalized.includes('amazon resale')
      || normalized.includes('warehouse deals');
  }

  private getPrimarySellerName(product?: Product): string {
    const metrics = product?.metrics as ProductMetrics | undefined;
    return String(
      metrics?.buyBox?.sellerName
      || metrics?.selectedOffer?.sellerName
      || metrics?.offers?.[0]?.sellerName
      || ''
    ).trim();
  }

  private shouldPreferCrawleeAmazonResult(firecrawlProduct?: Product, crawleeProduct?: Product): boolean {
    if (!this.hasValidPrice(crawleeProduct)) return false;
    if (!this.hasValidPrice(firecrawlProduct)) return true;

    const fireSeller = this.getPrimarySellerName(firecrawlProduct);
    const crawleeSeller = this.getPrimarySellerName(crawleeProduct);
    const fireAmazon = this.isAmazonOwnedSellerName(fireSeller);
    const crawleeAmazon = this.isAmazonOwnedSellerName(crawleeSeller);

    if (!fireAmazon && crawleeAmazon) return true;

    const firePrice = Number(firecrawlProduct?.metrics?.price || firecrawlProduct?.metrics?.itemPrice || 0);
    const crawleePrice = Number(crawleeProduct?.metrics?.price || crawleeProduct?.metrics?.itemPrice || 0);
    const avgBase = Math.max(1, (firePrice + crawleePrice) / 2);
    const deltaRatio = Math.abs(crawleePrice - firePrice) / avgBase;
    if (crawleeAmazon && deltaRatio >= 0.01) return true;

    const fireOffers = Number(firecrawlProduct?.metrics?.offers?.length || 0);
    const crawleeOffers = Number(crawleeProduct?.metrics?.offers?.length || 0);
    if (crawleeOffers >= 3 && fireOffers <= 1) return true;

    return false;
  }

  private async processJob(jobId: string, url: string, scraperType: ScraperType): Promise<void> {
    try {
      let finalProduct: Product | undefined;
      let needsHeavyFallback = false;
      const phaseErrors: string[] = [];

      let crawleeResult: ProductScrapeResult = {};
      let firecrawlResult: ProductScrapeResult = {};
      
      if (scraperType === 'firecrawl' || (url.includes('etsy.com') && config.firecrawlApiKey && config.etsyForceFirecrawl)) {
          // Phase 1: Native Firecrawl pass (HTML + platform selectors)
          logger.info(`[Job ${jobId}] Starting Phase 1 Firecrawl pass for ${url}`);
          firecrawlResult = await this.firecrawlAdapter.scrapeProduct(url);

          if (firecrawlResult.product && firecrawlResult.product.metrics.price) {
             finalProduct = firecrawlResult.product;
             logger.info(`[Job ${jobId}] Phase 1 (Firecrawl) succeeded natively!`);

             // Phase 1.25: Amazon reconciliation pass.
             // Firecrawl snapshots can capture a non-primary seller/price block.
             // Run Crawlee as verifier and prefer it only when it is clearly better.
             if (this.isAmazonUrl(url)) {
               try {
                 crawleeResult = await this.crawleeAdapter.scrapeProduct(url);
                 if (this.shouldPreferCrawleeAmazonResult(finalProduct, crawleeResult.product)) {
                   finalProduct = crawleeResult.product;
                   logger.info(`[Job ${jobId}] Phase 1.25 (Crawlee reconcile) replaced Firecrawl result for Amazon quality.`);
                 } else {
                   logger.info(`[Job ${jobId}] Phase 1.25 (Crawlee reconcile) kept Firecrawl result.`);
                 }
               } catch (reconcileError: any) {
                 logger.warn(`[Job ${jobId}] Phase 1.25 (Crawlee reconcile) failed: ${reconcileError?.message || 'unknown error'}`);
               }
             }
          } else {
             const p1Error = firecrawlResult.error || 'Missing critical data (price)';
             phaseErrors.push(`Phase 1 (Firecrawl) failed: ${p1Error}`);

             // Phase 1.5: Amazon reliability fallback (Crawlee)
             // Firecrawl may return incomplete Amazon snapshots (price=0/missing metrics) for some ASIN pages.
             // In this case, run Crawlee to recover complete metrics before expensive multimodal fallback.
             if (url.includes('amazon')) {
               logger.warn(`[Job ${jobId}] Phase 1 (Firecrawl) missed critical data: ${p1Error}. Trying Crawlee fallback for Amazon...`);
               crawleeResult = await this.crawleeAdapter.scrapeProduct(url);
               if (crawleeResult.product && crawleeResult.product.metrics.price) {
                 finalProduct = crawleeResult.product;
                 logger.info(`[Job ${jobId}] Phase 1.5 (Crawlee fallback) succeeded for Firecrawl flow.`);
               } else {
                 needsHeavyFallback = true;
                 const p15Error = crawleeResult.error || 'Missing critical data (price)';
                 phaseErrors.push(`Phase 1.5 (Crawlee fallback) failed: ${p15Error}`);
                 logger.warn(`[Job ${jobId}] Phase 1.5 (Crawlee fallback) failed: ${p15Error}. Planning Heavy Fallback.`);
               }
             } else {
               needsHeavyFallback = true;
               logger.warn(`[Job ${jobId}] Phase 1 (Firecrawl) missed critical data: ${p1Error}. Planning Heavy Fallback.`);
             }
          }
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
         if (!firecrawlResult.markdown) {
           firecrawlResult = await this.firecrawlAdapter.scrapeProduct(url);
         }
         
         if (firecrawlResult.markdown) {
             const marketplace = (() => {
               try {
                 return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
               } catch {
                 if (url.includes('amazon')) return 'amazon';
                 if (url.includes('etsy')) return 'etsy';
                 return 'unknown';
               }
             })();

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

      if (url.includes('amazon')) {
        finalProduct.metrics = this.normalizeAmazonMetrics(finalProduct.metrics);
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
