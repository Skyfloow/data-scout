import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { IScraper } from './IScraper';
import { ProductScrapeResult, Product, ProductMetrics } from '../../../types';
import { config } from '../../../config';
import { metadataExtractor } from '../extractors/MetadataExtractor';
import { PlatformExtractor } from '../extractors/PlatformExtractor';
import { aiFallbackExtractor } from '../extractors/AIFallbackExtractor';
import { calculateCompletenessScore, isCriticalDataMissing, ExtractorContext } from '../extractors/types';
import { convertToUSD } from '../../../services/CurrencyService';
import { syncMetricsPriceFromBuyBox } from '../../../utils/price';

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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ 
          url, 
          formats: ['markdown', 'html'],
          waitFor: 3000, 
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        return { error: `FireCrawl API error: ${response.status} ${err}` };
      }

      const data = await response.json();
      const html = data?.data?.html || '';
      const markdown = data?.data?.markdown || '';

      if (!html && !markdown) {
        return { error: 'FireCrawl returned empty content' };
      }

      const metadataTitle = data?.data?.metadata?.title;

      let finalTitle = metadataTitle || 'Scraped Product';
      let finalMetrics: Partial<ProductMetrics> = {};

      if (html) {
        const $ = cheerio.load(html);
        const context: ExtractorContext = { url, html, $ };

        const extractor = new PlatformExtractor();
        const [metaResult, platformResult] = await Promise.all([
          metadataExtractor.extract(context),
          extractor.extract(context),
        ]);

        finalTitle = platformResult.title || metaResult.title || metadataTitle || 'Scraped Product';
        finalMetrics = { ...metaResult.metrics };

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
          const aiResult = await aiFallbackExtractor.extract(context);
          if (aiResult.success) {
            finalTitle = aiResult.title || finalTitle;
            finalMetrics = { ...aiResult.metrics, ...finalMetrics };
          }
        }
      } else if (!metadataTitle && markdown) {
        const lines = markdown.split('\n');
        // skip image/link lines
        const titleLine = lines.find((l: string) => l.trim().length > 0 && !l.includes('![](') && !l.startsWith('[')) || 'Scraped Product';
        finalTitle = titleLine.replace(/#/g, '').trim();
      }

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

      const product: Product = {
        id: uuidv4(),
        title: finalTitle,
        url,
        marketplace,
        metrics: finalMetrics as Product['metrics'],
        scrapedAt,
        scrapedBy: 'firecrawl',
      };

      return { product };
    } catch (error: any) {
      return { error: `FireCrawl exception: ${error.message}` };
    }
  }
}
