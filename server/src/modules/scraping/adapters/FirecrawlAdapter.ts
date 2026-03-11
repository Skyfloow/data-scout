import { IScraper } from './IScraper';
import { ProductScrapeResult } from '../../../types';
import { config } from '../../../config';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'FirecrawlAdapter' });

const normalizeUrlForFirecrawl = (inputUrl: string): string => {
  try {
    const parsed = new URL(inputUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('etsy.com')) {
      parsed.hash = '';
      const keep = new Set(['variation0', 'variation1']);
      const normalizedParams = new URLSearchParams();
      for (const [key, value] of parsed.searchParams.entries()) {
        if (!keep.has(key)) continue;
        if (!value || value.length > 80) continue;
        normalizedParams.set(key, value);
      }
      parsed.search = normalizedParams.toString() ? `?${normalizedParams.toString()}` : '';

      // Normalize /listing/{id}/{slug} paths
      const listingMatch = parsed.pathname.match(/\/listing\/(\d+)(?:\/([^/?#]+))?/i);
      if (listingMatch?.[1]) {
        const listingId = listingMatch[1];
        const slug = listingMatch[2] || '';
        parsed.pathname = slug ? `/listing/${listingId}/${slug}` : `/listing/${listingId}`;
      }
    }

    return parsed.toString();
  } catch {
    return inputUrl;
  }
};

export class FireCrawlAdapter implements IScraper {
  private apiKey: string;

  constructor() {
    this.apiKey = config.firecrawlApiKey;
  }

  async scrapeProduct(url: string): Promise<ProductScrapeResult> {
    if (!this.apiKey || this.apiKey === 'test_api_key') {
      return { error: 'Firecrawl API key is missing or invalid' };
    }

    try {
      const targetUrl = normalizeUrlForFirecrawl(url);
      logger.info({ url: targetUrl }, 'Triggering Firecrawl scrape for markdown...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url: targetUrl,
          formats: ['markdown'],
          waitFor: 3000,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        return { error: `FireCrawl API error: ${response.status} ${err}` };
      }

      const data = await response.json();
      const markdown = data?.data?.markdown || '';

      if (!markdown) {
        return { error: 'FireCrawl returned empty markdown' };
      }

      logger.info({ url: targetUrl }, 'Firecrawl successfully retrieved markdown');
      return { markdown };
    } catch (error: any) {
      return { error: `FireCrawl exception: ${error.message}` };
    }
  }
}
