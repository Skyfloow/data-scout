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

const sanitizeTitleCandidate = (value: string | undefined): string => {
  if (!value) return '';
  const cleaned = value
    .replace(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/gi, ' ')
    .replace(/\[[^\]]*]\((https?:\/\/[^)]+)\)/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[\-|:]\s*etsy(?:\.[a-z.]+)?\s*$/i, '')
    .trim();
  if (!cleaned) return '';
  if (!/[a-z0-9а-я]/i.test(cleaned)) return '';
  if (/^[-[\]()\s]+$/.test(cleaned)) return '';
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(cleaned)) return '';
  if (/^(homepage|home)\b/i.test(cleaned)) return '';
  return cleaned;
};

const pickBestTitle = (...candidates: Array<string | undefined>): string => {
  for (const candidate of candidates) {
    const sanitized = sanitizeTitleCandidate(candidate);
    if (sanitized) return sanitized;
  }
  return 'Scraped Product';
};

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

const getFirecrawlUrlCandidates = (inputUrl: string): string[] => {
  const out: string[] = [];
  const add = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };
  add(normalizeUrlForFirecrawl(inputUrl));
  add(inputUrl);

  try {
    const parsed = new URL(inputUrl);
    if (parsed.hostname.toLowerCase().includes('etsy.com')) {
      const listingMatch = parsed.pathname.match(/\/listing\/(\d+)(?:\/([^/?#]+))?/i);
      if (listingMatch?.[1]) {
        const listingId = listingMatch[1];
        const slug = listingMatch[2] || '';
        const base = `${parsed.protocol}//${parsed.host}/listing/${listingId}${slug ? `/${slug}` : ''}`;
        const bare = `${parsed.protocol}//${parsed.host}/listing/${listingId}`;
        add(base);
        add(bare);

        const keepParams = new URLSearchParams();
        for (const key of ['variation0', 'variation1']) {
          const value = parsed.searchParams.get(key);
          if (value) keepParams.set(key, value);
        }
        if (keepParams.toString()) {
          add(`${base}?${keepParams.toString()}`);
          add(`${bare}?${keepParams.toString()}`);
        }
      }
    }
  } catch {
    // ignore URL parse issues
  }

  return out.slice(0, 6);
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
      const candidates = getFirecrawlUrlCandidates(url);
      let data: any = null;
      let targetUrl = candidates[0] || normalizeUrlForFirecrawl(url);
      let lastErrorText = '';

      for (const candidateUrl of candidates) {
        targetUrl = candidateUrl;
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
            url: candidateUrl,
            formats: ['markdown', 'html'],
            waitFor: 3000,
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          lastErrorText = `FireCrawl API error: ${response.status} ${err}`;
          continue;
        }

        data = await response.json();
        if (data?.data?.html || data?.data?.markdown) {
          break;
        }
      }

      if (!data) {
        return { error: lastErrorText || 'FireCrawl returned no usable response' };
      }

      const html = data?.data?.html || '';
      const markdown = data?.data?.markdown || '';

      if (!html && !markdown) {
        return { error: 'FireCrawl returned empty content' };
      }

      const metadataTitle = data?.data?.metadata?.title;

      let finalTitle = pickBestTitle(metadataTitle);
      let finalMetrics: Partial<ProductMetrics> = {};

      if (html) {
        const $ = cheerio.load(html);
        const context: ExtractorContext = { url: targetUrl, html, $ };

        const extractor = new PlatformExtractor();
        const [metaResult, platformResult] = await Promise.all([
          metadataExtractor.extract(context),
          extractor.extract(context),
        ]);

        finalTitle = pickBestTitle(platformResult.title, metaResult.title, metadataTitle);
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
            finalTitle = pickBestTitle(aiResult.title, finalTitle, platformResult.title, metaResult.title, metadataTitle);
            finalMetrics = { ...aiResult.metrics, ...finalMetrics };
          }
        }
      } else if (!metadataTitle && markdown) {
        const lines = markdown.split('\n');
        // skip image/link lines
        const titleLine = lines.find((l: string) => l.trim().length > 0 && !l.includes('![](') && !l.startsWith('[')) || 'Scraped Product';
        finalTitle = pickBestTitle(titleLine.replace(/#/g, '').trim(), metadataTitle);
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
      if (targetUrl.includes('amazon')) marketplace = 'amazon';
      else if (targetUrl.includes('ebay')) marketplace = 'ebay';
      else if (targetUrl.includes('bestbuy')) marketplace = 'bestbuy';
      else if (targetUrl.includes('etsy')) marketplace = 'etsy';

      const product: Product = {
        id: uuidv4(),
        title: finalTitle,
        url: targetUrl,
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
