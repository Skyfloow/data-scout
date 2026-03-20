import { IScraper } from './IScraper';
import { ProductScrapeResult, Product, ProductMetrics, Offer } from '../../../types';
import { config } from '../../../config';
import { logger as baseLogger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { PlatformExtractor } from '../extractors/PlatformExtractor';
import { metadataExtractor } from '../extractors/MetadataExtractor';
import { detectCurrencyFromDomain, detectCurrencyFromUrlParam, parsePrice } from '../../../utils/parsers';
import { syncMetricsPriceFromBuyBox } from '../../../utils/price';
import { convertToUSD } from '../../../services/CurrencyService';
import { extractAsin, parseAmazonAodOffersHtml, fetchAmazonOffers } from '../selectors/amazon-offers';
import { CrawleeAdapter } from './CrawleeAdapter';

const logger = baseLogger.child({ module: 'FirecrawlAdapter' });

function extractCountryCodeFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('amazon.')) return undefined;
    if (host === 'amazon.it') return 'IT';
    if (host === 'amazon.de') return 'DE';
    if (host === 'amazon.fr') return 'FR';
    if (host === 'amazon.es') return 'ES';
    if (host === 'amazon.ca') return 'CA';
    if (host === 'amazon.co.uk') return 'GB';
    if (host === 'amazon.com.mx') return 'MX';
    if (host === 'amazon.co.jp') return 'JP';
    if (host === 'amazon.in') return 'IN';
    if (host === 'amazon.com.au') return 'AU';
    if (host === 'amazon.com.br') return 'BR';
    if (host === 'amazon.nl') return 'NL';
    if (host === 'amazon.com.be' || host === 'amazon.be') return 'BE';
    if (host === 'amazon.se') return 'SE';
    if (host === 'amazon.pl') return 'PL';
    if (host === 'amazon.com.tr') return 'TR';
    if (host === 'amazon.ae') return 'AE';
    if (host === 'amazon.com.sa' || host === 'amazon.sa') return 'SA';
    if (host === 'amazon.sg') return 'SG';
    if (host === 'amazon.eg') return 'EG';
    if (host === 'amazon.com') return 'US';
  } catch {
    // ignore
  }
  return undefined;
}

const shouldForceEnglishAod = (originOrUrl: string): boolean => {
  try {
    const host = new URL(originOrUrl).hostname.toLowerCase().replace(/^www\./, '');
    return host !== 'amazon.com';
  } catch {
    return true;
  }
};

const normalizeUrlForFirecrawl = (inputUrl: string): string => {
  try {
    const parsed = new URL(inputUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('amazon.')) {
      const asin = extractAsin(inputUrl);
        if (asin) {
        let langPrefix = '';
        const match = parsed.pathname.match(/^(\/-\/[a-zA-Z]{2}(?:-[a-zA-Z]{2})?\/)/);
        if (match) {
          langPrefix = match[1];
        } else if (!host.includes('amazon.com') && !parsed.searchParams.has('language')) {
          parsed.searchParams.set('language', 'en_GB');
        }

        const normalizedBasePath = langPrefix || '/';
        const normalized = new URL(`${parsed.protocol}//${parsed.host}${normalizedBasePath}dp/${asin}`);
        const th = parsed.searchParams.get('th');
        if (th && /^[0-9A-Za-z_-]{1,8}$/.test(th)) {
          normalized.searchParams.set('th', th);
        }
        if (parsed.searchParams.has('language')) {
          normalized.searchParams.set('language', parsed.searchParams.get('language')!);
        }
        for (const key of ['currency', 'currencyCode', 'currencycode', 'curr']) {
          if (parsed.searchParams.has(key)) {
            normalized.searchParams.set(key, parsed.searchParams.get(key)!);
          }
        }
        return normalized.toString();
      }
    }

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

type FirecrawlPayload = {
  html?: unknown;
  rawHtml?: unknown;
  markdown?: unknown;
  md?: unknown;
  data?: unknown;
};

function pickString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function extractFirecrawlData(responseJson: any): { html: string; markdown: string } {
  const payload: FirecrawlPayload = (responseJson?.data || responseJson?.result || responseJson) as any;
  const html = pickString(payload?.html) || pickString(payload?.rawHtml);
  const markdown = pickString(payload?.markdown) || pickString(payload?.md);
  return { html, markdown };
}

async function extractProductFromHtml(url: string, html: string): Promise<Product> {
  const $ = cheerio.load(html);
  const context = { url, html, $ };
  const extractor = new PlatformExtractor();

  const [metaResult, platformResult] = await Promise.all([
    metadataExtractor.extract(context),
    extractor.extract(context),
  ]);

  const scrapedAt = new Date().toISOString();
  const domainCurrency = detectCurrencyFromDomain(url) || 'USD';
  const urlCurrency = detectCurrencyFromUrlParam(url);

  const mergedMetrics = { ...metaResult.metrics, ...platformResult.metrics } as Partial<ProductMetrics>;
  mergedMetrics.currency = mergedMetrics.currency || urlCurrency || domainCurrency;
  const stabilized = syncMetricsPriceFromBuyBox(mergedMetrics as ProductMetrics, scrapedAt);

  if (stabilized.price) {
    stabilized.priceUSD = convertToUSD(stabilized.price, stabilized.currency || 'USD');
    stabilized.itemPriceUSD = convertToUSD(stabilized.itemPrice || stabilized.price, stabilized.currency || 'USD');
    if (stabilized.originalPrice && stabilized.originalPrice > stabilized.price) {
      stabilized.discountPercentage = Math.round(((stabilized.originalPrice - stabilized.price) / stabilized.originalPrice) * 100);
    }
  }

  const finalMetrics: ProductMetrics = {
    currency: stabilized.currency || urlCurrency || domainCurrency,
    description: stabilized.description || '',
    imageUrl: stabilized.imageUrl || '',
    brand: stabilized.brand || '',
    availability: stabilized.availability || 'Unknown',
    features: stabilized.features || [],
    imageUrls: stabilized.imageUrls || [],
    offers: stabilized.offers || [],
    ...stabilized,
  };

  const marketplace = (() => {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      if (url.includes('amazon')) return 'amazon';
      if (url.includes('etsy')) return 'etsy';
      return 'unknown';
    }
  })();

  const finalTitle = platformResult.title || metaResult.title || 'Unknown Product';

  return {
    id: uuidv4(),
    title: finalTitle || 'Unknown Product',
    url,
    marketplace,
    metrics: finalMetrics,
    scrapedAt,
    scrapedBy: 'firecrawl',
  };
}

async function firecrawlScrapeHtml(targetUrl: string, apiKey: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['html'],
        waitFor: 0,
        location: extractCountryCodeFromUrl(targetUrl) ? { country: extractCountryCodeFromUrl(targetUrl) } : undefined,
        headers: {
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        },
      }),
    });
    if (!response.ok) {
      return '';
    }
    const data = await response.json();
    const { html } = extractFirecrawlData(data);
    return html || '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

const extractSellerIdFromOfferUrl = (offerUrl?: string): string => {
  const raw = String(offerUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://www.amazon.com');
    const sellerId = String(parsed.searchParams.get('smid') || parsed.searchParams.get('seller') || '').trim();
    if (sellerId) return sellerId.toLowerCase();
  } catch {
    // ignore
  }
  const match = raw.match(/[?&](?:smid|seller)=([^&#]+)/i);
  return String(match?.[1] || '').trim().toLowerCase();
};

async function fetchAmazonOffersViaFirecrawl(params: {
  url: string;
  asin: string;
  currency: string;
  apiKey: string;
}): Promise<Offer[]> {
  const configuredMaxPages = Number.parseInt(process.env.AMAZON_AOD_MAX_PAGES || '50', 10);
  const hardCap = 10;
  const baseMaxPages = Number.isFinite(configuredMaxPages) && configuredMaxPages > 0
    ? Math.min(configuredMaxPages, hardCap)
    : Math.min(50, hardCap);
  const maxPages = process.env.NODE_ENV === 'test' ? Math.min(baseMaxPages, 2) : baseMaxPages;

  const origin = (() => {
    try {
      const parsed = new URL(params.url);
      return `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      return 'https://www.amazon.com';
    }
  })();

  const seen = new Set<string>();
  const offers: Offer[] = [];
  const seenOfferIds = new Set<string>();
  let duplicatePageStreak = 0;

  const extractOfferIds = (html: string): string[] => {
    const ids: string[] = [];
    const byInput = html.matchAll(/name="items\[0\.base\]\[offerListingId\]"\s+value="([^"]+)"/g);
    for (const match of byInput) {
      if (match[1]) ids.push(match[1]);
    }
    const byJsonOid = html.matchAll(/"oid"\s*:\s*"([^"]+)"/g);
    for (const match of byJsonOid) {
      if (match[1]) ids.push(match[1]);
    }
    return ids;
  };
  const countOfferRows = (html: string): number =>
    (html.match(/id="aod-offer"|class="[^"]*aod-information-block[^"]*"|id="aod-pinned-offer"|class="[^"]*olpOffer[^"]*"/g) || []).length;

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const langParam = shouldForceEnglishAod(origin) ? '&language=en_GB' : '';
    const endpointCandidates = [
      `${origin}/gp/product/ajax/ref=aod_page_${pageNo - 1}?asin=${params.asin}&pc=dp&experienceId=aodAjaxMain&pageno=${pageNo}${langParam}`,
      `${origin}/gp/product/ajax/ref=aod_page_${pageNo}?asin=${params.asin}&pc=dp&experienceId=aodAjaxMain&pageno=${pageNo}${langParam}`,
      `${origin}/gp/product/ajax/ref=aod_page_${pageNo - 1}?asin=${params.asin}&pc=dp&experienceId=aodAjaxMain${langParam}`,
      `${origin}/gp/offer-listing/${params.asin}/ref=dp_olp_NEW_mbc?ie=UTF8&condition=new&pageno=${pageNo}${langParam}`,
    ];

    let html = '';
    for (const endpoint of endpointCandidates) {
      const candidateHtml = await firecrawlScrapeHtml(endpoint, params.apiKey, 45_000);
      if (!candidateHtml || candidateHtml.length < 120) continue;
      if (countOfferRows(candidateHtml) === 0) continue;
      html = candidateHtml;
      break;
    }

    if (!html) break;

    const offerRows = countOfferRows(html);
    const offerIds = extractOfferIds(html);
    const beforeCount = seenOfferIds.size;
    for (const offerId of offerIds) seenOfferIds.add(offerId);
    const newOfferIds = seenOfferIds.size - beforeCount;

    const pageOffers = parseAmazonAodOffersHtml(html, params.currency, origin);
    if (pageOffers.length === 0 && pageNo > 1) break;

    for (const offer of pageOffers) {
      const sellerId = extractSellerIdFromOfferUrl(offer.offerUrl);
      const dedupKey = sellerId
        ? `seller-id|${sellerId}|${Number(offer.price || 0).toFixed(2)}|${(offer.condition || '').toLowerCase()}`
        : `${(offer.offerId || '').toLowerCase()}|${Number(offer.price || 0).toFixed(2)}|${(offer.sellerName || '').toLowerCase()}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      offers.push(offer);
    }

    if (pageNo > 1 && offerRows > 0 && newOfferIds === 0) {
      duplicatePageStreak += 1;
    } else {
      duplicatePageStreak = 0;
    }
    if (duplicatePageStreak >= 2) break;

    if (process.env.NODE_ENV !== 'test') {
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  return offers;
}

const hasValidPositivePrice = (value: unknown): value is number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
};
const isInvalidOfferSellerLabel = (raw: string): boolean => {
  const normalized = String(raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return true;
  return /^(return policy|payment|condition|delivery|details|quantity|ships from|sold by)$/i.test(normalized)
    || /^save with used\b/i.test(normalized)
    || /^used\s*-\s*good$/i.test(normalized)
    || normalized.includes('return policy')
    || normalized.endsWith('see less')
    || normalized.endsWith('see more');
};
const dedupeOffers = (offers: Offer[]): Offer[] => {
  const seen = new Set<string>();
  const out: Offer[] = [];
  for (const offer of offers) {
    const seller = String(offer.sellerName || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const url = String(offer.offerUrl || '').trim().toLowerCase();
    const key = [
      url || 'no-url',
      seller || 'no-seller',
      Number(offer.price || 0).toFixed(2),
      String(offer.condition || '').trim().toLowerCase(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(offer);
  }
  return out;
};

function hydrateAmazonPriceFromOffers(product: Product): Product {
  if (!String(product.marketplace || '').toLowerCase().includes('amazon')) return product;
  const metrics = product.metrics || ({} as ProductMetrics);
  if (hasValidPositivePrice(metrics.price)) return product;

  const offers = Array.isArray(metrics.offers)
    ? metrics.offers.filter((offer) => hasValidPositivePrice((offer as any)?.price))
    : [];
  if (offers.length === 0) return product;

  const preferredOffer = offers.find((offer) => /amazon/i.test(String(offer.sellerName || '')))
    || [...offers].sort((left, right) => Number(left.price || 0) - Number(right.price || 0))[0];
  if (!preferredOffer || !hasValidPositivePrice(preferredOffer.price)) return product;

  const currency = String(metrics.currency || preferredOffer.currency || 'USD').toUpperCase();
  const derivedPrice = Number(preferredOffer.price);
  metrics.currency = currency;
  metrics.price = derivedPrice;
  metrics.itemPrice = derivedPrice;
  metrics.priceUSD = convertToUSD(derivedPrice, currency);
  metrics.itemPriceUSD = convertToUSD(derivedPrice, currency);
  metrics.sellerCount = Math.max(Number(metrics.sellerCount || 0), offers.length);

  if (!metrics.buyBox || !hasValidPositivePrice(metrics.buyBox.price)) {
    metrics.buyBox = {
      sellerName: String(preferredOffer.sellerName || 'Unknown Seller'),
      price: derivedPrice,
      isFBA: Boolean(preferredOffer.isFBA),
      isAmazon: /amazon/i.test(String(preferredOffer.sellerName || '')),
      observedAt: product.scrapedAt,
    };
  }

  if (!metrics.selectedOffer || !hasValidPositivePrice((metrics.selectedOffer as any).price)) {
    metrics.selectedOffer = {
      source: 'offer',
      sellerName: String(preferredOffer.sellerName || ''),
      price: derivedPrice,
      currency,
      condition: String(preferredOffer.condition || 'New'),
      isFBA: Boolean(preferredOffer.isFBA),
      isAmazon: /amazon/i.test(String(preferredOffer.sellerName || '')),
    };
  }

  return { ...product, metrics };
}

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
      logger.info({ url: targetUrl }, 'Triggering Firecrawl scrape for html/markdown...');
      
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
          formats: ['html', 'markdown'],
          waitFor: 3000,
          location: extractCountryCodeFromUrl(targetUrl) ? { country: extractCountryCodeFromUrl(targetUrl) } : undefined,
          headers: {
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
          },
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        return { error: `FireCrawl API error: ${response.status} ${err}` };
      }

      const data = await response.json();
      const { html, markdown } = extractFirecrawlData(data);

      if (!html && !markdown) {
        return { error: 'FireCrawl returned empty response payload (no html/markdown)' };
      }

      let product: Product | undefined;
      let extractionError = '';
      if (html) {
        try {
          product = await extractProductFromHtml(url, html);

          // AOD offers are often not present in the initial HTML snapshot. Crawlee solves this via
          // in-browser session + AOD ajax fetch. For Firecrawl, approximate the same by scraping
          // the AOD ajax endpoints via Firecrawl itself and parsing with the same offer parser.
          if (String(product.marketplace || '').toLowerCase().includes('amazon')) {
            const asin = String(product.metrics.asin || '').trim();
            const currency = String(product.metrics.currency || 'USD').trim() || 'USD';
            const offersCount = Array.isArray(product.metrics.offers) ? product.metrics.offers.length : 0;
            const reportedSellerCount = Number(product.metrics.sellerCount || 0);

            const $ = cheerio.load(html);
            const hasOtherSellersSignal =
              $('#dynamic-aod-ingress-box, #dynamic-aod-ingress-box_feature_div, #aod-asin-count, #olp_feature_div, #olp-upd-new-used').length > 0 ||
              /other sellers on amazon|other buying options|andere verkäufer|weitere kaufoptionen|autres vendeurs|autres options d'achat|altri venditori|altre opzioni di acquisto|otros vendedores|otras opciones de compra/i
                .test($('body').text());

            const shouldFetchAod =
              Boolean(asin)
              && (
                hasOtherSellersSignal
                || offersCount < 3
                || (reportedSellerCount > 0 && offersCount < reportedSellerCount)
              );

            if (shouldFetchAod) {
              const origin = (() => {
                try {
                  return new URL(url).origin;
                } catch {
                  return 'https://www.amazon.com';
                }
              })();
              const ingressHref =
                $('#dynamic-aod-ingress-box a[href], #dynamic-aod-ingress-box_feature_div a[href], #aod-ingress-link[href]')
                  .first()
                  .attr('href')
                  ?.trim() || '';

              let remoteOffers: Offer[] = [];
              if (ingressHref) {
                const ingressUrl = ingressHref.startsWith('http')
                  ? ingressHref
                  : `${origin}${ingressHref.startsWith('/') ? '' : '/'}${ingressHref}`;
                const ingressHtml = await firecrawlScrapeHtml(ingressUrl, this.apiKey, 45_000);
                if (ingressHtml) {
                  remoteOffers = parseAmazonAodOffersHtml(ingressHtml, currency, origin);
                }
              }
              if (process.env.NODE_ENV !== 'test') {
                try {
                  if (remoteOffers.length === 0) {
                    remoteOffers = await fetchAmazonOffers(asin, currency, url);
                  }
                } catch {
                  // Fallback to Firecrawl-mediated endpoint scraping below.
                }
              }
              if (remoteOffers.length === 0) {
                remoteOffers = await fetchAmazonOffersViaFirecrawl({
                  url,
                  asin,
                  currency,
                  apiKey: this.apiKey,
                });
              }
              if (remoteOffers.length > 0) {
                const merged = dedupeOffers(
                  [...(product.metrics.offers || []), ...remoteOffers]
                    .filter((offer) => !isInvalidOfferSellerLabel(String(offer?.sellerName || '')))
                );
                product.metrics.offers = merged;
                product.metrics.sellerCount = Math.max(product.metrics.sellerCount || 0, merged.length);
              } else {
                const ingressText = $('#dynamic-aod-ingress-box, #dynamic-aod-ingress-box_feature_div')
                  .first()
                  .text()
                  .replace(/\s+/g, ' ')
                  .trim();
                if (ingressText) {
                  const countMatch = ingressText.match(/\(([\d,]+)\)/);
                  const declaredCount = Number.parseInt((countMatch?.[1] || '').replace(/,/g, ''), 10);
                  const fromPriceMatch = ingressText.match(/from\s*([$€£]\s?[\d.,]+)/i);
                  const parsedFromPrice = parsePrice(fromPriceMatch?.[1] || '');
                  if (Number.isFinite(declaredCount) && declaredCount > 0) {
                    product.metrics.sellerCount = Math.max(product.metrics.sellerCount || 0, declaredCount);
                  }
                  if (parsedFromPrice > 0) {
                    const syntheticOffer: Offer = {
                      sellerName: 'Other sellers on Amazon',
                      price: parsedFromPrice,
                      currency,
                      stockStatus: 'In Stock',
                      stockCount: null,
                      condition: 'New/Used',
                      isFBA: false,
                    };
                    product.metrics.offers = [...(product.metrics.offers || []), syntheticOffer];
                  }
                }
              }

              const currentOfferCount = Array.isArray(product.metrics.offers) ? product.metrics.offers.length : 0;
              const currentSellerCount = Number(product.metrics.sellerCount || 0);
              const shouldTryCrawleeAodFallback =
                process.env.NODE_ENV !== 'test'
                && hasOtherSellersSignal
                && (currentOfferCount < Math.max(3, currentSellerCount));
              if (shouldTryCrawleeAodFallback) {
                try {
                  const crawlee = new CrawleeAdapter();
                  const crawleeResult = await crawlee.scrapeProduct(url);
                  const crawleeOffers = Array.isArray(crawleeResult.product?.metrics?.offers)
                    ? crawleeResult.product!.metrics.offers!
                    : [];
                  if (crawleeOffers.length > 0) {
                    const cleanedCrawleeOffers = dedupeOffers(
                      crawleeOffers.filter((offer) => !isInvalidOfferSellerLabel(String(offer?.sellerName || '')))
                    );
                    const crawleeCurrency = String(
                      crawleeResult.product?.metrics?.currency
                      || cleanedCrawleeOffers.find((offer) => Boolean(offer.currency))?.currency
                      || ''
                    ).trim().toUpperCase();
                    const currentCurrency = String(product.metrics.currency || '').trim().toUpperCase();

                    if (crawleeCurrency && currentCurrency && crawleeCurrency !== currentCurrency) {
                      // Avoid mixed-currency offer sets in Firecrawl output.
                      product.metrics.currency = crawleeCurrency;
                      if (typeof crawleeResult.product?.metrics?.price === 'number' && crawleeResult.product.metrics.price > 0) {
                        product.metrics.price = crawleeResult.product.metrics.price;
                        product.metrics.itemPrice = crawleeResult.product.metrics.itemPrice || crawleeResult.product.metrics.price;
                      }
                      if (crawleeResult.product?.metrics?.buyBox) {
                        product.metrics.buyBox = crawleeResult.product.metrics.buyBox;
                      }
                      if (crawleeResult.product?.metrics?.selectedOffer) {
                        product.metrics.selectedOffer = crawleeResult.product.metrics.selectedOffer;
                      }
                      product.metrics.offers = cleanedCrawleeOffers;
                      product.metrics.sellerCount = Math.max(
                        Number(crawleeResult.product?.metrics?.sellerCount || 0),
                        cleanedCrawleeOffers.length
                      );
                    } else {
                      const merged = dedupeOffers(
                        [...(product.metrics.offers || []), ...cleanedCrawleeOffers]
                          .filter((offer) => !isInvalidOfferSellerLabel(String(offer?.sellerName || '')))
                      );
                      product.metrics.offers = merged;
                      product.metrics.sellerCount = Math.max(
                        product.metrics.sellerCount || 0,
                        Number(crawleeResult.product?.metrics?.sellerCount || 0),
                        merged.length
                      );
                    }
                  }
                } catch {
                  // Keep Firecrawl-native result when Crawlee fallback fails.
                }
              }
            }
          }
          product = hydrateAmazonPriceFromOffers(product);
        } catch (error: any) {
          extractionError = `FireCrawl html extraction failed: ${error.message}`;
        }
      } else {
        extractionError = 'FireCrawl returned markdown but no html; native extractor skipped';
      }

      logger.info(
        { url: targetUrl, hasHtml: Boolean(html), hasMarkdown: Boolean(markdown), hasProduct: Boolean(product) },
        'Firecrawl successfully retrieved content'
      );

      return {
        html: html || undefined,
        markdown: markdown || undefined,
        product,
        error: extractionError || undefined,
      };
    } catch (error: any) {
      return { error: `FireCrawl exception: ${error.message}` };
    }
  }
}
