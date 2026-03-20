import * as cheerio from 'cheerio';
import { Offer } from '../../../types';
import { parsePrice, parseStockCount } from '../../../utils/parsers';
import { fetcher } from '../network/Fetcher';

const normalizeText = (input: string): string => input.replace(/\s+/g, ' ').trim();
const shouldForceEnglishAod = (origin: string): boolean => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase().replace(/^www\./, '');
    return hostname !== 'amazon.com';
  } catch {
    return true;
  }
};
const isInvalidOfferSellerLabel = (raw: string): boolean => {
  const normalized = normalizeText(raw).toLowerCase();
  if (!normalized) return true;
  return /^(return policy|payment|condition|delivery|details|quantity|ships from|sold by)$/i.test(normalized)
    || /^save with used\b/i.test(normalized)
    || /^used\s*-\s*good$/i.test(normalized)
    || normalized.includes('return policy')
    || normalized.endsWith('see less')
    || normalized.endsWith('see more');
};
const extractSellerIdFromOfferUrl = (offerUrl?: string): string => {
  const raw = normalizeText(offerUrl || '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://www.amazon.com');
    const sellerId = normalizeText(parsed.searchParams.get('smid') || parsed.searchParams.get('seller') || '');
    if (sellerId) return sellerId.toLowerCase();
  } catch {
    // Fall through to regex extraction.
  }
  const match = raw.match(/[?&](?:smid|seller)=([^&#]+)/i);
  return normalizeText(match?.[1] || '').toLowerCase();
};
const isLikelyAodOfferNode = ($: cheerio.CheerioAPI, el: cheerio.Element): boolean => {
  const id = normalizeText($(el).attr('id') || '').toLowerCase();
  if (!id) return true;
  if (id === 'aod-offer-list') return false;
  if (id === 'aod-offer-price') return false;
  if (id === 'aod-offer-heading') return false;
  if (id === 'aod-offer-availability') return false;
  if (id === 'aod-offer-soldby') return false;
  if (id.startsWith('aod-offer-') && /(price|list|heading|availability|soldby|quantity)/i.test(id)) return false;
  return true;
};

const extractSellerFromText = (blockText: string): string | null => {
  const normalized = normalizeText(blockText);
  const match = normalized.match(/sold by\s+(.+?)(?:\s+and\s+fulfilled by|\s+ships from|\s+delivery|\s+\$|$)/i);
  if (match?.[1]) return normalizeText(match[1]);
  const shipperSellerMatch = normalized.match(/shipper\s*\/\s*seller\s+(.+?)(?:\s+condition|\s+quantity|\s+delivery|\s+\$|$)/i);
  if (shipperSellerMatch?.[1]) return normalizeText(shipperSellerMatch[1]);
  return null;
};

const extractOfferQuantity = ($: cheerio.CheerioAPI, el: cheerio.Element): number | null => {
  const blockText = normalizeText($(el).text());
  const explicitMatch = blockText.match(/(?:only\s+)?(\d+)\s+(?:left in stock|available)/i);
  if (explicitMatch?.[1]) {
    return parseInt(explicitMatch[1], 10);
  }
  const quantityMatch = blockText.match(/quantity\s*[:\-]?\s*(\d+)/i);
  if (quantityMatch?.[1]) {
    return parseInt(quantityMatch[1], 10);
  }

  // Avoid always returning 1 from selected quantity; use max selectable qty when meaningful.
  const qtyOptions = $(el)
    .find('select[name*="quantity"], select#quantity option, .aod-quantity select option')
    .toArray()
    .map((option) => parseInt($(option).attr('value') || $(option).text().trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (qtyOptions.length > 0) {
    const maxQty = Math.max(...qtyOptions);
    return maxQty > 1 ? maxQty : null;
  }

  // Custom dropdown items in AOD popover/menu.
  const qtyMenuCandidates = $(el)
    .find(
      '.aod-quantity .a-dropdown-item, [id*="quantity"] .a-dropdown-item, [class*="quantity"] .a-dropdown-item, [data-action*="quantity"] .a-dropdown-item'
    )
    .toArray()
    .map((node) => parseInt(normalizeText($(node).text()).replace(/[^\d]/g, ''), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (qtyMenuCandidates.length > 0) {
    return Math.max(...qtyMenuCandidates);
  }

  return null;
};

const resolveOfferStockCount = (parsedStockCount: number | null, parsedQuantity: number | null): number | null => {
  if (parsedStockCount === 999) return parsedQuantity;
  if (parsedStockCount !== null && parsedQuantity !== null) return Math.max(parsedStockCount, parsedQuantity);
  return parsedStockCount ?? parsedQuantity;
};

/**
 * Parses seller offers from Amazon's All Offers Display (AOD) AJAX response HTML.
 * This is the modern replacement for the deprecated /gp/offer-listing/ pages.
 */
export function parseAmazonAodOffersHtml(html: string, currency: string, origin: string): Offer[] {
  const $ = cheerio.load(html);
  const offers: Offer[] = [];

  // AOD panel uses #aod-offer elements
  $('#aod-offer, .aod-offer, .aod-offer-row, [id^="aod-offer-"], .aod-information-block').each((_, el) => {
    if (!isLikelyAodOfferNode($, el)) return;
    const hasOfferPrice =
      $(el).find('#aod-offer-price, .aod-offer-price, .a-price .a-offscreen, .a-price').length > 0;
    if (!hasOfferPrice) return;

    const priceText = $(el).find('.a-price .a-offscreen').first().text().trim()
                   || $(el).find('.aod-offer-price .a-offscreen').first().text().trim()
                   || $(el).find('.a-price-whole').first().text().trim();
    const whole = $(el).find('.a-price-whole').first().text().replace(/[^\d]/g, '').trim();
    const fraction = $(el).find('.a-price-fraction').first().text().replace(/[^\d]/g, '').trim();
    const normalizedPriceText = priceText || (whole ? `${whole}.${fraction || '00'}` : '');
    
    let sellerName = $(el).find('#aod-offer-soldBy a[aria-label]').first().text().trim()
                    || $(el).find('#aod-offer-soldBy a').first().text().trim()
                    || $(el).find('.aod-offer-soldBy a').first().text().trim()
                    || normalizeText($(el).find('#aod-offer-soldBy, .aod-offer-soldBy').text())
                    || extractSellerFromText($(el).text())
                    || '';
    if (isInvalidOfferSellerLabel(sellerName)) {
      const extractedFromText = extractSellerFromText($(el).text()) || '';
      sellerName = isInvalidOfferSellerLabel(extractedFromText) ? '' : extractedFromText;
    }

    const condition = $(el).find('#aod-offer-heading h5').text().trim()
                   || $(el).find('.aod-offer-heading').text().trim()
                   || 'New';

    const deliveryText = $(el).find('#aod-offer-price .aod-ship-speed').text().replace(/\s+/g, ' ').trim()
                      || $(el).find('.aod-delivery-promise').text().replace(/\s+/g, ' ').trim()
                      || $(el).find('.a-color-base.a-text-bold').text().replace(/\s+/g, ' ').trim();

    const stockText = $(el).find('#aod-offer-availability .a-size-small').text().replace(/\s+/g, ' ').trim()
                   || $(el).find('#aod-offer-availability .a-color-price').text().replace(/\s+/g, ' ').trim()
                   || $(el).find('.aod-offer-availability .a-size-small').text().replace(/\s+/g, ' ').trim()
                   || $(el).find('.aod-offer-availability .a-color-price').text().replace(/\s+/g, ' ').trim();
    const offerId = $(el).attr('id')?.trim()
                 || $(el).attr('data-csa-c-item-id')?.trim()
                 || $(el).attr('data-aod-atc-action')?.trim()
                 || $(el).find('input[name*="offeringID"]').first().attr('value')?.trim()
                 || $(el).find('input[name*="offerListingID"]').first().attr('value')?.trim();
    const offerHref = $(el).find('#aod-offer-soldBy a[href], .aod-offer-soldBy a[href], a[href*="seller="], a[href*="smid="]').first().attr('href')?.trim() || '';
    const offerUrl = offerHref
      ? offerHref.startsWith('http')
        ? offerHref
        : `${origin}${offerHref.startsWith('/') ? '' : '/'}${offerHref}`
      : undefined;
    
    if (normalizedPriceText) {
      const price = parsePrice(normalizedPriceText);
      const elText = $(el).text().toLowerCase();
      const offerIsFBA = elText.includes('fulfilled by amazon') || elText.includes('amazon.com');
      const stockCount = resolveOfferStockCount(parseStockCount(stockText), extractOfferQuantity($, el));

      if (price > 0) {
        offers.push({
          offerId,
          offerUrl,
          sellerName: normalizeText(sellerName) || 'Third-party Seller',
          price,
          currency,
          stockStatus: stockText || 'In Stock',
          stockCount,
          condition: condition.replace(/\s+/g, ' ').trim(),
          deliveryInfo: deliveryText || undefined,
          isFBA: offerIsFBA,
        });
      }
    }
  });

  // Fallback: parse offer-listing format (legacy pages that might still work for some ASINs)
  if (offers.length === 0) {
    $('.olpOffer').each((_, el) => {
      const priceText = $(el).find('.olpOfferPrice').text().trim();
      const seller = $(el).find('.olpSellerName').text().trim() || 'Third-party Seller';
      const condition = $(el).find('.olpCondition').text().trim() || 'New';

      if (priceText) {
        const price = parsePrice(priceText);
        if (price > 0) {
          offers.push({
            sellerName: seller,
            price,
            currency,
            stockStatus: 'In Stock',
            stockCount: null,
            condition,
          });
        }
      }
    });
  }

  return offers;
}

/**
 * Fetches additional seller offers for an ASIN via Amazon's AOD (All Offers Display) AJAX endpoint.
 * @param asin - The Amazon ASIN for the product
 * @param currency - The currency code determined from the domain
 * @param marketplaceUrl - Original product URL for domain-aware requests
 */
export async function fetchAmazonOffers(asin: string, currency: string, marketplaceUrl?: string): Promise<Offer[]> {
  const allOffers: Offer[] = [];
  const configuredMaxPages = Number.parseInt(process.env.AMAZON_AOD_MAX_PAGES || '50', 10);
  const maxPages = Number.isFinite(configuredMaxPages) && configuredMaxPages > 0 ? configuredMaxPages : 50;
  let origin = 'https://www.amazon.com';
  const seen = new Set<string>();

  if (marketplaceUrl) {
    try {
      const parsed = new URL(marketplaceUrl);
      origin = `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      // Keep default origin.
    }
  }

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
      `${origin}/gp/product/ajax/ref=aod_page_${pageNo - 1}?asin=${asin}&pc=dp&experienceId=aodAjaxMain&pageno=${pageNo}${langParam}`,
      `${origin}/gp/product/ajax/ref=aod_page_${pageNo}?asin=${asin}&pc=dp&experienceId=aodAjaxMain&pageno=${pageNo}${langParam}`,
      `${origin}/gp/product/ajax/ref=aod_page_${pageNo - 1}?asin=${asin}&pc=dp&experienceId=aodAjaxMain${langParam}`,
      `${origin}/gp/offer-listing/${asin}/ref=dp_olp_NEW_mbc?ie=UTF8&condition=new&pageno=${pageNo}${langParam}`,
      `${origin}/gp/offer-listing/${asin}?startIndex=${(pageNo - 1) * 10}${langParam}`,
    ];

    let html = '';
    for (const endpoint of endpointCandidates) {
      const result = await fetcher.fetchHtml(endpoint);
      if (!result.success || !result.html || result.html.length < 120) continue;
      const rows = countOfferRows(result.html);
      if (rows === 0) continue;
      html = result.html;
      break;
    }

    if (!html) break;

    const offerRows = countOfferRows(html);
    const offerIds = extractOfferIds(html);
    const beforeCount = seenOfferIds.size;
    for (const offerId of offerIds) seenOfferIds.add(offerId);
    const newOfferIds = seenOfferIds.size - beforeCount;

    const pageOffers = parseAmazonAodOffersHtml(html, currency, origin);
    if (pageOffers.length === 0 && pageNo > 1) break;

    for (const offer of pageOffers) {
      const sellerId = extractSellerIdFromOfferUrl(offer.offerUrl);
      const dedupKey = sellerId
        ? `seller-id|${sellerId}|${Number(offer.price || 0).toFixed(2)}|${(offer.condition || '').toLowerCase()}`
        : `${(offer.offerId || '').toLowerCase()}|${Number(offer.price || 0).toFixed(2)}|${(offer.sellerName || '').toLowerCase()}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      allOffers.push(offer);
    }

    if (pageNo > 1 && offerRows > 0 && newOfferIds === 0) {
      duplicatePageStreak += 1;
    } else {
      duplicatePageStreak = 0;
    }
    if (duplicatePageStreak >= 2) break;

    if (pageNo < maxPages) {
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  return allOffers;
}

/**
 * Extracts ASIN from a standard Amazon product URL.
 */
export function extractAsin(url: string): string | null {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/i)
             || url.match(/\/product\/([A-Z0-9]{10})/i)
             || url.match(/\/gp\/product\/([A-Z0-9]{10})/i)
             || url.match(/asin=([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : null;
}
