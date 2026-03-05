import * as cheerio from 'cheerio';
import { ExtractorContext, ExtractorResult } from '../extractors/types';
import { EtsyMarketplaceMetrics, ProductMetrics, ShippingProfileEntry, Variation } from '../../../types';
import { parsePrice, parseCurrency } from '../../../utils/parsers';

const normalizeText = (input: string): string => input.replace(/\s+/g, ' ').trim();
const normalizeTitle = (value: string): string =>
  normalizeText(value)
    .replace(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/gi, ' ')
    .replace(/\[[^\]]*]\((https?:\/\/[^)]+)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeTitleCandidate = (value: string | undefined): string => {
  if (!value) return '';
  const cleaned = normalizeTitle(value)
    .replace(/\s*[\-|:]\s*etsy(?:\.[a-z.]+)?\s*$/i, '')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length < 4) return '';
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(cleaned)) return '';
  if (/^[-[\]()\s]+$/.test(cleaned)) return '';
  if (/^(homepage|home)\b/i.test(cleaned)) return '';
  return cleaned;
};

const toArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const extractEtsyJsonLd = ($: cheerio.CheerioAPI): Record<string, any> => {
  const candidates: Array<Record<string, any>> = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const rootNodes = toArray(parsed);

      for (const node of rootNodes) {
        const graphNodes = node && typeof node === 'object' ? toArray(node['@graph']) : [];
        const nodes = graphNodes.length > 0 ? graphNodes : [node];

        for (const entry of nodes) {
          if (!entry || typeof entry !== 'object') continue;
          const type = entry['@type'];
          if (
            type === 'Product' ||
            (Array.isArray(type) && type.includes('Product'))
          ) {
            candidates.push(entry);
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  });

  return candidates[0] || {};
};

const extractPriceFromJsonLd = (jsonLd: Record<string, any>): { price?: number; currency?: string } => {
  const offers = toArray(jsonLd?.offers);

  for (const offer of offers) {
    if (!offer || typeof offer !== 'object') continue;

    const directPrice = parsePrice(String(offer.price || ''));
    const lowPrice = parsePrice(String(offer.lowPrice || ''));
    const highPrice = parsePrice(String(offer.highPrice || ''));

    const specPrice = offer.priceSpecification?.price
      ? parsePrice(String(offer.priceSpecification.price))
      : 0;

    const resolvedPrice = [directPrice, lowPrice, highPrice, specPrice].find((v) => v > 0);
    if (resolvedPrice && resolvedPrice > 0) {
      return {
        price: resolvedPrice,
        currency:
          offer.priceCurrency ||
          offer.priceSpecification?.priceCurrency ||
          jsonLd?.priceCurrency,
      };
    }
  }

  const fallbackPrice = parsePrice(String(jsonLd?.price || jsonLd?.lowPrice || ''));
  if (fallbackPrice > 0) {
    return {
      price: fallbackPrice,
      currency: jsonLd?.priceCurrency,
    };
  }

  return {};
};

const extractPriceFromDom = ($: cheerio.CheerioAPI): { price?: number; currency?: string; raw?: string } => {
  const selectors = [
    'div[data-buy-box-region="price"] [data-selector="price-only"]',
    'div[data-buy-box-region="price"] p.wt-text-title-larger',
    'div[data-buy-box-region="price"] p.wt-text-title-03',
    'div[data-buy-box-region="price"] p.wt-text-body-01',
    'p[data-selector="price-only"]',
    'p.wt-text-title-larger',
    '.wt-text-title-larger',
    '.wt-text-title-03',
    '[data-buy-box-region="price"]',
  ];

  for (const selector of selectors) {
    const nodes = $(selector).toArray();
    for (const node of nodes) {
      const localText = normalizeText($(node).text());
      if (!localText || /sale|off|discount|shipping|delivery|cart/i.test(localText)) {
        continue;
      }
      const parsed = parsePrice(localText);
      if (parsed > 0) {
        return {
          price: parsed,
          currency: parseCurrency(localText),
          raw: localText,
        };
      }
    }
  }

  return {};
};

const extractPriceFromState = (html: string): { price?: number; currency?: string } => {
  const patterns: Array<{ price: RegExp; currency?: RegExp; divisor?: RegExp }> = [
    {
      price: /"price"\s*:\s*"([\d.,]+)"/i,
      currency: /"priceCurrency"\s*:\s*"([A-Z]{3})"/i,
    },
    {
      price: /"amount"\s*:\s*(\d+(?:\.\d+)?)/i,
      divisor: /"divisor"\s*:\s*(\d+)/i,
      currency: /"currency_code"\s*:\s*"([A-Z]{3})"/i,
    },
    {
      price: /"min_price"\s*:\s*"([\d.,]+)"/i,
      currency: /"currency_code"\s*:\s*"([A-Z]{3})"/i,
    },
  ];

  for (const pattern of patterns) {
    const priceMatch = html.match(pattern.price);
    if (!priceMatch?.[1]) continue;

    let parsed = parsePrice(priceMatch[1]);
    if (pattern.divisor) {
      const divisorMatch = html.match(pattern.divisor);
      const divisor = divisorMatch?.[1] ? parseInt(divisorMatch[1], 10) : 0;
      if (divisor > 1 && parsed > 0) {
        parsed = parsed / divisor;
      }
    }

    if (parsed > 0) {
      const currencyMatch = pattern.currency ? html.match(pattern.currency) : null;
      return {
        price: parsed,
        currency: currencyMatch?.[1],
      };
    }
  }

  return {};
};

const extractRatingAndReviews = (jsonLd: Record<string, any>, $: cheerio.CheerioAPI): { averageRating?: number; reviewsCount?: number } => {
  const result: { averageRating?: number; reviewsCount?: number } = {};
  const aggregate = jsonLd?.aggregateRating;

  if (aggregate) {
    const rating = parseFloat(String(aggregate.ratingValue || ''));
    if (Number.isFinite(rating) && rating > 0) result.averageRating = rating;

    const reviews = parseInt(String(aggregate.reviewCount || aggregate.ratingCount || '0').replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(reviews) && reviews > 0) result.reviewsCount = reviews;
  }

  if (!result.averageRating) {
    const ratingText = normalizeText(
      String($('input[name="initial-rating"]').val() || '') ||
      $('div.reviews-section span.wt-badge').text() ||
      $('[data-rating]').first().attr('data-rating') ||
      '',
    );
    const ratingMatch = ratingText.match(/([\d.]+)/);
    if (ratingMatch?.[1]) {
      const parsed = parseFloat(ratingMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) result.averageRating = parsed;
    }
  }

  if (!result.reviewsCount) {
    const reviewsText = normalizeText($('div.reviews-section h2').text() || $('h2:contains("reviews")').text() || '');
    const match = reviewsText.match(/(\d+(?:,\d+)?)\s+reviews?/i);
    if (match?.[1]) {
      const parsed = parseInt(match[1].replace(/,/g, ''), 10);
      if (Number.isFinite(parsed) && parsed > 0) result.reviewsCount = parsed;
    }
  }

  return result;
};

const extractNumericMetric = (text: string, pattern: RegExp): number | undefined => {
  const match = normalizeText(text).match(pattern);
  if (!match?.[1]) return undefined;
  const parsed = parseInt(match[1].replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return undefined;
};

const SHIPPING_NOISE_PATTERNS: RegExp[] = [
  /return shipping/i,
  /returns accepted/i,
  /problem calculating your shipping/i,
  /please try again/i,
  /please enter a valid zip/i,
  /\bzip code\b/i,
  /\bsubmit\b/i,
  /\bloading\b/i,
  /\bcountry\b/i,
  /ships from\b/i,
];

const TAG_NOISE_PATTERNS: RegExp[] = [
  /back to search results/i,
  /search results/i,
  /ad by etsy/i,
  /star seller/i,
  /etsy/i,
];

const inferShippingRegion = (text: string): string | undefined => {
  const prefixed = text.match(/^([A-Z][A-Za-z .&-]{2,40})\s*[:\-]\s*/);
  if (prefixed?.[1]) return normalizeText(prefixed[1]);

  const regionMatch = text.match(
    /(United States|US|USA|North America|Canada|Europe|EU|UK|United Kingdom|Australia|Asia|Worldwide|International)/i,
  );
  if (!regionMatch?.[1]) return undefined;

  const raw = normalizeText(regionMatch[1]);
  if (/^(US|USA)$/i.test(raw)) return 'United States';
  if (/^UK$/i.test(raw)) return 'United Kingdom';
  if (/^EU$/i.test(raw)) return 'Europe';
  return raw;
};

const extractEtaFromShippingText = (text: string): string | undefined => {
  const patterns = [
    /(?:arrives?\s*(?:by)?|estimated delivery[:\s]*)\s*([A-Za-z]{3,10}\s*\d{1,2}(?:\s*[-–]\s*[A-Za-z]{0,10}\s*\d{1,2})?)/i,
    /(ready to ship in\s*\d+\s*[-–]?\s*\d*\s*(?:business\s+)?(?:days?|weeks?))/i,
    /(ships?\s*in\s*\d+\s*[-–]?\s*\d*\s*(?:business\s+)?(?:days?|weeks?))/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeText(match[1]).slice(0, 80);
  }
  return undefined;
};

const extractShippingProfiles = ($: cheerio.CheerioAPI): ShippingProfileEntry[] => {
  const nodes = $(
    '[data-buy-box-region="shipping"], [data-buy-box-region="delivery"], [data-id*="shipping"], [data-id*="delivery"]',
  ).toArray();
  const seen = new Set<string>();
  const profiles: ShippingProfileEntry[] = [];

  for (const node of nodes) {
    const text = normalizeText($(node).text());
    if (!text || text.length < 8) continue;
    if (seen.has(text)) continue;
    seen.add(text);

    const chunks = $(node)
      .find('p, li, span, div')
      .toArray()
      .map((el) => normalizeText($(el).text()))
      .filter(Boolean);
    const candidateChunks = (chunks.length ? chunks : [text])
      .flatMap((part) => part.split(/(?:\||•|\n)/g))
      .map((part) => normalizeText(part))
      .filter(Boolean);

    for (const chunk of candidateChunks) {
      if (SHIPPING_NOISE_PATTERNS.some((pattern) => pattern.test(chunk))) continue;
      if (chunk.length < 8) continue;

      const eta = extractEtaFromShippingText(chunk);
      const price = parsePrice(chunk);
      const hasShippingSignal = /\b(shipping|delivery|arrives?|ready to ship|ships? in|free shipping)\b/i.test(chunk);
      if (!eta && price <= 0 && !/free shipping/i.test(chunk)) continue;
      if (!hasShippingSignal && !eta && price <= 0) continue;

      const profile: ShippingProfileEntry = { region: inferShippingRegion(chunk) || 'Default' };
      if (eta) profile.eta = eta;
      if (price > 0) {
        profile.price = price;
        profile.currency = parseCurrency(chunk);
      } else if (/free shipping/i.test(chunk)) {
        profile.price = 0;
      }

      profiles.push(profile);
    }
  }

  const deduped: ShippingProfileEntry[] = [];
  const keySet = new Set<string>();
  for (const entry of profiles) {
    const key = `${entry.region.toLowerCase()}|${(entry.eta || '').toLowerCase()}|${entry.price ?? ''}|${entry.currency || ''}`;
    if (keySet.has(key)) continue;
    keySet.add(key);
    deduped.push(entry);
  }
  return deduped.slice(0, 6);
};

const extractTagsAndMaterials = (jsonLd: Record<string, any>, $: cheerio.CheerioAPI): { tags?: string[]; materials?: string[] } => {
  const tags = new Map<string, string>();
  const materials = new Map<string, string>();

  const normalizeComparableToken = (value: string): string => normalizeText(value)
    .replace(/^#/, '')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    .slice(0, 80);
  const isValidTag = (value: string): boolean => {
    if (!value || value.length < 2 || value.length > 60) return false;
    if (/^\d+$/.test(value)) return false;
    if (/^(all|listing|search|home|shop)$/i.test(value)) return false;
    if (TAG_NOISE_PATTERNS.some((pattern) => pattern.test(value))) return false;
    return true;
  };
  const isValidMaterial = (value: string): boolean => {
    if (!value || value.length < 2 || value.length > 60) return false;
    if (/^\d+$/.test(value)) return false;
    if (TAG_NOISE_PATTERNS.some((pattern) => pattern.test(value))) return false;
    return true;
  };

  const jsonKeywords = toArray(jsonLd?.keywords)
    .flatMap((v) => String(v).split(','))
    .map((v) => normalizeComparableToken(v))
    .filter(Boolean);
  for (const keyword of jsonKeywords) {
    if (isValidTag(keyword)) tags.set(keyword.toLowerCase(), keyword);
  }

  const jsonMaterial = toArray(jsonLd?.material)
    .flatMap((v) => String(v).split(','))
    .map((v) => normalizeComparableToken(v))
    .filter(Boolean);
  for (const material of jsonMaterial) {
    if (isValidMaterial(material)) materials.set(material.toLowerCase(), material);
  }

  $('[data-selector*="material"], [data-id*="material"], [id*="material"], li:contains("Materials"), p:contains("Materials")').each((_, el) => {
    const text = normalizeText($(el).text());
    if (!text) return;
    const cleaned = text.replace(/^materials?\s*:\s*/i, '');
    cleaned.split(/[,/•|]/g).forEach((part) => {
      const item = normalizeComparableToken(part);
      if (isValidMaterial(item)) materials.set(item.toLowerCase(), item);
    });
  });

  $('[data-selector*="tag"], [data-id*="tag"], [id*="tag"], li:contains("Tags"), p:contains("Tags")').each((_, el) => {
    const text = normalizeText($(el).text());
    if (!text) return;
    const cleaned = text.replace(/^tags?\s*:\s*/i, '');
    cleaned.split(/[,/•|]/g).forEach((part) => {
      const item = normalizeComparableToken(part);
      if (isValidTag(item)) tags.set(item.toLowerCase(), item);
    });
  });
  $('[data-selector*="tag"] a, [data-id*="tag"] a, [id*="tag"] a').each((_, el) => {
    const item = normalizeComparableToken($(el).text());
    if (isValidTag(item)) tags.set(item.toLowerCase(), item);
  });

  return {
    tags: Array.from(tags.values()).slice(0, 20),
    materials: Array.from(materials.values()).slice(0, 20),
  };
};

const extractShopSignals = ($: cheerio.CheerioAPI): { shopAgeText?: string; isStarSeller?: boolean; shopResponseRate?: number } => {
  const result: { shopAgeText?: string; isStarSeller?: boolean; shopResponseRate?: number } = {};
  const shopText = normalizeText(
    $('[data-shop-name], [data-id*="shop"], [id*="shop"], section:contains("shop"), div:contains("shop owner"), div:contains("Star Seller"), body').text(),
  );

  if (!shopText) return result;

  const ageMatch = shopText.match(/(?:on Etsy since|shop opened|opened in)\s*([A-Za-z]+\s+\d{4}|\d{4})/i);
  if (ageMatch?.[1]) {
    result.shopAgeText = normalizeText(ageMatch[1]);
  }

  if (/star seller/i.test(shopText)) {
    result.isStarSeller = true;
  }

  const responseMatch = shopText.match(/(\d{1,3})\s*%\s*(?:response rate|responds?)/i);
  if (responseMatch?.[1]) {
    const rate = parseInt(responseMatch[1], 10);
    if (Number.isFinite(rate) && rate >= 0 && rate <= 100) {
      result.shopResponseRate = rate;
    }
  }

  return result;
};

const normalizeDispatchDays = (dispatchTime?: string): { dispatchMinDays?: number; dispatchMaxDays?: number } => {
  if (!dispatchTime) return {};
  const text = normalizeText(dispatchTime).toLowerCase();

  const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(business\s+)?(day|days|week|weeks)/i);
  if (rangeMatch?.[1] && rangeMatch?.[2] && rangeMatch?.[4]) {
    const from = parseInt(rangeMatch[1], 10);
    const to = parseInt(rangeMatch[2], 10);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      const multiplier = /week/i.test(rangeMatch[4]) ? 7 : 1;
      const minDays = Math.min(from, to) * multiplier;
      const maxDays = Math.max(from, to) * multiplier;
      if (minDays >= 0 && maxDays >= minDays && maxDays <= 365) {
        return { dispatchMinDays: minDays, dispatchMaxDays: maxDays };
      }
    }
  }

  const singleMatch = text.match(/(\d+)\s*(business\s+)?(day|days|week|weeks)/i);
  if (singleMatch?.[1] && singleMatch?.[3]) {
    const value = parseInt(singleMatch[1], 10);
    if (Number.isFinite(value) && value >= 0 && value <= 365) {
      const days = /week/i.test(singleMatch[3]) ? value * 7 : value;
      return { dispatchMinDays: days, dispatchMaxDays: days };
    }
  }

  return {};
};

const normalizeShopAgeYears = (shopAgeText?: string): number | undefined => {
  if (!shopAgeText) return undefined;
  const text = normalizeText(shopAgeText);
  const nowYear = new Date().getFullYear();

  const yearMatch = text.match(/\b(20\d{2}|19\d{2})\b/);
  if (yearMatch?.[1]) {
    const year = parseInt(yearMatch[1], 10);
    if (Number.isFinite(year) && year >= 1990 && year <= nowYear) {
      const age = nowYear - year;
      if (age >= 0 && age <= 50) return age;
    }
  }

  const yearsMatch = text.match(/(\d{1,2})\s*(?:\+)?\s*years?/i);
  if (yearsMatch?.[1]) {
    const years = parseInt(yearsMatch[1], 10);
    if (Number.isFinite(years) && years >= 0 && years <= 50) return years;
  }

  return undefined;
};

const detectDigitalDownload = (jsonLd: Record<string, any>, $: cheerio.CheerioAPI): boolean | undefined => {
  const text = normalizeText(
    [
      String(jsonLd?.description || ''),
      String(jsonLd?.category || ''),
      $('body').text(),
    ].join(' '),
  );

  if (!text) return undefined;
  if (/(digital download|instant download|downloadable|pdf download|this is a digital item|no physical item)/i.test(text)) {
    return true;
  }
  if (/(physical item|ships from|ready to ship|dispatches in|handmade item)/i.test(text)) {
    return false;
  }
  return undefined;
};

const extractDispatchInfo = ($: cheerio.CheerioAPI): { dispatchTime?: string; madeToOrder?: boolean } => {
  const result: { dispatchTime?: string; madeToOrder?: boolean } = {};
  const text = normalizeText(
    $('[data-buy-box-region="delivery"], [data-id*="processing"], [id*="processing"], p:contains("ready to ship"), p:contains("dispatches"), p:contains("made to order"), body').text(),
  );
  if (!text) return result;

  const preferredMatch = text.match(/(?:dispatch(?:es)?|processing time)\s*(?:in|:)?\s*([A-Za-z0-9\-\s]+?(?:days?|weeks?|business days))/i);
  const fallbackMatch = text.match(/(?:ready to ship)\s*(?:in|:)?\s*([A-Za-z0-9\-\s]+?(?:days?|weeks?|business days))/i);
  const dispatchValue = preferredMatch?.[1] || fallbackMatch?.[1];
  if (dispatchValue) {
    result.dispatchTime = normalizeText(dispatchValue).slice(0, 120);
  }

  if (/(made to order|custom order|made-on-demand|made on demand)/i.test(text)) {
    result.madeToOrder = true;
  }

  return result;
};

export const etsyExtractor = async (context: ExtractorContext): Promise<ExtractorResult> => {
  const { $, html } = context;
  const metrics: Partial<ProductMetrics> = {};
  
  const jsonLd = extractEtsyJsonLd($);

  // 1. Title
  const titleCandidates = [
    jsonLd?.name,
    $('h1[data-buy-box-region="title"]').first().text(),
    $('h1').first().text(),
    $('meta[property="og:title"]').attr('content'),
    $('title').first().text(),
  ];
  const title = titleCandidates
    .map((value) => sanitizeTitleCandidate(String(value || '')))
    .find((value) => !!value);
  
  if (!title) {
    return { success: false, metrics: {}, error: 'Could not find product title on Etsy.' };
  }

  // 2. Price and Currency
  const jsonPrice = extractPriceFromJsonLd(jsonLd);
  const domPrice = extractPriceFromDom($);
  const statePrice = extractPriceFromState(html);
  const resolved = [jsonPrice, domPrice, statePrice].find((entry) => (entry.price || 0) > 0);

  if (resolved?.price && resolved.price > 0) {
    metrics.price = resolved.price;
    metrics.itemPrice = resolved.price;
    metrics.currency = resolved.currency || 'USD';
    metrics.priceObservedAt = new Date().toISOString();
    metrics.itemPriceObservedAt = metrics.priceObservedAt;
  }

  // 3. Original Price & Discount
  const originalPriceNode = $('div[data-buy-box-region="price"] p.wt-text-strikethrough').first();
  const originalPriceStr = normalizeText(originalPriceNode.text());
  if (originalPriceStr) {
    metrics.originalPrice = parsePrice(originalPriceStr);
    if (metrics.price && metrics.originalPrice > metrics.price) {
      metrics.discountPercentage = Math.round(((metrics.originalPrice - metrics.price) / metrics.originalPrice) * 100);
    }
  }

  // 4. Rating and Reviews
  const ratingReviews = extractRatingAndReviews(jsonLd, $);
  if (ratingReviews.averageRating) metrics.averageRating = ratingReviews.averageRating;
  if (ratingReviews.reviewsCount) metrics.reviewsCount = ratingReviews.reviewsCount;

  // 5. Shop Info (Buy Box Seller / Brand)
  const brandCandidate = typeof jsonLd?.brand === 'string' ? jsonLd.brand : jsonLd?.brand?.name;
  const shopNameNode = $('a[data-shop-name], a.wt-text-link-no-underline, [data-shop-name]').first();
  const shopName = sanitizeTitleCandidate(
    String(
      brandCandidate ||
      shopNameNode.text() ||
      shopNameNode.attr('data-shop-name') ||
      '',
    ),
  );
  if (shopName && metrics.price && metrics.price > 0) {
    metrics.brand = shopName;
    metrics.buyBox = {
      sellerName: shopName,
      price: metrics.price,
      isFBA: false,
      isAmazon: false
    };
  } else if (shopName) {
    metrics.brand = shopName;
  }
  
  // Shop Sales
  const shopSalesText = normalizeText($('.wt-text-caption span:contains("Sales")').parent().text() || $('span:contains("sales")').text());
  const shopSalesMatch = shopSalesText.match(/([\d,]+)\s+Sales/i);
  if (shopSalesMatch) {
    metrics.salesVolume = shopSalesMatch[1].replace(/,/g, ''); // We can store shop sales here or create a new field. We map to salesVolume for now.
  }

  if (shopName) {
    metrics.sellerCount = 1;
  }

  // 6. Description
  const descriptionHtml = $('#wt-content-toggle-product-details-read-more').html() || 
                          $('div[data-id="description-text"]').html() ||
                          $('meta[property="og:description"]').attr('content') ||
                          '';
  if (descriptionHtml) {
    const descriptionClean = cheerio.load(descriptionHtml)('*').text().replace(/\s+/g, ' ').trim();
    if (descriptionClean) {
      metrics.description = descriptionClean.slice(0, 4000);
      metrics.features = [descriptionClean.slice(0, 2000)];
    }
  } else if (jsonLd.description) {
    const clean = normalizeText(String(jsonLd.description));
    if (clean) {
      metrics.description = clean.slice(0, 4000);
      metrics.features = [clean.slice(0, 2000)];
    }
  }

  // 7. Badges (Bestseller, etc.)
  const badgesText = normalizeText($('.wt-badge--status-bestseller').text());
  if (badgesText.toLowerCase().includes('bestseller')) {
      metrics.isBestSeller = true;
  }
  
  // 8. In Baskets
  const urgencyText = normalizeText($('div[data-buy-box-region="urgency-message"]').text());
  if (urgencyText.includes('basket')) {
      metrics.availability = urgencyText; // e.g., "In 20+ peoples baskets"
      if (!metrics.salesVolume) {
        metrics.salesVolume = urgencyText;
      }
  } else {
    const availabilityFromOffers = normalizeText(String(toArray(jsonLd?.offers)[0]?.availability || ''));
    if (availabilityFromOffers) {
      metrics.availability = availabilityFromOffers.split('/').pop() || availabilityFromOffers;
    }
  }

  // 8b. Delivery and shipping
  const deliveryText = normalizeText(
    $('[data-buy-box-region="delivery"] *').text() ||
    $('[data-buy-box-region="shipping"] *').text() ||
    $('p:contains("Estimated delivery"), p:contains("Arrives"), p:contains("Ready to ship"), p:contains("Free shipping")').first().text() ||
    '',
  );
  if (deliveryText) {
    metrics.deliveryInfo = deliveryText.slice(0, 500);
    const shipping = parsePrice(deliveryText);
    if (shipping > 0) {
      metrics.estimatedShipping = shipping;
      if (metrics.price && metrics.price > 0) {
        metrics.landedPrice = Number((metrics.price + shipping).toFixed(2));
      }
    }
  }

  const shippingProfiles = extractShippingProfiles($);
  if (shippingProfiles.length > 0) {
    metrics.shippingProfiles = shippingProfiles;
  }

  // 8c. Coupon / promo
  const couponText = normalizeText(
    $('[data-buy-box-region*="promotion"]').text() ||
    $('.wt-alert--success, .wt-alert--announcement').text() ||
    $('p:contains("off"), p:contains("coupon"), p:contains("sale")').first().text() ||
    '',
  );
  if (couponText && /(coupon|off|sale|discount|save)/i.test(couponText)) {
    metrics.couponText = couponText.slice(0, 300);
  }

  // 8d. FAQ / questions
  const qaSource = normalizeText(
    $('h2:contains("Questions"), h2:contains("questions"), h2:contains("FAQ"), h2:contains("faq"), [data-id*="faq"], [id*="faq"]').text() ||
    $('body').text() ||
    '',
  );
  const qaCount = extractNumericMetric(qaSource, /(\d[\d,]*)\s*(?:questions?|faqs?)/i);
  if (qaCount) {
    metrics.qaCount = qaCount;
  }

  // 8e. Return policy
  const returnPolicyText = normalizeText(
    $('[data-id*="returns"], [id*="returns"], [data-id*="exchange"], [id*="exchange"]').text() ||
    $('p:contains("returns"), p:contains("exchanges"), p:contains("refund")').first().text() ||
    '',
  );
  if (returnPolicyText) {
    metrics.returnPolicy = returnPolicyText.slice(0, 500);
  }

  // 8f. Views / watchers
  const viewsText = normalizeText(
    $('span:contains("views"), p:contains("views"), span:contains("people have this in their carts")').first().text() ||
    '',
  );
  const viewsCount = extractNumericMetric(viewsText, /(\d[\d,]*)\s*(?:views?|people)/i);
  if (viewsCount) {
    metrics.viewsCount = viewsCount;
  }

  // 9. Images
  const imageUrls: string[] = [];
  $('img.carousel-image, img[data-src-zoom-image], [data-carousel-panel] img').each((_, el) => {
    const src = $(el).attr('data-src-zoom-image') || $(el).attr('src');
    if (src) imageUrls.push(src);
  });
  if (imageUrls.length > 0) {
      const deduped = Array.from(new Set(imageUrls));
      metrics.imageUrls = deduped;
      metrics.imageUrl = deduped[0];
  } else if (jsonLd.image) {
      const imgs = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
      const deduped = Array.from(new Set(imgs.map((item) => String(item)).filter(Boolean)));
      if (deduped.length > 0) {
        metrics.imageUrls = deduped;
        metrics.imageUrl = deduped[0];
      }
  }

  // 9b. Category
  const category = normalizeText(
    String(
      jsonLd?.category ||
      $('meta[property="product:category"]').attr('content') ||
      $('nav[aria-label="Breadcrumb"] li').last().text() ||
      '',
    ),
  );
  if (category) metrics.category = category;

  const { tags, materials } = extractTagsAndMaterials(jsonLd, $);
  if (tags && tags.length > 0) metrics.tags = tags;
  if (materials && materials.length > 0) metrics.materials = materials;

  const digitalDownload = detectDigitalDownload(jsonLd, $);
  if (digitalDownload !== undefined) {
    metrics.isDigitalDownload = digitalDownload;
    if (digitalDownload) {
      delete metrics.shippingProfiles;
      delete metrics.estimatedShipping;
      delete metrics.landedPrice;
    }
  }

  const dispatchInfo = extractDispatchInfo($);
  if (dispatchInfo.dispatchTime) metrics.dispatchTime = dispatchInfo.dispatchTime;
  if (dispatchInfo.madeToOrder !== undefined) metrics.madeToOrder = dispatchInfo.madeToOrder;
  const normalizedDispatch = normalizeDispatchDays(dispatchInfo.dispatchTime);
  if (normalizedDispatch.dispatchMinDays !== undefined) metrics.dispatchMinDays = normalizedDispatch.dispatchMinDays;
  if (normalizedDispatch.dispatchMaxDays !== undefined) metrics.dispatchMaxDays = normalizedDispatch.dispatchMaxDays;

  const shopSignals = extractShopSignals($);
  if (shopSignals.shopAgeText) metrics.shopAgeText = shopSignals.shopAgeText;
  const shopAgeYears = normalizeShopAgeYears(shopSignals.shopAgeText);
  if (shopAgeYears !== undefined) metrics.shopAgeYears = shopAgeYears;
  if (shopSignals.isStarSeller !== undefined) metrics.isStarSeller = shopSignals.isStarSeller;
  if (shopSignals.shopResponseRate !== undefined) metrics.shopResponseRate = shopSignals.shopResponseRate;

  const etsyMetrics: EtsyMarketplaceMetrics = {
    shippingProfiles: metrics.shippingProfiles,
    dispatchTime: metrics.dispatchTime,
    dispatchMinDays: metrics.dispatchMinDays,
    dispatchMaxDays: metrics.dispatchMaxDays,
    madeToOrder: metrics.madeToOrder,
    materials: metrics.materials,
    tags: metrics.tags,
    isDigitalDownload: metrics.isDigitalDownload,
    shopAgeText: metrics.shopAgeText,
    shopAgeYears: metrics.shopAgeYears,
    isStarSeller: metrics.isStarSeller,
    shopResponseRate: metrics.shopResponseRate,
  };
  metrics.etsyMetrics = etsyMetrics;

  // 10. Variations
  const variations: Variation[] = [];
  $('select[data-variation-number]').each((_, selectNode) => {
      const attributeName = normalizeText($(selectNode).parent().find('label').text());
      $(selectNode).find('option').each((__, optionNode) => {
          const value = normalizeText($(optionNode).text());
          if (value && !value.toLowerCase().includes('select a')) {
              variations.push({
                  asin: '',
                  attribute: attributeName || 'Variation',
                  value: value,
                  available: true
              });
          }
      });
  });
  if (variations.length > 0) metrics.variations = variations;

  return {
    success: true,
    title,
    metrics
  };
};
