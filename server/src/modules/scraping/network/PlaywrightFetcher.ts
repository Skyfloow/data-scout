import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createRequire } from 'module';
import { FetchResult } from './Fetcher';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'PlaywrightFetcher' });

// Enable stealth plugin
chromium.use(stealthPlugin());

export class PlaywrightFetcher {
  private buildLaunchOptions(): any {
    return {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
      ],
    };
  }

  private async fetchWithLegacyPlaywright(url: string, proxyUrl?: string): Promise<FetchResult> {
    let browser;
    try {
      logger.info(`Launching legacy browser for: ${url} ${proxyUrl ? 'via proxy' : ''}`);
      const launchOptions = this.buildLaunchOptions();

      if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl };
      }

      browser = await chromium.launch(launchOptions);

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const html = await page.content();
      await browser.close();

      return { success: true, html };
    } catch (error: any) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      return {
        success: false,
        error: error.message || 'Unknown Playwright error',
        html: '',
      };
    }
  }

  private async fetchWithCrawlee(url: string, proxyUrl?: string): Promise<FetchResult> {
    const runtimeRequire = createRequire(__filename);
    const crawleeModuleName = 'crawlee';
    const crawlee = runtimeRequire(crawleeModuleName) as any;
    const { PlaywrightCrawler, ProxyConfiguration } = crawlee;

    let html = '';
    let failureReason = '';

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 1,
      maxRequestRetries: 1,
      requestHandlerTimeoutSecs: 60,
      navigationTimeoutSecs: 35,
      proxyConfiguration: proxyUrl
        ? new ProxyConfiguration({
            proxyUrls: [proxyUrl],
          })
        : undefined,
      launchContext: {
        launcher: chromium,
        launchOptions: this.buildLaunchOptions(),
      },
      requestHandler: async ({ page }: any) => {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        html = await page.content();
      },
      failedRequestHandler: async ({ request }: any, error: Error) => {
        const requestErrors = Array.isArray(request?.errorMessages) ? request.errorMessages.join(' | ') : '';
        failureReason = error?.message || requestErrors || 'Crawlee Playwright request failed';
      },
    });

    await crawler.run([url]);

    if (!html) {
      return {
        success: false,
        error: failureReason || 'Crawlee Playwright returned empty HTML',
        html: '',
      };
    }

    return {
      success: true,
      html,
    };
  }

  /**
   * Fetches the HTML of a page using a real headless browser with Stealth applied.
   */
  async fetchHtml(url: string, proxyUrl?: string): Promise<FetchResult> {
    try {
      logger.info(`Launching Crawlee Playwright fetch for: ${url} ${proxyUrl ? 'via proxy' : ''}`);
      return await this.fetchWithCrawlee(url, proxyUrl);
    } catch (error: any) {
      logger.warn({ err: error }, `Crawlee Playwright failed for ${url}, fallback to legacy Playwright`);
      const fallbackResult = await this.fetchWithLegacyPlaywright(url, proxyUrl);
      if (!fallbackResult.success) {
        logger.error({ err: fallbackResult.error }, `Failed to fetch ${url}`);
      }
      return fallbackResult;
    }
  }
}

export const playwrightFetcher = new PlaywrightFetcher();
