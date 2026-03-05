import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { IScraper } from './IScraper';
import { ProductScrapeResult, Product, ProductMetrics } from '../../../types';
import { fetcher, FetchResult } from '../network/Fetcher';
import { playwrightFetcher } from '../network/PlaywrightFetcher';
import { metadataExtractor } from '../extractors/MetadataExtractor';
import { PlatformExtractor } from '../extractors/PlatformExtractor';
import { aiFallbackExtractor } from '../extractors/AIFallbackExtractor';
import { calculateCompletenessScore, isCriticalDataMissing, ExtractorContext } from '../extractors/types';
import { convertToUSD } from '../../../services/CurrencyService';
import { storageService } from '../../storage/services/StorageService';
import { proxyManager } from '../../proxy/services/ProxyManager';
import { extractAmazonSerp } from '../extractors/amazonSerp';
import { extractEtsySerp } from '../extractors/etsySerp';
import { SerpResult } from '../../../types';
import { logger as baseLogger } from '../../../utils/logger';
import { syncMetricsPriceFromBuyBox } from '../../../utils/price';
import { config } from '../../../config';

const logger = baseLogger.child({ module: 'CrawlerAdapter' });

const sanitizeTitleCandidate = (value: string | undefined): string => {
  if (!value) return '';
  const cleaned = value
    .replace(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[\-|:]\s*amazon(?:\.[a-z.]+)?\s*$/i, '')
    .trim();
  if (!cleaned) return '';
  if (!/[a-z0-9а-я]/i.test(cleaned)) return '';
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(cleaned)) return '';
  return cleaned;
};

const pickBestTitle = (...candidates: Array<string | undefined>): string => {
  for (const candidate of candidates) {
    const sanitized = sanitizeTitleCandidate(candidate);
    if (sanitized) return sanitized;
  }
  return 'Unknown Product';
};

function isBotBlocked(success: boolean, html: string, url: string = ''): boolean {
  if (!success || !html) return true;
  if (url.includes('etsy.com')) {
      if (html.includes('Pardon Our Interruption') || 
          html.includes('distil_ident_challenge') || 
          html.includes('px-captcha') ||
          html.includes('cloudflare') ||
          html.includes('cf-turnstile') ||
          html.includes('challenges.cloudflare.com')) {
          return true;
      }
      return false;
  }
  return html.includes('action="/errors/validateCaptcha"') ||
         html.includes('api-services-support@amazon.com') ||
         (html.includes('To discuss automated access to Amazon data') && html.includes('contact'));
}

export class CrawlerAdapter implements IScraper {
  
  async scrapeProduct(url: string): Promise<ProductScrapeResult> {
    try {
      if (url.includes('etsy.com')) {
          if (config.firecrawlApiKey && config.etsyForceFirecrawl) {
              logger.info('[CrawlerAdapter] ETSY_FORCE_FIRECRAWL=true, using Firecrawl for Etsy product.');
              const FCAdapter = require('./FirecrawlAdapter').FireCrawlAdapter;
              const fc = new FCAdapter();
              return await fc.scrapeProduct(url);
          }
      }

      const settings = await storageService.getSettings();
      const strategy = settings.scrapingStrategy || 'hybrid';
      
      let fetchResult: FetchResult | undefined;
      const maxRetries = 3;
      let lastError = '';
      let isBlocked = false;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const proxyUrl = await proxyManager.getProxyString();
        
        if (strategy === 'stealth') {
          logger.info(`Mode: stealth. Try ${attempt + 1}. Fetching: ${url}`);
          fetchResult = await playwrightFetcher.fetchHtml(url, proxyUrl);
        } else {
          logger.info(`Mode: ${strategy}. Try ${attempt + 1}. Fetching: ${url}`);
          fetchResult = await fetcher.fetchHtml(url, proxyUrl);

          if (strategy === 'hybrid') {
            const contentStr = fetchResult.html || '';
            if (isBotBlocked(fetchResult.success, contentStr, url)) {
              logger.warn(`Blocked detected. Falling back to Playwright Stealth...`);
              fetchResult = await playwrightFetcher.fetchHtml(url, proxyUrl);
            }
          }
        }

        const contentStr = fetchResult.html || '';
        if (fetchResult.success && fetchResult.html && !isBotBlocked(fetchResult.success, contentStr, url)) {
          break; // Success
        } else {
          isBlocked = isBotBlocked(fetchResult.success, contentStr, url);
          lastError = fetchResult.error || (isBlocked ? 'Blocked by CAPTCHA/Anti-bot' : 'Unknown Error');
          logger.warn(`Attempt ${attempt + 1} failed for ${url}: ${lastError}`);
          if (proxyUrl) {
            proxyManager.markAsDead(proxyUrl);
          }
        }
      }

      if (!fetchResult || !fetchResult.success || !fetchResult.html) {
        if (url.includes('etsy.com') && config.firecrawlApiKey && lastError.toLowerCase().includes('blocked')) {
          logger.warn('[CrawlerAdapter] Etsy local fetch blocked after retries. Falling back to Firecrawl.');
          const FCAdapter = require('./FirecrawlAdapter').FireCrawlAdapter;
          const fc = new FCAdapter();
          return await fc.scrapeProduct(url);
        }
        return { error: `Failed to fetch URL after ${maxRetries} attempts. Last error: ${lastError}` };
      }

      const $ = cheerio.load(fetchResult.html);
      const context: ExtractorContext = { url, html: fetchResult.html, $ };

      const extractor = new PlatformExtractor();
      const [metaResult, platformResult] = await Promise.all([
        metadataExtractor.extract(context),
        extractor.extract(context)
      ]);

      let finalTitle = pickBestTitle(platformResult.title, metaResult.title);
      let finalMetrics: Partial<ProductMetrics> = { ...metaResult.metrics };
      
      if (platformResult.metrics) {
        for (const [key, value] of Object.entries(platformResult.metrics)) {
          if (value !== undefined && value !== null && value !== '' && value !== 0 && !(Array.isArray(value) && value.length === 0)) {
            (finalMetrics as any)[key] = value;
          }
        }
      }

      const currentProductMock: Partial<Product> = { title: finalTitle, metrics: finalMetrics };
      const score = calculateCompletenessScore(currentProductMock);
      const isCriticalMissing = isCriticalDataMissing(currentProductMock);

      if (score < 50 || isCriticalMissing) {
        logger.info(`completeness=${score}%, criticalMissing=${isCriticalMissing}. Triggering AI fallback.`);
        const aiResult = await aiFallbackExtractor.extract(context);
        if (aiResult.success) {
          finalTitle = pickBestTitle(aiResult.title, finalTitle);
          finalMetrics = { ...aiResult.metrics, ...finalMetrics };
        }
      }

      finalTitle = pickBestTitle(finalTitle, platformResult.title, metaResult.title);

      const scrapedAt = new Date().toISOString();
      finalMetrics = syncMetricsPriceFromBuyBox(finalMetrics, scrapedAt);

      // Currency normalization
      const rawCurrency = finalMetrics.currency || 'USD';
      if (finalMetrics.price) {
        finalMetrics.priceUSD = convertToUSD(finalMetrics.price, rawCurrency);
      }
      if (finalMetrics.itemPrice) {
        finalMetrics.itemPriceUSD = convertToUSD(finalMetrics.itemPrice, rawCurrency);
      }
      if (finalMetrics.landedPrice) {
        finalMetrics.landedPriceUSD = convertToUSD(finalMetrics.landedPrice, rawCurrency);
      }
      if (finalMetrics.offers?.length) {
        finalMetrics.averageOfferPriceUSD = parseFloat(
          (finalMetrics.offers.reduce((sum, o) => sum + convertToUSD(o.price, o.currency), 0) / finalMetrics.offers.length).toFixed(2)
        );
      }

      let marketplace = 'unknown';
      if (url.includes('amazon')) marketplace = 'amazon';
      else if (url.includes('ebay')) marketplace = 'ebay';
      else if (url.includes('bestbuy')) marketplace = 'bestbuy';
      else if (url.includes('etsy')) marketplace = 'etsy';

      // Build Product — all fields from finalMetrics flow through automatically
      const product: Product = {
        id: uuidv4(),
        title: finalTitle,
        url,
        marketplace,
        metrics: finalMetrics as Product['metrics'],
        scrapedAt,
        scrapedBy: 'crawler',
      };

      return { product };

    } catch (err: any) {
      return { error: `Crawler engine failed: ${err.message}` };
    }
  }

  async scrapeSearch(keyword: string, marketplace: string): Promise<{ result?: SerpResult, error?: string }> {
    try {
      let url = '';
      if (marketplace.includes('amazon')) {
          const tld = marketplace.toLowerCase().replace('amazon.', '') || 'com';
          url = `https://www.amazon.${tld}/s?k=${encodeURIComponent(keyword)}`;
      } else if (marketplace.includes('etsy')) {
          url = `https://www.etsy.com/search?q=${encodeURIComponent(keyword)}`;
          
          if (config.firecrawlApiKey && config.etsyForceFirecrawl) {
              logger.info('[CrawlerAdapter] ETSY_FORCE_FIRECRAWL=true, using Firecrawl for Etsy SERP.');
              const FireCrawlApp = require('@mendable/firecrawl-js').default;
              const fc = new FireCrawlApp({ apiKey: config.firecrawlApiKey });
              const res = await fc.scrapeUrl(url, { formats: ['html'], timeout: 60000 });
              if (res.success && res.html) {
                  return { result: extractEtsySerp(res.html, keyword, marketplace) };
              } else {
                  return { error: `Failed to fetch Etsy SERP via Firecrawl. Error: ${res.error}` };
              }
          }
      } else {
          return { error: 'Unsupported marketplace for search' };
      }

      const settings = await storageService.getSettings();
      const strategy = settings.scrapingStrategy || 'hybrid';
      
      let fetchResult: FetchResult | undefined;
      const maxRetries = 3;
      let lastError = '';

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const proxyUrl = await proxyManager.getProxyString();
        
        if (strategy === 'stealth') {
          logger.info(`SERP Mode: stealth. Try ${attempt + 1} for: ${keyword}`);
          fetchResult = await playwrightFetcher.fetchHtml(url, proxyUrl);
        } else {
          logger.info(`SERP Mode: HTTP. Try ${attempt + 1} for: ${keyword}`);
          fetchResult = await fetcher.fetchHtml(url, proxyUrl);

          if (strategy === 'hybrid') {
            const contentStr = fetchResult.html || '';
            if (isBotBlocked(fetchResult.success, contentStr, url)) {
              logger.warn(`SERP block detected. Try ${attempt + 1}. Falling back to Playwright...`);
              fetchResult = await playwrightFetcher.fetchHtml(url, proxyUrl);
            }
          }
        }

        const contentStr = fetchResult.html || '';
        if (fetchResult.success && fetchResult.html && !isBotBlocked(fetchResult.success, contentStr, url)) {
          break; // Success
        } else {
          lastError = fetchResult.error || (isBotBlocked(fetchResult.success, contentStr, url) ? 'Blocked by CAPTCHA/Anti-bot' : 'Unknown Error');
          logger.warn(`SERP attempt ${attempt + 1} failed: ${lastError}`);
          if (proxyUrl) {
            proxyManager.markAsDead(proxyUrl);
          }
        }
      }

      if (!fetchResult || !fetchResult.success || !fetchResult.html) {
          if (config.firecrawlApiKey && lastError.toLowerCase().includes('blocked')) {
              logger.warn(`SERP block detected locally. Falling back to Firecrawl for SERP...`);
              const FireCrawlApp = require('@mendable/firecrawl-js').default;
              const fc = new FireCrawlApp({ apiKey: config.firecrawlApiKey });
              const res = await fc.scrapeUrl(url, { formats: ['html'], timeout: 60000 });
              if (res.success && res.html) {
                  fetchResult = { success: true, html: res.html };
              } else {
                  return { error: `Failed to fetch SERP via Firecrawl. Error: ${res.error}` };
              }
          } else {
              return { error: `Failed to fetch SERP after ${maxRetries} attempts. Last Error: ${lastError}` };
          }
      }

      let serpResult;
      if (marketplace.includes('amazon')) {
          serpResult = extractAmazonSerp(fetchResult.html, keyword, marketplace);
      } else if (marketplace.includes('etsy')) {
          serpResult = extractEtsySerp(fetchResult.html, keyword, marketplace);
      }
      
      return { result: serpResult };

    } catch (err: any) {
      return { error: `SERP Scrape failed: ${err.message}` };
    }
  }
}
