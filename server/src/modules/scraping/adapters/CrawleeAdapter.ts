import { v4 as uuidv4 } from 'uuid';
import { PlaywrightCrawler, ProxyConfiguration, Configuration, log, PlaywrightCrawlingContext } from 'crawlee';
import { IScraper } from './IScraper';
import { ProductScrapeResult, Product, ProductMetrics } from '../../../types';
import { storageService } from '../../storage/services/StorageService';
import { proxyManager } from '../../proxy/services/ProxyManager';
import { convertToUSD } from '../../../services/CurrencyService';
import { logger as baseLogger } from '../../../utils/logger';
import { detectCurrencyFromDomain } from '../../../utils/parsers';
import { syncMetricsPriceFromBuyBox } from '../../../utils/price';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { PlatformExtractor } from '../extractors/PlatformExtractor';
import { metadataExtractor } from '../extractors/MetadataExtractor';
import { llmSelectorCache } from '../extractors/LLMSelectorCache';

import { fetcher, FetchResult } from '../network/Fetcher';
import { playwrightFetcher } from '../network/PlaywrightFetcher';
import { extractAmazonSerp } from '../extractors/amazonSerp';
import { extractEtsySerp } from '../extractors/etsySerp';
import { SerpResult } from '../../../types';
import { config } from '../../../config';

chromium.use(stealthPlugin());

const logger = baseLogger.child({ module: 'CrawleeAdapter' });
log.setLevel(log.LEVELS.WARNING);

export class CrawleeAdapter implements IScraper {
  
  private async cleanupSnapshots(): Promise<void> {
    try {
      const snapshotDir = path.join(process.cwd(), 'data', 'snapshots');
      if (!fs.existsSync(snapshotDir)) return;
      const files = await fs.promises.readdir(snapshotDir);
      for (const file of files) {
        if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
          await fs.promises.unlink(path.join(snapshotDir, file)).catch(() => {});
        }
      }
    } catch (err) {
      logger.warn(`Failed to cleanup snapshots: ${(err as Error).message}`);
    }
  }

  private async attemptLocationBypass(page: any, url: string): Promise<boolean> {
      logger.info(`[Crawlee] Price not found initially on ${url}. Attempting location bypass...`);
      const zipCode = url.includes('amazon.com') ? '10001' : 
                      url.includes('amazon.de') ? '10115' : 
                      url.includes('amazon.co.uk') ? 'E1 6AN' : null;
      
      if (!zipCode) return false;

      // Handle any pre-existing modals (like cookies or location warning) before clicking the zip code popover
      try {
          await page.evaluate(`
              var preModalBtns = Array.from(document.querySelectorAll('input[type="submit"], button, .a-button-input, span.a-button-inner input'));
              var continueBtn = preModalBtns.find(el => {
                  var text = (el.value || el.innerText || '').toLowerCase();
                  return text.includes('continue') || text.includes('accept') || text.includes('agree');
              });
              if (continueBtn) continueBtn.click();
              
              var dismissBtn = document.querySelector('[data-action="a-popover-close"]');
              if (dismissBtn) dismissBtn.click();
          `);
          await page.waitForTimeout(1000);
      } catch(e) {}

      let popoverOpened = false;
      for (let attempt = 0; attempt < 3; attempt++) {
          await page.evaluate(`
              var locBtn = document.querySelector('#nav-global-location-popover-link');
              if (locBtn) locBtn.click();
          `);
          try {
              await page.waitForSelector('#GLUXZipUpdateInput', { state: 'visible', timeout: 3000 });
              popoverOpened = true;
              break;
          } catch (e) {
              await page.waitForTimeout(1000);
          }
      }

      if (popoverOpened) {
          await page.fill('#GLUXZipUpdateInput', zipCode);
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
          
          await page.evaluate(`
              var applyBtn = document.querySelector('span[data-action="GLUX-submit-postal-code"] .a-button-input, #GLUXZipUpdate .a-button-input, #GLUXZipUpdate input, input[aria-labelledby="GLUXZipUpdate-announce"]');
              if (applyBtn) applyBtn.click();
          `);
          await page.waitForTimeout(2000);
          
          await page.evaluate(`
              var continueBtn = document.querySelector('.a-popover-footer .a-button-input, #GLUXConfirmClose, [name="glowDoneButton"]');
              if (continueBtn) continueBtn.click();
          `);
          await page.waitForTimeout(1500);
          
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);
          return true;
      } else {
          logger.warn(`[Crawlee] Location bypass popover failed to open.`);
          return false;
      }
  }

  async scrapeProduct(url: string): Promise<ProductScrapeResult> {
    try {
      let productResult: Product | undefined;
      let failureReason = '';
      let isBlocked = false;
      let rawHtml = '';
      let screenshotBase64 = '';

      let region = 'us';
      if (url.includes('amazon.de')) region = 'de';
      else if (url.includes('amazon.co.uk')) region = 'uk';
      else if (url.includes('amazon.it')) region = 'it';
      else if (url.includes('amazon.fr')) region = 'fr';
      else if (url.includes('amazon.es')) region = 'es';

      const proxyString = await proxyManager.getProxyString(region);
      const proxyConfiguration = proxyString 
        ? new ProxyConfiguration({ proxyUrls: [proxyString] }) 
        : undefined;

      const config = new Configuration({ persistStorage: false });

      const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 1,
        maxRequestRetries: 0,
        requestHandlerTimeoutSecs: 60,
        navigationTimeoutSecs: 45,
        proxyConfiguration,
        useSessionPool: true,
        sessionPoolOptions: { maxPoolSize: 1 },
        browserPoolOptions: {
            useFingerprints: true,
            fingerprintOptions: {
                fingerprintGeneratorOptions: {
                    devices: ['desktop'],
                    operatingSystems: ['windows', 'macos'],
                    browsers: ['chrome'],
                }
            }
        },
        launchContext: {
          launcher: chromium,
          launchOptions: {
            headless: process.env.NODE_ENV === 'production' ? true : false,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-infobars',
              '--window-position=0,0',
              '--ignore-certificate-errors',
            ],
          },
        },
        requestHandler: async ({ page, request, session }: PlaywrightCrawlingContext) => {
          logger.info(`[Crawlee] Navigating to: ${request.url}`);
          await page.waitForLoadState('domcontentloaded');
          
          // Simulation for lazy loading
          try {
              await page.mouse.move(Math.random() * 500, Math.random() * 500);
              await page.waitForTimeout(500);
              await page.mouse.wheel(0, 600);
              
              const priceSelectors = '#corePrice_feature_div .a-price, #corePriceDisplay_desktop_feature_div .a-price, #priceblock_ourprice, #price_inside_buybox';
              
              let priceFound = false;
              try {
                  await page.waitForSelector(priceSelectors, { state: 'attached', timeout: 3000 });
                  priceFound = true;
              } catch (e) {}

              // Attempt location bypass if no price found right away
              if (!priceFound && request.url.includes('amazon.')) {
                  await this.attemptLocationBypass(page, request.url);
              }

              await page.mouse.wheel(0, 600);
              await page.waitForTimeout(800);
              await page.mouse.wheel(0, -1000);
          } catch (e: any) {
              logger.warn(`[Crawlee] Mouse automation failed. ${e.message}`);
          }

          rawHtml = await page.content();
          let marketplace = 'unknown';
          if (request.url.includes('amazon')) marketplace = 'amazon';
          else if (request.url.includes('etsy')) marketplace = 'etsy';

          if (this.isBotBlocked(true, rawHtml, request.url)) {
             session?.markBad();
             isBlocked = true;
             throw new Error('Blocked by CAPTCHA/Anti-bot');
          }

          // Always grab a screenshot in case we need it for Phase 3 Multimodal fallback
          try {
             const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
             screenshotBase64 = screenshotBuffer.toString('base64');
          } catch (e: any) {
             logger.warn(`[Crawlee] Failed to capture fullPage screenshot: ${e.message}`);
          }

          let metrics: Partial<ProductMetrics> = {};
          const scrapedAt = new Date().toISOString();

          // Standard extraction over Cheerio
          const $ = cheerio.load(rawHtml);
          const context = { url: request.url, html: rawHtml, $ };
          const extractor = new PlatformExtractor();
          
          const [metaResult, platformResult] = await Promise.all([
            metadataExtractor.extract(context),
            extractor.extract(context)
          ]);

          let finalTitle = platformResult.title || metaResult.title || 'Unknown Product';
          metrics = { ...metaResult.metrics, ...platformResult.metrics };
          
          // Check cached selectors (Self-Healing Phase 2 prep) - if standard extraction missed price but we have
          // a healed selector in cache, use it immediately!
          if (!metrics.price) {
             const healedPriceSelector = llmSelectorCache.getSelector(request.url, 'price');
             if (healedPriceSelector) {
                 const newPriceText = $(healedPriceSelector).text();
                 if (newPriceText) {
                     const parsed = parseFloat(newPriceText.replace(/[^0-9.,]/g, '').replace(',', '.'));
                     if (!isNaN(parsed) && parsed > 0) {
                         metrics.price = parsed;
                         logger.info(`[Crawlee] Successfully used cached HEALED selector for price!`);
                     }
                 }
             }
          }

          const domainCurrency = detectCurrencyFromDomain(request.url) || 'USD';
          metrics.currency = metrics.currency || domainCurrency;
          metrics = syncMetricsPriceFromBuyBox(metrics, scrapedAt);

          if (metrics.price) {
              metrics.priceUSD = convertToUSD(metrics.price, metrics.currency || 'USD');
              metrics.itemPriceUSD = convertToUSD(metrics.itemPrice || metrics.price, metrics.currency || 'USD');
              
              if (metrics.originalPrice && metrics.originalPrice > metrics.price) {
                  metrics.discountPercentage = Math.round(((metrics.originalPrice - metrics.price) / metrics.originalPrice) * 100);
              }
          }
          
          // Make sure required defaults are filled
          const finalMetrics: ProductMetrics = {
             currency: metrics.currency || domainCurrency,
             description: metrics.description || '',
             imageUrl: metrics.imageUrl || '',
             brand: metrics.brand || '',
             availability: metrics.availability || 'Unknown',
             features: metrics.features || [],
             imageUrls: metrics.imageUrls || [],
             offers: metrics.offers || [],
             ...metrics
          };
          
          productResult = {
            id: uuidv4(),
            title: finalTitle || 'Unknown Product',
            url: request.url,
            marketplace,
            metrics: finalMetrics,
            scrapedAt,
            scrapedBy: 'crawler'
          };
          
          logger.info(`[Crawlee] Pass 1 Extraction for ${productResult.title} - Price: ${metrics.price || 'MISSING'}`);
        },
        failedRequestHandler: async ({ request }: PlaywrightCrawlingContext, error: Error) => {
          logger.error(`[Crawlee] Request failed for ${request.url}: ${error.message}`);
          failureReason = error.message;
          if (proxyString) {
              proxyManager.markAsDead(proxyString);
          }
        },
      }, config);

      await crawler.run([url]);

      if (isBlocked) {
          return { error: 'Platform blocked the request (CAPTCHA/Robot Check). Proceeding to fallback.' };
      }

      await this.cleanupSnapshots();

      return { 
          product: productResult, 
          html: rawHtml, 
          screenshotBase64,
          error: failureReason ? failureReason : undefined
      };

    } catch (err: any) {
      return { error: `Crawlee engine failed: ${err.message}` };
    }
  }

  private isAmazonBlocked(html: string): boolean {
    if (!html) return true;
    return html.includes('action="/errors/validateCaptcha"') ||
           html.includes('api-services-support@amazon.com') ||
           (html.includes('To discuss automated access to Amazon data') && html.includes('contact'));
  }

  private isBotBlocked(success: boolean, html: string, url: string = ''): boolean {
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
    return this.isAmazonBlocked(html);
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
              logger.info('[CrawleeAdapter] ETSY_FORCE_FIRECRAWL=true, using Firecrawl for Etsy SERP.');
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
            if (this.isBotBlocked(fetchResult.success, contentStr, url)) {
              logger.warn(`SERP block detected. Try ${attempt + 1}. Falling back to Playwright...`);
              fetchResult = await playwrightFetcher.fetchHtml(url, proxyUrl);
            }
          }
        }

        const contentStr = fetchResult.html || '';
        if (fetchResult.success && fetchResult.html && !this.isBotBlocked(fetchResult.success, contentStr, url)) {
          break; // Success
        } else {
          lastError = fetchResult.error || (this.isBotBlocked(fetchResult.success, contentStr, url) ? 'Blocked by CAPTCHA/Anti-bot' : 'Unknown Error');
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
