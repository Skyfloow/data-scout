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
import { aiFallbackExtractor } from '../extractors/AIFallbackExtractor';

chromium.use(stealthPlugin());

const logger = baseLogger.child({ module: 'CrawleeAdapter' });

// We want to suppress Crawlee's default verbose logging
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
          logger.warn(`[Crawlee] Location bypass popover failed to open after retries.`);
          return false;
      }
  }

  async scrapeProduct(url: string): Promise<ProductScrapeResult> {
    try {
      const settings = await storageService.getSettings();
      const strategy = settings.scrapingStrategy || 'hybrid';
      
      let productResult: Product | undefined;
      let failureReason = '';
      let isBlocked = false;

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

      // Ensure stable session across retries
      const config = new Configuration({
        persistStorage: false,
      });

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
          
          // Simulate human behavior to trigger lazy-loaded elements (like prices on Amazon)
          try {
              await page.mouse.move(Math.random() * 500, Math.random() * 500);
              await page.waitForTimeout(500);
              await page.mouse.wheel(0, 600);
              
              const priceSelectors = '#corePrice_feature_div .a-price, #corePriceDisplay_desktop_feature_div .a-price, #priceblock_ourprice, #price_inside_buybox';
              
              // Try to wait for price
              let priceFound = false;
              try {
                  await page.waitForSelector(priceSelectors, { state: 'attached', timeout: 3000 });
                  priceFound = true;
              } catch (e) {}

              // If price is missing, Amazon might be blocking it due to location. Let's try changing ZIP.
              if (!priceFound && request.url.includes('amazon.')) {
                  await this.attemptLocationBypass(page, request.url);
              }

              await page.mouse.wheel(0, 600);
              await page.waitForTimeout(800);
              await page.mouse.wheel(0, -1000);
          } catch (e: any) {
              logger.warn(`[Crawlee] Mouse/Wait automation failed, proceeding anyway. ${e.message}`);
          }

          const html = await page.content();
          let marketplace = 'unknown';
          if (request.url.includes('amazon')) marketplace = 'amazon';
          else if (request.url.includes('etsy')) marketplace = 'etsy';

          if (marketplace === 'amazon' && this.isAmazonBlocked(html)) {
            const snapshotDir = path.join(process.cwd(), 'data', 'snapshots');
            try { 
              await page.screenshot({ path: path.join(snapshotDir, `blocked-${uuidv4()}.jpg`), type: 'jpeg', quality: 80, fullPage: true }); 
            } catch (e) {
              logger.warn('[Crawlee] Failed to take blocked snapshot');
            }
            session?.markBad();
            isBlocked = true;
            throw new Error('Blocked by CAPTCHA/Anti-bot');
          }

          let metrics: Partial<ProductMetrics> = {};
          const scrapedAt = new Date().toISOString();

          // Unify extraction for all platforms via PlatformExtractor
          const $ = cheerio.load(html);
          const context = { url: request.url, html, $ };
          const extractor = new PlatformExtractor();
          
          const [metaResult, platformResult] = await Promise.all([
            metadataExtractor.extract(context),
            extractor.extract(context)
          ]);

          let finalTitle = platformResult.title || metaResult.title || 'Unknown Product';
          metrics = { ...metaResult.metrics, ...platformResult.metrics };

          const isCriticalMissing = !finalTitle || finalTitle === 'Unknown Product' || !metrics.price;
          if (isCriticalMissing) {
              logger.warn(`[Crawlee ${marketplace}] Normal extraction missing critical data. Invoking AI Fallback...`);
              const fallbackResult = await aiFallbackExtractor.extract({ ...context, marketplace });
              if (fallbackResult.success) {
                  finalTitle = fallbackResult.title || finalTitle;
                  metrics = { ...metrics, ...fallbackResult.metrics };
              } else {
                  logger.warn(`[Crawlee ${marketplace}] AI Fallback failed: ${fallbackResult.error}`);
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

          // Generate Snapshot for debugging missing prices
          if (metrics.price === undefined) {
             const snapshotId = uuidv4();
             const snapshotDir = path.join(process.cwd(), 'data', 'snapshots');
             logger.warn(`[Crawlee ${marketplace}] Price extraction failed completely. Dumping debug data to noprice-${snapshotId}.jpg and html`);
             try {
                 await page.screenshot({ path: path.join(snapshotDir, `noprice-${snapshotId}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
                 const fs = require('fs');
                 fs.writeFileSync(path.join(snapshotDir, `noprice-${snapshotId}.html`), html);
             } catch (err) {}
          }
          
          productResult = {
            id: uuidv4(),
            title: finalTitle || 'Unknown Product',
            url: request.url,
            marketplace,
            metrics: metrics as Product['metrics'],
            scrapedAt,
            scrapedBy: 'crawler' // Keeping the original type mapping, though engine is crawlee
          };
          
          logger.info(`[Crawlee] Successfully extracted ${productResult.title} - Price: ${metrics.price || 'N/A'}`);
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
          return { error: 'Amazon blocked the request (CAPTCHA/Robot Check).' };
      }

      if (!productResult) {
        return { error: `Failed to fetch URL. Reason: ${failureReason || 'No product data extracted'}` };
      }

      // Cleanup snapshots to avoid accumulating unnecessary images on success
      await this.cleanupSnapshots();

      return { product: productResult };

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
}
