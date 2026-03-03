import Crawler from 'crawler';
import { createRequire } from 'module';
import { logger as baseLogger } from '../../../utils/logger';

export interface FetchResult {
  html: string;
  error?: string;
  success: boolean;
}

const logger = baseLogger.child({ module: 'Fetcher' });

export class Fetcher {
  private legacyCrawler: Crawler;

  constructor() {
    this.legacyCrawler = new Crawler({
      maxConnections: 10,
      retries: 3,
      // Simple rotation of user agents to avoid basic blocking
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      ],
      // Optional: rateLimit to slow down requests. Useful if doing many scrapes.
      // rateLimit: 1000, 
    });
  }

  private getHeaders(url: string): Record<string, string> {
    const isAmazon = url.toLowerCase().includes('amazon');

    // Amazon specific rotation headers
    const amazonHeaders: Array<Record<string, string>> = [
      {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
      },
      {
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Sec-Ch-Ua': '"Safari";v="17", "Chromium";v="119", "Not?A_Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Upgrade-Insecure-Requests': '1',
      },
      {
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      }
    ];

    const defaultHeaders: Record<string, string> = {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
    };

    return isAmazon ? amazonHeaders[Math.floor(Math.random() * amazonHeaders.length)] : defaultHeaders;
  }

  private async fetchWithLegacyCrawler(url: string, headers: Record<string, string>, proxyUrl?: string): Promise<FetchResult> {
    return new Promise((resolve) => {
      const options: any = {
        uri: url,
        // Randomized or common headers
        headers: headers,
        callback: (error: unknown, res: any, done: any) => {
          if (error) {
            resolve({ 
              success: false, 
              error: (error as Error).message || 'Unknown network error',
              html: '' 
            });
            if (typeof done === 'function') done();
            return;
          }

          if (res.statusCode !== 200) {
            resolve({ 
              success: false, 
              error: `HTTP Error: ${res.statusCode}`,
              html: res.body || '' 
            });
            done();
            return;
          }

          const html = res.body;
          if (!html || typeof html !== 'string') {
            resolve({ success: false, error: 'Empty or invalid HTML response', html: '' });
            done();
            return;
          }

          resolve({ success: true, html });
          done();
        },
      };

      if (proxyUrl) {
        options.proxy = proxyUrl;
      }

      this.legacyCrawler.queue(options);
    });
  }

  private async fetchWithCrawlee(url: string, headers: Record<string, string>, proxyUrl?: string): Promise<FetchResult> {
    const runtimeRequire = createRequire(__filename);
    const crawleeModuleName = 'crawlee';
    const crawlee = runtimeRequire(crawleeModuleName) as any;
    const { CheerioCrawler, ProxyConfiguration } = crawlee;

    let html = '';
    let failureReason = '';

    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: 1,
      maxRequestRetries: 2,
      requestHandlerTimeoutSecs: 45,
      proxyConfiguration: proxyUrl
        ? new ProxyConfiguration({
            proxyUrls: [proxyUrl],
          })
        : undefined,
      preNavigationHooks: [
        async (_ctx: any, gotOptions: any) => {
          gotOptions.headers = {
            ...(gotOptions.headers || {}),
            ...headers,
          };
        },
      ],
      requestHandler: async ({ body }: any) => {
        if (typeof body === 'string') html = body;
        else if (Buffer.isBuffer(body)) html = body.toString('utf-8');
      },
      failedRequestHandler: async ({ request }: any, error: Error) => {
        const requestErrors = Array.isArray(request?.errorMessages) ? request.errorMessages.join(' | ') : '';
        failureReason = error?.message || requestErrors || 'Crawlee request failed';
      },
    });

    await crawler.run([url]);

    if (!html) {
      return {
        success: false,
        html: '',
        error: failureReason || 'Crawlee returned empty HTML',
      };
    }

    return { success: true, html };
  }

  async fetchHtml(url: string, proxyUrl?: string): Promise<FetchResult> {
    const headers = this.getHeaders(url);

    // Prefer Crawlee SDK, fallback to legacy crawler for compatibility.
    try {
      return await this.fetchWithCrawlee(url, headers, proxyUrl);
    } catch (error: any) {
      logger.warn({ err: error }, 'Crawlee fetch failed, fallback to legacy crawler');
      return this.fetchWithLegacyCrawler(url, headers, proxyUrl);
    }
  }
}

export const fetcher = new Fetcher();
