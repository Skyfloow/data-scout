import { ExtractorContext, ExtractorResult } from '../extractors/types';
import {
  ProductMetrics,
  Offer,
  Variation,
  RelatedProduct,
  BsrCategory,
  BuyBoxInfo,
  LightningDeal,
  AmazonMarketplaceMetrics,
} from '../../../types';
import { parsePrice, parseCurrency, parseStockCount, detectCurrencyFromDomain, detectCurrencyFromUrlParam, detectCurrencyFromText } from '../../../utils/parsers';
import { extractAsin, fetchAmazonOffers } from './amazon-offers';
import * as cheerio from 'cheerio';

const normalizeText = (input: string): string => input.replace(/\s+/g, ' ').trim();
const GENERIC_SELLER_PATTERN = /^(unknown(?:\s+seller)?|third-?party seller)$/i;
const isStableOfferId = (value?: string): boolean => {
  const normalized = normalizeText(value || '').toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('aod-')) return false;
  if (normalized === 'aod-offer' || normalized === 'aod-offer-price' || normalized === 'aod-offer-list') return false;
  return normalized.length >= 12;
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
const isLikelyAodOfferNode = (root: cheerio.Cheerio<any>): boolean => {
  const id = normalizeText(root.attr('id') || '').toLowerCase();
  if (!id) return true;
  if (id === 'aod-offer-list') return false;
  if (id === 'aod-offer-price') return false;
  if (id === 'aod-offer-heading') return false;
  if (id === 'aod-offer-availability') return false;
  if (id === 'aod-offer-soldby') return false;
  if (id.startsWith('aod-offer-') && /(price|list|heading|availability|soldby|quantity)/i.test(id)) return false;
  return true;
};

const cleanAmazonTitle = (raw: string): string => {
  return normalizeText(
    raw
      .replace(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/gi, ' ')
      .replace(/https?:\/\/\S+/gi, ' ')
  )
    .replace(/^amazon(?:\.[a-z.]+)?:\s*/i, '')
    .replace(/\s*[\-|:]\s*amazon(?:\.[a-z.]+)?\s*$/i, '')
    .replace(/\s*\|\s*amazon(?:\.[a-z.]+)?\s*$/i, '')
    .trim();
};

const isInvalidTitleCandidate = (value: string): boolean => {
  if (!value) return true;
  const lowered = value.toLowerCase();
  if (/!\[[^\]]*]\((https?:\/\/[^)]+)\)/i.test(value)) return true;
  if (/^https?:\/\//.test(lowered)) return true;
  if (/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(lowered)) return true;
  if (/(images-amazon|media-amazon|ssl-images-amazon)/i.test(lowered)) return true;
  if (!/[a-zа-я0-9]/i.test(value)) return true;
  if (value.length < 3) return true;
  return false;
};

const extractProductTitle = ($: cheerio.CheerioAPI): string => {
  const candidates = [
    $('#productTitle').first().text(),
    $('#title #productTitle').first().text(),
    $('#title span#productTitle').first().text(),
    $('#ebooksProductTitle').first().text(),
    $('#btAsinTitle').first().text(),
    $('h1.a-size-large.a-spacing-none').first().text(),
    $('meta[property="og:title"]').attr('content') || '',
    $('meta[name="title"]').attr('content') || '',
    $('title').first().text(),
  ];

  for (const candidate of candidates) {
    const cleaned = cleanAmazonTitle(candidate || '');
    if (cleaned && !/^amazon(?:\.[a-z.]+)?$/i.test(cleaned) && !isInvalidTitleCandidate(cleaned)) {
      return cleaned;
    }
  }
  return 'Unknown Product';
};

const extractLabeledAmount = (text: string, regexes: RegExp[]): number | undefined => {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (!match) continue;
    for (let i = match.length - 1; i >= 1; i--) {
      const candidate = match[i];
      if (candidate && /\d/.test(candidate)) {
        const parsed = parsePrice(candidate);
        if (parsed > 0) return parsed;
      }
    }
  }
  return undefined;
};

const extractLandedPricing = ($: cheerio.CheerioAPI) => {
  const pricingContextSelectors = [
    '#exports_desktop_qualifiedBuybox_tlc_feature_div',
    '#mir-layout-DELIVERY_BLOCK',
    '#deliveryBlockMessage',
    '#deliveryBlockMessage_feature_div',
    '#deliveryMessageMirId',
    '#ddmDeliveryMessage',
    '#tabular-buybox-truncate-0',
    '#tabular-buybox',
    '#fulfillerInfoFeature_feature_div',
    '#merchantInfoFeature_feature_div',
    '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE',
    '#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE',
    '#orderSummaryPrimaryItemPrice',
    '#orderSummaryPrimaryShippingPrice',
    '#orderSummaryPrimaryTax',
    '#orderSummaryTotalPrice',
  ];

  const blocks = pricingContextSelectors
    .map((selector) => normalizeText($(selector).text()))
    .filter(Boolean);

  if (blocks.length === 0) return {};

  const pricingText = blocks.join(' | ');
  const shippingAndImportCharges = extractLabeledAmount(pricingText, [
    /shipping\s*(?:&|and)\s*import(?:\s+charges?)?[^$€£\d]*([$€£]\s?[\d.,]+)/i,
    /delivery\s*(?:&|and)\s*import(?:\s+charges?)?[^$€£\d]*([$€£]\s?[\d.,]+)/i,
  ]);
  const estimatedShipping = extractLabeledAmount(pricingText, [
    /shipping(?:\s*&\s*handling)?[^$€£\d]*([$€£]\s?[\d.,]+)/i,
    /delivery(?:\s+charge)?[^$€£\d]*([$€£]\s?[\d.,]+)/i,
  ]);
  const estimatedImportFees = extractLabeledAmount(pricingText, [
    /import(?:\s+charges?|\s+fees?)?[^$€£\d]*([$€£]\s?[\d.,]+)/i,
  ]);
  const estimatedTax = extractLabeledAmount(pricingText, [
    /(?:estimated\s+)?tax(?:es)?[^$€£\d]*([$€£]\s?[\d.,]+)/i,
  ]);
  const totalPrice = extractLabeledAmount(pricingText, [
    /(?:order\s+)?total(?:\s+price|\s+amount|\s+cost)?[^$€£\d]*([$€£]\s?[\d.,]+)/i,
    /grand\s+total[^$€£\d]*([$€£]\s?[\d.,]+)/i,
  ]);

  return {
    shippingAndImportCharges,
    estimatedShipping,
    estimatedImportFees,
    estimatedTax,
    totalPrice,
  };
};

const extractDeliveryInfo = ($: cheerio.CheerioAPI): string | undefined => {
  const candidates = [
    '#deliveryBlockMessage',
    '#deliveryBlockMessage_feature_div',
    '#deliveryMessageMirId',
    '#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE',
    '#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE',
    '#ddmDeliveryMessage',
  ];

  for (const selector of candidates) {
    const value = normalizeText($(selector).text());
    if (value) return value;
  }
  return undefined;
};

const extractSalesVolume = ($: cheerio.CheerioAPI): string | undefined => {
  const candidates = [
    '#social-proofing-faceout-title-tk_bought',
    '#social-proofing-faceout-title-tk_purchase',
    '#socialProofingAsinFaceout_feature_div',
    '#socialProofingAsinFaceout',
    '[data-cy="social-proofing-faceout-title-tk_bought"]',
  ];

  for (const selector of candidates) {
    const value = normalizeText($(selector).text());
    if (/\bbought\b/i.test(value)) return value;
  }

  const bodyText = normalizeText($('body').text());
  const match = bodyText.match(/(?:\d[\d,.]*\+?\s*)?bought in past month/i);
  return match?.[0];
};

const extractClimateFriendly = ($: cheerio.CheerioAPI): boolean => {
  return (
    $('#climatePledgeFriendlyBadge, #climatePledgeFriendlyProgramsBadge_feature_div').length > 0 ||
    /climate pledge friendly/.test(normalizeText($('body').text()).toLowerCase())
  );
};

const extractStructuredPrice = ($: cheerio.CheerioAPI): number | undefined => {
  const metaPrice = parsePrice($('meta[property="product:price:amount"]').attr('content') || '');
  if (metaPrice > 0) return metaPrice;

  let jsonLdPrice: number | undefined;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdPrice) return;
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const offers = node?.offers;
        const offer = Array.isArray(offers) ? offers[0] : offers;
        const candidate = parsePrice(String(offer?.price || ''));
        if (candidate > 0) {
          jsonLdPrice = candidate;
          return;
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  });
  return jsonLdPrice;
};

const isInstallmentPriceContext = ($: cheerio.CheerioAPI, el: any): boolean => {
  const contextText = normalizeText(
    $(el)
      .closest(
        '#installmentCalculator_feature_div, #tp-tool-tip-subtotal-price, #credit-card-offer, #mir-layout-DELIVERY_BLOCK, [id*="installment"], [class*="installment"]'
      )
      .first()
      .text()
  ).toLowerCase();

  const localText = normalizeText(`${$(el).text()} ${$(el).attr('aria-label') || ''} ${$(el).closest('.a-price, .priceToPay, .apexPriceToPay').text()}`).toLowerCase();
  const text = `${localText} ${contextText}`;

  return (
    /(?:\/\s*mo\b|\/\s*month\b|per\s+month|monthly|installment|equal\s+payments|apr|interest|with\s+prime\s+visa|credit\s+card)/i.test(text) &&
    !/(one-time purchase|buy now|add to cart)/i.test(text)
  );
};

const isNonPrimaryPriceContext = (text: string): boolean => {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return false;
  return /(?:list price|typical price|was:|you save|save\s+\d+%|coupon|without trade-in|trade-in value|delivery|shipping|import charges|estimated tax|subscribe & save)/i.test(normalized);
};

const extractMaxQuantityFromOptions = ($: cheerio.CheerioAPI, root?: cheerio.Cheerio<any>): number | null => {
  const scope = root ?? $.root();
  const options = scope
    .find('select[name*="quantity"] option, #quantity option, .aod-quantity select option')
    .toArray()
    .map((opt) => parseInt(($(opt).attr('value') || $(opt).text() || '').trim(), 10))
    .filter((qty) => Number.isFinite(qty) && qty > 0);

  if (options.length === 0) return null;
  return Math.max(...options);
};

const extractMaxQuantityFromDropdownItems = ($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>): number | null => {
  const items = root
    .find(
      '.aod-quantity .a-dropdown-item, [id*="quantity"] .a-dropdown-item, [class*="quantity"] .a-dropdown-item, [data-action*="quantity"] .a-dropdown-item'
    )
    .toArray()
    .map((node) => parseInt(normalizeText($(node).text()).replace(/[^\d]/g, ''), 10))
    .filter((qty) => Number.isFinite(qty) && qty > 0);
  return items.length ? Math.max(...items) : null;
};

const extractQuantityFromText = (text: string): number | null => {
  const normalized = normalizeText(text);
  const quantityMatch = normalized.match(/quantity\s*[:\-]?\s*(\d+)/i);
  if (quantityMatch?.[1]) return parseInt(quantityMatch[1], 10);
  const leftMatch = normalized.match(/(?:only\s+)?(\d+)\s+left in stock/i);
  if (leftMatch?.[1]) return parseInt(leftMatch[1], 10);
  return null;
};

const parseCountToken = (raw: string): number | undefined => {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return undefined;
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 10000) return undefined;
  return value;
};

const extractAodSellerCount = ($: cheerio.CheerioAPI): number | undefined => {
  const scoredCandidates: Array<{ score: number; count: number }> = [];
  const pushCandidate = (raw: string | undefined, score: number): void => {
    const parsed = parseCountToken(raw || '');
    if (!parsed) return;
    scoredCandidates.push({ score, count: parsed });
  };

  const parseCountSignals = (text: string): void => {
    const normalized = normalizeText(text);
    if (!normalized) return;

    if (/^\d[\d,]*$/.test(normalized)) pushCandidate(normalized, 6);

    for (const match of normalized.matchAll(/new\s*&\s*used\s*\(([\d,]+)\)/gi)) {
      pushCandidate(match[1], 6);
    }
    for (const match of normalized.matchAll(/other sellers?(?:\s+on\s+amazon)?[^()]{0,120}\(([\d,]+)\)/gi)) {
      pushCandidate(match[1], 6);
    }
    for (const match of normalized.matchAll(/\(([\d,]+)\)\s*from\b/gi)) {
      pushCandidate(match[1], 5);
    }
    for (const match of normalized.matchAll(/([\d,]+)\s*(?:offers?|sellers?)\b/gi)) {
      pushCandidate(match[1], 4);
    }
    for (const match of normalized.matchAll(/([\d,]+)\s+(?:new|used|collectible)\b/gi)) {
      pushCandidate(match[1], 3);
    }
  };

  const signalSelectors = [
    '#aod-total-offer-count',
    '#aod-asin-count',
    '#dynamic-aod-ingress-box',
    '#dynamic-aod-ingress-box_feature_div',
    '#olp-upd-new-used',
    '#olp-upd-new',
    '#olp-upd-used',
    '#olp_feature_div',
    '#all-offers-display',
  ];

  for (const selector of signalSelectors) {
    const node = $(selector).first();
    if (node.length === 0) continue;
    parseCountSignals(node.text());
    parseCountSignals(node.attr('aria-label') || '');
    parseCountSignals(node.attr('data-aod-total-offer-count') || '');
  }

  const bodyText = normalizeText($('body').text());
  for (const match of bodyText.matchAll(/(?:other sellers?(?:\s+on\s+amazon)?|new\s*&\s*used)[^()]{0,120}\(([\d,]+)\)/gi)) {
    pushCandidate(match[1], 5);
  }

  if (scoredCandidates.length === 0) return undefined;
  scoredCandidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.count - left.count;
  });
  return scoredCandidates[0].count;
};

/**
 * Detects and fixes duplicated seller names.
 * Amazon sometimes renders the name in both visible text and hidden/aria spans,
 * causing `.text()` to produce "ELECTRONIC DEALSELECTRONIC DEALS".
 * Also handles concatenated multi-seller strings when the selector grabs
 * content from adjacent DOM cells (e.g., "FooFooBarBar" from multiple rows).
 */
const deduplicateSellerName = (raw: string): string => {
  const name = normalizeText(raw);
  if (!name || name.length < 2) return name;

  // 1. Exact duplication without space: "FooFoo" → "Foo"
  const len = name.length;
  if (len % 2 === 0) {
    const half = name.substring(0, len / 2);
    if (name === half + half) return half;
  }

  // 2. Word-level duplication: "Foo Bar Foo Bar" → "Foo Bar"
  const words = name.split(/\s+/);
  if (words.length >= 2 && words.length % 2 === 0) {
    const halfWords = words.slice(0, words.length / 2).join(' ');
    const secondHalf = words.slice(words.length / 2).join(' ');
    if (halfWords === secondHalf) return halfWords;
  }

  // 3. Try to detect tripled or quadrupled patterns: "FooFooFoo" → "Foo"
  for (const divisor of [3, 4]) {
    if (len % divisor === 0) {
      const chunk = name.substring(0, len / divisor);
      if (chunk.repeat(divisor) === name) return chunk;
    }
  }

  // 4. Known label contamination: strip common layout labels accidentally concatenated
  const labelPrefixes = /^(ships from|sold by|fulfilled by|returns|payment|shipper \/ seller)\s*/i;
  const cleaned = name.replace(labelPrefixes, '').trim();
  if (cleaned && cleaned !== name) return deduplicateSellerName(cleaned);

  return name;
};

const normalizeSellerName = (raw: string): string => {
  const normalized = deduplicateSellerName(raw).replace(/^sold by\s+/i, '').replace(/^ships from\s+/i, '');
  return normalizeText(normalized);
};

const isGenericSellerName = (name: string): boolean => GENERIC_SELLER_PATTERN.test(normalizeText(name));
const isAmazonOwnedSellerName = (name: string): boolean => {
  const normalized = normalizeText(name).toLowerCase();
  return /^amazon(?:\.com)?$/.test(normalized)
    || normalized === 'sold by amazon.com'
    || normalized.includes('amazon resale')
    || normalized.includes('warehouse deals');
};
const isInvalidOfferSellerName = (name: string): boolean => {
  const normalized = normalizeText(name).toLowerCase();
  if (!normalized) return true;
  return /^(return policy|payment|condition|delivery|details|quantity|ships from|sold by)$/i.test(normalized)
    || /^save with used\b/i.test(normalized)
    || /^used\s*-\s*good$/i.test(normalized);
};

const BUYBOX_TABULAR_SCOPE_SELECTORS = [
  '#tabular-buybox',
  '#tabular-buybox-container',
  '#exports_desktop_qualifiedBuybox_feature_div',
  '#exports_desktop_qualifiedBuybox_buybox',
  '#desktop_buybox',
  '#buybox',
  '#apex_desktop',
  '#apex_offerDisplay_desktop',
];

const isSecondaryOfferContext = ($: cheerio.CheerioAPI, node: cheerio.Cheerio<any>): boolean => {
  if (
    node.closest(
      '#all-offers-display, #aod-offer-list, #aod-offer, .aod-offer, .aod-offer-row, .aod-information-block, #olp_feature_div, #olp-upd-new-used, #olp-upd-used, #olp-upd-new, #mbc'
    ).length > 0
  ) {
    return true;
  }

  const containerId = normalizeText(node.closest('[id]').attr('id') || '').toLowerCase();
  if (containerId && /(used|aod|all-offers|offer-listing|olp)/i.test(containerId)) {
    return true;
  }

  const localText = normalizeText(node.closest('[role="row"], tr, .a-row, .tabular-buybox-row, li, div').text()).toLowerCase();
  if (!localText) return false;
  if (/save with used|used\s*-\s*good|pre-owned|renewed/.test(localText)) return true;
  return false;
};

const extractTabularAttributeValue = (
  $: cheerio.CheerioAPI,
  attributeName: string,
  scopeSelectors: string[] = []
): string => {
  const escapedName = attributeName.replace(/"/g, '\\"');
  const attrSelector = `[tabular-attribute-name="${escapedName}"]`;
  const attrNodes = scopeSelectors.length > 0
    ? scopeSelectors.flatMap((selector) => $(selector).find(attrSelector).toArray())
    : $(attrSelector).toArray();

  for (const node of attrNodes) {
    if (isSecondaryOfferContext($, $(node))) continue;
    const labelEl = $(node);
    const directValue = labelEl.next('[tabular-attribute-value], .tabular-buybox-text').first();
    const directLink = directValue.find('a').first().text().trim();
    const directText = normalizeText(directLink || directValue.text());
    if (directText && !directText.toLowerCase().includes(attributeName.toLowerCase())) return directText;

    const row = labelEl.closest('[role="row"], tr, .a-row, .tabular-buybox-row, li, div');
    const rowValue = row.find('[tabular-attribute-value], .tabular-buybox-text').not(labelEl).first();
    const rowLink = rowValue.find('a').first().text().trim();
    const rowText = normalizeText(rowLink || rowValue.text());
    if (rowText && !rowText.toLowerCase().includes(attributeName.toLowerCase())) return rowText;
  }

  return '';
};

const extractSellerFromTabularText = (text: string): string => {
  const normalized = normalizeText(text);
  if (!normalized) return '';

  const shipperSellerMatch = normalized.match(
    /shipper\s*\/\s*seller\s+(.+?)(?:\s+(?:returns|payment|condition|delivery|price|quantity|new|used)\b|$)/i
  );
  if (shipperSellerMatch?.[1]) return normalizeSellerName(shipperSellerMatch[1]);

  const soldByMatch = normalized.match(
    /sold by\s+(.+?)(?:\s+(?:ships from|and fulfilled by|returns|payment|condition|delivery|price|quantity|new|used)\b|$)/i
  );
  if (soldByMatch?.[1]) return normalizeSellerName(soldByMatch[1]);

  return '';
};

const extractInjectedDomAodOffers = ($: cheerio.CheerioAPI, currency: string): Offer[] => {
  const raw = $('#__aod_offers_dom').first().text().trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: any) => {
        const price = Number(row?.price || 0);
        const sellerName = normalizeSellerName(String(row?.sellerName || ''));
        if (!(price > 0) || !sellerName) return null;
        return {
          offerId: row?.offerId ? normalizeText(String(row.offerId)) : undefined,
          offerUrl: row?.offerUrl ? normalizeText(String(row.offerUrl)) : undefined,
          sellerName,
          price,
          currency,
          stockStatus: normalizeText(String(row?.stockStatus || 'In Stock')),
          stockCount: typeof row?.stockCount === 'number' && row.stockCount > 0 ? row.stockCount : null,
          condition: normalizeText(String(row?.condition || 'New')),
          deliveryInfo: row?.deliveryInfo ? normalizeText(String(row.deliveryInfo)) : undefined,
          isFBA: Boolean(row?.isFBA),
        } as Offer;
      })
      .filter((offer: Offer | null): offer is Offer => offer !== null);
  } catch {
    return [];
  }
};

const extractRemoteAodPayloadOffers = ($: cheerio.CheerioAPI, currency: string, pageUrl: string): Offer[] => {
  const payloadNode = $('#__remote_aod_payload').first();
  if (payloadNode.length === 0) return [];
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return 'https://www.amazon.com';
    }
  })();

  const parseAodFragment = (fragment: string): Offer[] => {
    const normalized = fragment.trim();
    if (!normalized) return [];
    const $$ = cheerio.load(normalized);
    const offers: Offer[] = [];

    $$('#aod-pinned-offer, #aod-offer-list > .aod-information-block, #aod-retail-other-offers-content > .aod-information-block, #aod-offer-list > #aod-offer, #aod-retail-other-offers-content > #aod-offer, #aod-offer, .aod-offer, .aod-offer-row, .aod-information-block, [id^="aod-offer-"]').each((_, el) => {
      const root = $$(el);
      if (!isLikelyAodOfferNode(root)) return;
      const hasPrice = root.find('#aod-offer-price, .aod-offer-price, .a-price .a-offscreen, .a-price, [id^="aod-price-"]').length > 0;
      if (!hasPrice) return;
      const offerId = root.attr('id')?.trim()
        || root.attr('data-csa-c-item-id')?.trim()
        || root.attr('data-aod-atc-action')?.trim()
        || root.find('input[name*="offeringID"]').first().attr('value')?.trim()
        || root.find('input[name*="offerListingID"]').first().attr('value')?.trim();
      const offerHref = root.find('#aod-offer-soldBy a[href], .aod-offer-soldBy a[href], a[href*="seller="], a[href*="smid="]').first().attr('href')?.trim() || '';
      const offerUrl = offerHref
        ? offerHref.startsWith('http')
          ? offerHref
          : `${origin}${offerHref.startsWith('/') ? '' : '/'}${offerHref}`
        : undefined;

      let priceText = 
        root.find('.a-price .a-offscreen').first().text().trim() ||
        root.find('.aod-offer-price .a-offscreen').first().text().trim() ||
        root.find('[id^="aod-price-"] .a-offscreen').first().text().trim();
      if (!priceText) {
        const whole = root.find('.a-price-whole').first().text().replace(/[^\d]/g, '').trim();
        const fraction = root.find('.a-price-fraction').first().text().replace(/[^\d]/g, '').trim();
        if (whole) priceText = `${whole}.${fraction || '00'}`;
      }
      if (!priceText) {
        const fromText = normalizeText(root.text()).match(/(?:[$€£]|USD|EUR|GBP)\s?\d[\d,.]*/i)?.[0];
        if (fromText) priceText = fromText;
      }
      const price = parsePrice(priceText);
      if (price <= 0) return;

      const seller = extractAodSellerName(root);
      const condition = root.find('#aod-offer-heading h5').text().trim()
        || root.find('.aod-offer-heading').text().trim()
        || 'New';
      const availabilityText = normalizeText(
        root.find('#aod-offer-availability').text()
        || root.find('.aod-offer-availability').text()
        || 'In Stock'
      );

      const qtyFromAvailability = parseStockCount(availabilityText);
      const qtyFromOptions = extractMaxQuantityFromOptions($$, root);
      const qtyFromDropdownItems = extractMaxQuantityFromDropdownItems($$, root);
      const qtyFromText = extractQuantityFromText(root.text());
      const stockCount = coalesceStockCount(qtyFromAvailability, qtyFromOptions, qtyFromDropdownItems, qtyFromText);
      const isFBA = /fulfilled by amazon|amazon\.com/i.test(root.text());

      offers.push({
        offerId,
        offerUrl,
        sellerName: seller,
        price,
        currency,
        stockStatus: availabilityText || 'In Stock',
        stockCount,
        condition,
        isFBA,
      });
    });

    return offers;
  };

  const htmlPayload = payloadNode.html() || '';
  if (htmlPayload.trim()) {
    const parsed = parseAodFragment(htmlPayload);
    if (parsed.length > 0) return parsed;
  }

  const rawTextPayload = payloadNode.text().trim();
  if (!rawTextPayload) return [];
  const parsedTextHtml = parseAodFragment(rawTextPayload);
  if (parsedTextHtml.length > 0) return parsedTextHtml;

  try {
    const parsedJson = JSON.parse(rawTextPayload);
    const candidate = [parsedJson?.content, parsedJson?.html, parsedJson?.payload]
      .map((value) => (typeof value === 'string' ? value : ''))
      .find(Boolean);
    if (!candidate) return [];
    return parseAodFragment(candidate);
  } catch {
    return [];
  }
};

const coalesceStockCount = (
  parsedStockCount: number | null,
  ...quantityCandidates: Array<number | null>
): number | null => {
  const concreteQty = quantityCandidates.filter((v): v is number => Number.isFinite(v as number) && (v as number) > 0);
  const qtyMax = concreteQty.length ? Math.max(...concreteQty) : null;

  // parseStockCount returns 999 for generic "In Stock". Prefer explicit quantity when available.
  if (parsedStockCount === 999) {
    return qtyMax;
  }
  if (parsedStockCount !== null && qtyMax !== null) {
    return Math.max(parsedStockCount, qtyMax);
  }
  return parsedStockCount ?? qtyMax;
};

const extractAodSellerName = (root: cheerio.Cheerio<any>): string => {
  // Primary: dedicated seller link
  const seller = root.find('#aod-offer-soldBy a[aria-label]').first().text().trim()
    || root.find('.aod-offer-soldBy a[aria-label]').first().text().trim()
    || root.find('#aod-offer-soldBy a').first().text().trim()
    || root.find('.aod-offer-soldBy a').first().text().trim()
    || root.find('#aod-offer-seller a').first().text().trim()
    || root.find('[id*="seller"] a').first().text().trim()
    || normalizeText(root.find('#aod-offer-soldBy, .aod-offer-soldBy').text());
  if (seller) return normalizeSellerName(seller);
  // Try "Ships from" / "Sold by" pattern text extraction
  const fullText = normalizeText(root.text());
  const fromText = fullText.match(/sold by\s+(.+?)(?:\s+and\s+fulfilled by|\s+ships from|\s+delivery|\s+\$|$)/i)?.[1];
  if (fromText) return normalizeSellerName(fromText);
  const fromAtcAria = fullText.match(/from seller\s+(.+?)\s+and\s+price/i)?.[1];
  if (fromAtcAria) return normalizeSellerName(fromAtcAria);
  const shipperSeller = fullText.match(/shipper\s*\/\s*seller\s+(.+?)(?:\s+condition|\s+quantity|\s+delivery|\s+\$|$)/i)?.[1];
  return shipperSeller ? normalizeSellerName(shipperSeller) : 'Third-party Seller';
};

const extractPrimaryAmazonPrice = ($: cheerio.CheerioAPI): { value: number; source: string } | null => {
  const prioritizedSelectors: Array<{ source: string; selector: string; score: number }> = [
    { source: 'priceToPay', selector: '#corePrice_feature_div .priceToPay .a-offscreen', score: 100 },
    { source: 'apexPriceToPay', selector: '#corePrice_feature_div .apexPriceToPay .a-offscreen', score: 95 },
    { source: 'desktopPriceToPay', selector: '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen', score: 95 },
    { source: 'priceblockDealprice', selector: '#priceblock_dealprice', score: 90 },
    { source: 'priceblockOurprice', selector: '#priceblock_ourprice', score: 88 },
    { source: 'priceInsideBuybox', selector: '#price_inside_buybox', score: 86 },
    { source: 'dealprice', selector: '#dealprice_feature_div .a-offscreen', score: 84 },
  ];

  const candidates: Array<{ value: number; source: string; score: number }> = [];

  for (const entry of prioritizedSelectors) {
    const elements = $(entry.selector).toArray();
    for (const el of elements) {
      if (isInstallmentPriceContext($, el)) continue;
      const text = normalizeText($(el).text());
      const contextText = normalizeText($(el).parent().text());
      if (isNonPrimaryPriceContext(contextText)) continue;
      const parsed = parsePrice(text);
      if (parsed > 0) {
        candidates.push({ value: parsed, source: entry.source, score: entry.score });
      }
    }
  }

  const buyboxVisibleNodes = $('#corePrice_feature_div .a-price:not(.a-text-price):not(.basisPrice) .a-offscreen').toArray();
  for (const el of buyboxVisibleNodes) {
    if (isInstallmentPriceContext($, el)) continue;
    const localContext = normalizeText($(el).closest('.a-price').text());
    if (isNonPrimaryPriceContext(localContext)) continue;
    const parsedBuyboxVisible = parsePrice(normalizeText($(el).text()));
    if (parsedBuyboxVisible > 0) {
      candidates.push({ value: parsedBuyboxVisible, source: 'buyboxVisibleAOffscreen', score: 80 });
    }
  }

  const whole = $('#corePrice_feature_div .a-price-whole').first().text().replace(/[.,]/g, '').trim();
  const fraction = $('#corePrice_feature_div .a-price-fraction').first().text().trim();
  if (whole) {
    const reconstructed = parsePrice(`${whole}.${fraction || '00'}`);
    if (reconstructed > 0) {
      candidates.push({ value: reconstructed, source: 'wholeFractionReconstructed', score: 72 });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;

  return { value: best.value, source: best.source };
};

const extractBuyNowPrice = ($: cheerio.CheerioAPI): number | undefined => {
  const buyNowBlocks = [
    '#buybox',
    '#desktop_buybox',
    '#apex_desktop',
    '#apex_offerDisplay_desktop',
    '#exports_desktop_qualifiedBuybox_buybox',
    '#mir-layout-DELIVERY_BLOCK',
    '#buyNow',
    '#addToCart',
  ];

  for (const blockSelector of buyNowBlocks) {
    const block = $(blockSelector);
    if (block.length === 0) continue;

    const nodes = block.find('.priceToPay .a-offscreen, .apexPriceToPay .a-offscreen, .a-price .a-offscreen, #price_inside_buybox').toArray();
    for (const el of nodes) {
      if (isInstallmentPriceContext($, el)) continue;
      const contextText = normalizeText($(el).closest('.a-price, .a-section, .a-row').text());
      if (isNonPrimaryPriceContext(contextText)) continue;
      const parsed = parsePrice(normalizeText($(el).text()));
      if (parsed > 0) return parsed;
    }

    const whole = block.find('.a-price-whole').first().text().replace(/[.,]/g, '').trim();
    const fraction = block.find('.a-price-fraction').first().text().trim();
    if (whole) {
      const reconstructed = parsePrice(`${whole}.${fraction || '00'}`);
      if (reconstructed > 0) return reconstructed;
    }

    const dataStateNodes = block.find('[data-a-state], [data-a-modal]').toArray();
    for (const el of dataStateNodes) {
      const rawState = (($(el).attr('data-a-state') || $(el).attr('data-a-modal') || '') as string).replace(/&quot;/g, '"');
      if (!rawState) continue;
      const parsed = parsePrice(rawState);
      if (parsed > 0) return parsed;
      const quotedPrice = rawState.match(/"(?:price|priceToPay|displayPrice|buyNowPrice|amount|value)"\s*:\s*"([^"]+)"/i)?.[1];
      if (quotedPrice) {
        const parsedQuoted = parsePrice(quotedPrice);
        if (parsedQuoted > 0) return parsedQuoted;
      }
      const numericPrice = rawState.match(/"(?:price|amount|value)"\s*:\s*([\d.,]+)/i)?.[1];
      if (numericPrice) {
        const parsedNumeric = parsePrice(numericPrice);
        if (parsedNumeric > 0) return parsedNumeric;
      }
    }
  }

  const scriptNodes = $('script').toArray();
  for (const scriptEl of scriptNodes) {
    const rawScript = ($(scriptEl).html() || '').replace(/&quot;/g, '"');
    if (!rawScript) continue;
    const lowered = rawScript.toLowerCase();
    if (!/(buybox|buy now|buyNow|priceToPay|displayPrice|price_inside_buybox|one-time purchase)/i.test(lowered)) {
      continue;
    }

    const quotedCandidates = rawScript.match(/"(?:price|priceToPay|displayPrice|buyNowPrice|ourPrice|currentPrice|amount|value)"\s*:\s*"([^"]+)"/gi) || [];
    for (const match of quotedCandidates) {
      const quoted = match.match(/:\s*"([^"]+)"/)?.[1];
      if (!quoted) continue;
      const parsed = parsePrice(quoted);
      if (parsed > 0) return parsed;
    }

    const rawCandidates = rawScript.match(/"(?:price|priceToPay|displayPrice|buyNowPrice|ourPrice|currentPrice|amount|value)"\s*:\s*([\d.,]+)/gi) || [];
    for (const match of rawCandidates) {
      const raw = match.match(/:\s*([\d.,]+)/)?.[1];
      if (!raw) continue;
      const parsed = parsePrice(raw);
      if (parsed > 0) return parsed;
    }
  }

  const buyNowText = normalizeText($('#buybox').text() || $('#desktop_buybox').text() || $('#apex_desktop').text());
  if (/buy now|one-time purchase/i.test(buyNowText)) {
    const parsed = parsePrice(buyNowText);
    if (parsed > 0) return parsed;
  }

  return undefined;
};

export const amazonExtractor = async (context: ExtractorContext): Promise<ExtractorResult> => {
  const { $, url } = context;
  const metrics: Partial<ProductMetrics> = {};
  
  // ─── Pre-check for bots / CAPTCHA ───
  const isCaptcha = $('form[action="/errors/validateCaptcha"]').length > 0;
  if (isCaptcha) {
    return { success: false, metrics: {}, error: 'Amazon CAPTCHA triggered. Scraper was blocked.' };
  }

  // ─── 1. Title ───
  const title = extractProductTitle($);
  if (title === 'Unknown Product' && !$('#dp-container').length) {
    return { success: false, metrics: {}, error: 'Could not find product title or container. Page might be restricted.' };
  }
  
  // ─── 2. ASIN ───
  const asin = extractAsin(url);
  if (asin) metrics.asin = asin;

  // ─── 3. Currency — URL override first, then page text, then domain fallback ───
  const urlCurrency = detectCurrencyFromUrlParam(url);
  const domainCurrency = detectCurrencyFromDomain(url);
  const symbolText = [
    $('.a-price-symbol').first().text(),
    $('#corePrice_feature_div .a-offscreen').first().text(),
    $('#priceblock_ourprice, #priceblock_dealprice, #price_inside_buybox').first().text(),
    $('meta[property="product:price:currency"]').attr('content') || '',
  ].join(' ');
  const pageCurrency = detectCurrencyFromText(symbolText);
  metrics.currency = pageCurrency || urlCurrency || domainCurrency || 'USD';

  // ─── 4. Base Price ───
  const structuredPrice = extractStructuredPrice($);
  const extractedPrice = extractPrimaryAmazonPrice($);
  const buyNowPrice = extractBuyNowPrice($);
  let resolvedPrice = extractedPrice?.value || 0;

  // Guardrail: if DOM candidate is far away from structured data, prefer structured source.
  if (resolvedPrice > 0 && structuredPrice && Math.abs(resolvedPrice - structuredPrice) / structuredPrice > 0.25) {
    resolvedPrice = structuredPrice;
  }
  if (resolvedPrice <= 0 && structuredPrice) {
    resolvedPrice = structuredPrice;
  }
  if (resolvedPrice <= 0 && buyNowPrice && buyNowPrice > 0) {
    resolvedPrice = buyNowPrice;
  }
  if (resolvedPrice <= 0) {
    const boundedFallbackSelectors = [
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '#price .a-offscreen',
      '#price_feature_div .a-offscreen',
    ];
    for (const selector of boundedFallbackSelectors) {
      const nodes = $(selector).toArray();
      for (const el of nodes) {
        if (isInstallmentPriceContext($, el)) continue;
        const contextText = normalizeText($(el).parent().text());
        if (isNonPrimaryPriceContext(contextText)) continue;
        const parsed = parsePrice(normalizeText($(el).text()));
        if (parsed > 0) {
          resolvedPrice = parsed;
          break;
        }
      }
      if (resolvedPrice > 0) break;
    }
  }

  metrics.price = resolvedPrice > 0 ? resolvedPrice : undefined;
  metrics.itemPrice = metrics.price;

  const landedPricing = extractLandedPricing($);
  if (landedPricing.shippingAndImportCharges) {
    metrics.shippingAndImportCharges = landedPricing.shippingAndImportCharges;
  }
  if (landedPricing.estimatedShipping) {
    metrics.estimatedShipping = landedPricing.estimatedShipping;
  }
  if (landedPricing.estimatedImportFees) {
    metrics.estimatedImportFees = landedPricing.estimatedImportFees;
  }
  if (landedPricing.estimatedTax) {
    metrics.estimatedTax = landedPricing.estimatedTax;
  }

  if (metrics.itemPrice && metrics.itemPrice > 0) {
    if (landedPricing.totalPrice && landedPricing.totalPrice >= metrics.itemPrice) {
      metrics.landedPrice = landedPricing.totalPrice;
    } else {
      const shippingLike = landedPricing.shippingAndImportCharges
        ? landedPricing.shippingAndImportCharges
        : (landedPricing.estimatedShipping || 0) + (landedPricing.estimatedImportFees || 0);
      const taxLike = landedPricing.estimatedTax || 0;
      const extra = shippingLike + taxLike;
      if (extra > 0) {
        metrics.landedPrice = parseFloat((metrics.itemPrice + extra).toFixed(2));
      }
    }
  }

  // ─── 5. Original Price & Discount ───
  const originalPriceText = $('.a-text-price span.a-offscreen').first().text().trim() 
                          || $('.basisPrice span.a-offscreen').first().text().trim()
                          || $('.a-text-strike').first().text().trim();
  if (originalPriceText) {
    const pOriginal = parsePrice(originalPriceText);
    // Strict Price Validation
    if (metrics.price && pOriginal > metrics.price) {
      metrics.originalPrice = pOriginal;
      metrics.discountPercentage = Math.round(((metrics.originalPrice - metrics.price) / metrics.originalPrice) * 100);
      if (metrics.discountPercentage > 85 && structuredPrice && structuredPrice > metrics.price) {
        metrics.price = structuredPrice;
        metrics.itemPrice = structuredPrice;
        metrics.discountPercentage = Math.round(((metrics.originalPrice - metrics.price) / metrics.originalPrice) * 100);
      }
    }
  }

  // ─── 6. Rating and Reviews ───
  const ratingText = $('#acrPopover').attr('title') || $('.a-icon-star span.a-icon-alt').first().text();
  if (ratingText) {
    const match = ratingText.match(/([\d.]+)\s*out of/);
    if (match) metrics.averageRating = parseFloat(match[1]);
  }
  const reviewsText = $('#acrCustomerReviewText').first().text().trim();
  if (reviewsText) {
    metrics.reviewsCount = parseInt(reviewsText.replace(/[^\d]/g, ''), 10);
  }

  // ─── 7. Stock / Availability ───
  const availabilityClean = normalizeText(
    $('#availability span').first().text()
    || $('#availability').first().text()
    || ''
  );
  metrics.availability = availabilityClean;
  const stockCount = parseStockCount(availabilityClean);
  const quantityFromOptions = extractMaxQuantityFromOptions($);
  const quantityFromDropdownItems = extractMaxQuantityFromDropdownItems($, $.root());
  const quantityFromText = extractQuantityFromText(
    `${availabilityClean} ${normalizeText($('#quantity_feature_div, #quantity, #selectQuantity, #aod-qty-dropdown, #aod-offer-availability').text())}`
  );
  // Playwright may have injected the max quantity from the custom dropdown widget
  const playwrightQtyStr = $('meta[name="playwright-max-qty"]').attr('content') || '';
  const playwrightQty = playwrightQtyStr ? parseInt(playwrightQtyStr, 10) : null;
  const resolvedStockCount = coalesceStockCount(stockCount, quantityFromOptions, quantityFromDropdownItems, quantityFromText, Number.isFinite(playwrightQty) ? playwrightQty : null);
  if (resolvedStockCount !== null) {
      metrics.stockCount = resolvedStockCount;
  }

  // ─── 8. Badges ───
  metrics.isAmazonChoice = $('#acBadge_feature_div').length > 0 && 
                            $('#acBadge_feature_div').text().toLowerCase().includes("amazon's choice");
  metrics.isBestSeller = $('[data-feature-name="bestSellerBadge"]').length > 0 || 
                          $('.badge-label').text().toLowerCase().includes('best seller');

  // ─── 9. Q&A Count ───
  const qaText = $('#askATFLink span').first().text().trim();
  if (qaText) {
    const qaNum = parseInt(qaText.replace(/[^\d]/g, ''), 10);
    if (!isNaN(qaNum)) metrics.qaCount = qaNum;
  }

  // ─── 10. Return Policy ───
  const returnPolicyText = $('#productSupportAndReturnPolicy_feature_div').text().replace(/\s+/g, ' ').trim()
                        || $('#returnPolicyFeature_feature_div').text().replace(/\s+/g, ' ').trim();
  if (returnPolicyText) metrics.returnPolicy = returnPolicyText;

  // ─── 11. Coupon ───
  const couponEl = $('#promoPriceBlockMessage_feature_div').text().replace(/\s+/g, ' ').trim()
                || $('#couponBadge').text().replace(/\s+/g, ' ').trim();
  if (couponEl) {
    metrics.couponText = couponEl;
    const pctMatch = couponEl.match(/Save\s+([\d.]+)%\s+with/i) || couponEl.match(/([\d.]+)%\s*coupon/i);
    const amtMatch = couponEl.match(/Save\s+[$€£]\s?([\d.]+)\s+with/i) || couponEl.match(/[$€£]\s?([\d.]+)\s*coupon/i);
    if (pctMatch) {
      metrics.couponDiscountPercentage = parseFloat(pctMatch[1]);
    } else if (amtMatch) {
      metrics.couponDiscountAmount = parseFloat(amtMatch[1]);
    }
  }

  // ─── 12. Subscribe & Save ───
  const snsText = $('#snsPrice .a-offscreen').first().text().trim()
               || $('#snsPriceBlock .a-offscreen').first().text().trim();
  if (snsText) metrics.subscribeAndSavePrice = parsePrice(snsText);

  const snsPctText = $('#subscriptionPercent').text().trim() 
                  || $('.snsOffPercentage').text().trim();
  if (snsPctText) {
    const pctMatch = snsPctText.match(/(\d+)\s*%/);
    if (pctMatch) metrics.subscribeAndSavePercent = parseInt(pctMatch[1], 10);
  }

  // ─── 13. Delivery Info ───
  metrics.deliveryInfo = extractDeliveryInfo($);

  // ─── 14. Product Detail Fields (dimensions, weight, etc. — KEPT, technicalDetails removed) ───
  const detailRows: Record<string, string> = {};

  // Parse Product Information table
  $('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, .prodDetTable tr').each((_, tr) => {
    const label = $(tr).find('th').text().replace(/\s+/g, ' ').trim();
    const value = $(tr).find('td').text().replace(/\s+/g, ' ').trim();
    if (label && value) detailRows[label.toLowerCase()] = value;
  });

  // Parse Detail Bullets format
  $('#detailBullets_feature_div .a-list-item').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const parts = text.split(/\s*:\s*/);
    if (parts.length >= 2) {
      const label = parts[0].replace(/[^\w\s]/g, '').trim().toLowerCase();
      const value = parts.slice(1).join(':').trim();
      if (label && value) detailRows[label] = value;
    }
  });

  for (const [key, value] of Object.entries(detailRows)) {
    if (key.includes('model number') || key.includes('item model')) metrics.modelNumber = value;
    if (key.includes('date first available') || key.includes('date first listed')) metrics.dateFirstAvailable = value;
    if (key.includes('manufacturer')) metrics.manufacturer = value;
    if (key.includes('country of origin')) metrics.countryOfOrigin = value;
    if (key.includes('warranty')) metrics.warranty = value;
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── LISTING DATA (Keepa-like) ───
  // ═══════════════════════════════════════════════════════════════

  // ─── 15. Prime Status ───
  metrics.isPrime = $('#prime_feature_div').length > 0 
                 || $('.prime-logo').length > 0 
                 || $('#offer-prime-badge').length > 0
                 || $('[data-feature-name="primeShippingFeature"]').length > 0;

  metrics.salesVolume = extractSalesVolume($);
  metrics.isClimateFriendly = extractClimateFriendly($);

  // ─── 16. Variations (Color, Size, Style) ───
  const variations: Variation[] = [];
  
  // Twister-based variations
  $('#twister_feature_div [data-a-type="variation"]').each((_, section) => {
    const label = $(section).find('.a-form-label').text().replace(/[:\s]+/g, ' ').trim() || 'Style';
    
    $(section).find('li[id]').each((_, li) => {
      const liEl = $(li);
      const variantAsin = liEl.attr('data-defaultasin') || liEl.attr('data-asin') || '';
      const variantValue = liEl.find('.twisterTextDiv p').text().trim() 
                        || liEl.attr('title')?.replace('Click to select ', '') || '';
      const isAvailable = !liEl.hasClass('swatchUnavailable');
      
      // Try to get price from data attribute
      let variantPrice: number | undefined;
      const priceAttr = liEl.attr('data-a-html-options');
      if (priceAttr) {
        try {
          const parsed = JSON.parse(priceAttr);
          if (parsed?.price) variantPrice = parsePrice(parsed.price);
        } catch { /* ignore */ }
      }

      if (variantValue || variantAsin) {
        variations.push({
          asin: variantAsin,
          attribute: label,
          value: variantValue || variantAsin,
          price: variantPrice,
          available: isAvailable,
        });
      }
    });
  });

  // Fallback: if twister didn't have [data-a-type], try specific variation divs
  if (variations.length === 0) {
    ['color_name', 'size_name', 'style_name'].forEach(attrKey => {
      $(`#variation_${attrKey} li`).each((_, li) => {
        const liEl = $(li);
        const variantAsin = liEl.attr('data-defaultasin') || liEl.attr('data-asin') || '';
        const variantValue = liEl.find('img').attr('alt') 
                          || liEl.find('.a-button-text').text().trim()
                          || liEl.attr('title')?.replace('Click to select ', '') || '';
        const isAvailable = !liEl.hasClass('swatchUnavailable');

        if (variantValue) {
          variations.push({
            asin: variantAsin,
            attribute: attrKey.replace('_name', '').replace('_', ' '),
            value: variantValue,
            available: isAvailable,
          });
        }
      });
    });
  }

  if (variations.length > 0) metrics.variations = variations;

  // ─── 17. A+ Content ───
  const aplusText = $('#aplus_feature_div .aplus-module-wrapper').text().replace(/\s+/g, ' ').trim()
                 || $('#aplus3p_feature_div').text().replace(/\s+/g, ' ').trim();
  if (aplusText && aplusText.length > 50) {
    metrics.aPlusContent = aplusText.slice(0, 2000);
  }

  // ─── 18. Video Count ───
  const videoElements = $('video, .a-video-container, .vjs-tech, [data-video-url]');
  if (videoElements.length > 0) {
    metrics.videoCount = videoElements.length;
  }

  // ─── 19. Frequently Bought Together ───
  const fbt: RelatedProduct[] = [];
  
  $('#fbt_feature_div [data-p13n-asin-metadata]').each((_, el) => {
    try {
      const meta = JSON.parse($(el).attr('data-p13n-asin-metadata') || '{}');
      if (meta.asin) {
        fbt.push({
          asin: meta.asin,
          title: $(el).find('.p13n-sc-truncate').text().trim() || meta.title || '',
          price: meta.price ? parsePrice(meta.price) : undefined,
        });
      }
    } catch { /* ignore */ }
  });

  // Fallback selectors
  if (fbt.length === 0) {
    $('#frequently-bought-together-asin_list input[name="asin"]').each((_, el) => {
      const fbtAsin = $(el).attr('value');
      if (fbtAsin) fbt.push({ asin: fbtAsin, title: '' });
    });
  }

  if (fbt.length > 0) metrics.frequentlyBoughtTogether = fbt;

  // ─── 20. Customers Also Viewed ───
  const cayv: RelatedProduct[] = [];
  
  $('.p13n-sc-uncoverable-faceout, #anonCarousel1 .a-carousel-card, [data-a-carousel-options*="similar"] .a-carousel-card').each((_, card) => {
    const link = $(card).find('a[href*="/dp/"]').first();
    const href = link.attr('href') || '';
    const cayvAsin = extractAsin(href.startsWith('/') ? `https://www.amazon.com${href}` : href);
    const imgAlt = $(card).find('img').attr('alt')?.trim();
    const textSpan = $(card).find('[class*="p13n-sc-line-clamp"], [class*="p13n-sc-truncate"]').text().replace(/\s+/g, ' ').trim();
    const cayvTitle = link.attr('title')?.trim() || imgAlt || textSpan || '';
    const cayvPrice = parsePrice($(card).find('.a-color-price, ._cDEzb_p13n-sc-price_3mJ9Z').text().trim());

    if (cayvAsin) {
      cayv.push({
        asin: cayvAsin,
        title: cayvTitle,
        price: cayvPrice > 0 ? cayvPrice : undefined,
      });
    }
  });

  if (cayv.length > 0) metrics.customersAlsoViewed = cayv.slice(0, 20);

  // ═══════════════════════════════════════════════════════════════
  // ─── MARKET SNAPSHOT (Keepa-like) ───
  // ═══════════════════════════════════════════════════════════════

  // ─── 21. BSR — All Categories ───
  const bsrCategories: BsrCategory[] = [];
  
  // Method 1: #SalesRank or #productDetails BSR rows — parse text with regex
  const bsrHtml = $('#SalesRank').html() || $('th:contains("Best Sellers Rank")').next('td').html() || '';
  if (bsrHtml) {
    // Strip HTML tags and parse "#rank in category" patterns
    const fullText = bsrHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const rankMatches = [...fullText.matchAll(/#([\d,]+)\s+in\s+([^(#]+)/g)];
    
    for (const m of rankMatches) {
      const rank = parseInt(m[1].replace(/,/g, ''), 10);
      const category = m[2].trim().replace(/\s*$/, '');
      if (rank > 0 && category) {
        bsrCategories.push({ rank, category });
      }
    }
  }

  // Fallback: detailBullets style
  if (bsrCategories.length === 0) {
    $('#detailBulletsWrapper_feature_div span:contains("Best Sellers Rank")').parent().find('a[href*="/zgbs/"]').each((_, a) => {
      const categoryText = $(a).text().trim();
      const fullContainerText = $(a).parent().text();
      const rankMatch = fullContainerText.match(/#([\d,]+)/);
      if (rankMatch && categoryText) {
        bsrCategories.push({
          rank: parseInt(rankMatch[1].replace(/,/g, ''), 10),
          category: categoryText,
          categoryUrl: $(a).attr('href') || undefined,
        });
      }
    });
  }

  if (bsrCategories.length > 0) metrics.bsrCategories = bsrCategories;

  // Legacy bestSellerRank text
  const bsrText = $('#SalesRank').text().trim() 
               || $('th:contains("Best Sellers Rank")').next('td').text().trim();
  if (bsrText) {
    metrics.bestSellerRank = bsrText.replace(/Best Sellers Rank/i, '').replace(/\s+/g, ' ').trim();
  }

  // ─── 22. Buy Box Info ───
  let buyBoxSeller = '';

  // 22a. Tabular buybox "Shipper / Seller" (Buy Now section) — highest priority on modern layouts
  if (!buyBoxSeller) {
    buyBoxSeller = extractTabularAttributeValue($, 'Shipper / Seller', BUYBOX_TABULAR_SCOPE_SELECTORS);
  }
  if (!buyBoxSeller) {
    buyBoxSeller = extractSellerFromTabularText(
      $('#tabular-buybox, #tabular-buybox-container, #exports_desktop_qualifiedBuybox_feature_div, #desktop_buybox, #buybox').text()
    );
  }

  // 22b. Tabular buybox "Sold by"
  if (!buyBoxSeller) {
    buyBoxSeller = extractTabularAttributeValue($, 'Sold by', BUYBOX_TABULAR_SCOPE_SELECTORS);
  }

  // 22c. #sellerProfileTriggerId — prefer inner <a> to avoid hidden/aria span duplication
  if (!buyBoxSeller) {
    const sellerTrigger = $('#sellerProfileTriggerId');
    if (sellerTrigger.length) {
      const innerLink = sellerTrigger.find('a').first().text().trim();
      buyBoxSeller = innerLink || sellerTrigger.text().trim();
    }
  }

  // 22d. #merchant-info — explicit link or "sold by" text
  if (!buyBoxSeller) buyBoxSeller = $('#merchant-info a').first().text().trim();
  if (!buyBoxSeller) {
    const merchantText = normalizeText($('#merchant-info').text());
    const soldByMatch = merchantText.match(/sold by\s+(.+?)(?:\s+and\s+fulfilled by|\s+and\s+ships from|$)/i);
    if (soldByMatch?.[1]) buyBoxSeller = normalizeText(soldByMatch[1]);
  }

  // 22d. Tabular buybox fallback — <a> tags containing seller/merchant in href
  if (!buyBoxSeller) {
    const tbSellerLink = $('#tabular-buybox .tabular-buybox-text a[href*="seller"], #tabular-buybox .tabular-buybox-text a[href*="merchant"], #tabular-buybox-container a[href*="seller"], #tabular-buybox-container a[href*="merchant"]').first().text().trim();
    if (tbSellerLink) buyBoxSeller = normalizeText(tbSellerLink);
  }

  // 22e. Tabular buybox — find pairs of label + value cells
  if (!buyBoxSeller) {
    const cells = $('#tabular-buybox .tabular-buybox-text, #tabular-buybox-container .tabular-buybox-text').toArray();
    for (let i = 0; i < cells.length - 1; i++) {
      const cellText = $(cells[i]).text().trim().toLowerCase();
      if (cellText.includes('sold by') || cellText.includes('shipper') || cellText.includes('seller')) {
        const valueEl = $(cells[i + 1]);
        const linkText = valueEl.find('a').first().text().trim();
        buyBoxSeller = linkText || normalizeText(valueEl.text());
        if (buyBoxSeller) break;
      }
    }
  }

  // 22f. Desktop offer display feature (some Amazon layouts)
  if (!buyBoxSeller) {
    const offerText = normalizeText($('#desktop_buybox .offer-display-feature-text-message').text());
    const offerMatch = offerText.match(/sold by\s+(.+?)(?:\s+and\s+|$)/i);
    if (offerMatch?.[1]) buyBoxSeller = normalizeText(offerMatch[1]);
  }

  // 22g. Right column seller links
  if (!buyBoxSeller) {
    buyBoxSeller = $('#rightCol a[href*="seller="]').first().text().trim()
      || $('#buyBoxAccordion a[href*="seller="]').first().text().trim();
  }

  buyBoxSeller = normalizeSellerName(buyBoxSeller);
  
  const merchantInfo = $('#merchant-info').text().trim().toLowerCase();
  // Check tabular buybox text for Amazon markers when #merchant-info is empty
  const tabularText = normalizeText($('#tabular-buybox, #tabular-buybox-container').text()).toLowerCase();
  const isAmazonTabular = tabularText.includes('amazon.com') || tabularText.includes('ships from and sold by amazon');
  const isFBATabular = isAmazonTabular || tabularText.includes('fulfilled by amazon');
  const isAmazon = merchantInfo.includes('amazon.com') || merchantInfo.includes('ships from and sold by amazon') || isAmazonTabular;
  const isFBA = isAmazon || merchantInfo.includes('fulfilled by amazon') || merchantInfo.includes('fulfillment by amazon') || isFBATabular;

  if (!buyBoxSeller && (isAmazon || isAmazonTabular)) buyBoxSeller = 'Amazon.com';
  if (!buyBoxSeller) buyBoxSeller = 'Unknown Seller';

  // Seller rating
  let sellerRatingPercent: number | undefined;
  let sellerRatingsCount: number | undefined;
  const sellerRatingEl = $('#sellerProfileTriggerId').parent().text();
  if (sellerRatingEl) {
    const pctMatch = sellerRatingEl.match(/(\d+)%/);
    if (pctMatch) sellerRatingPercent = parseInt(pctMatch[1], 10);
    const countMatch = sellerRatingEl.match(/([\d,]+)\s+rating/i);
    if (countMatch) sellerRatingsCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
  }

  let shipsFrom: string | undefined;
  
  // Attempt to parse tabular buybox for accurate ships from
  // Primary: attribute-based selector
  const shipsFromTabular = extractTabularAttributeValue($, 'Ships from', BUYBOX_TABULAR_SCOPE_SELECTORS);
  if (shipsFromTabular) shipsFrom = deduplicateSellerName(shipsFromTabular);
  
  // Fallback: cell iteration
  if (!shipsFrom) {
    const tabularBuyboxDiv = $('#tabular-buybox .tabular-buybox-text, #tabular-buybox-container .tabular-buybox-text').toArray();
    for (let i = 0; i < tabularBuyboxDiv.length - 1; i++) {
       const text = $(tabularBuyboxDiv[i]).text().trim().toLowerCase();
       if (text.includes('ships from')) {
          const nextEl = $(tabularBuyboxDiv[i + 1]);
          const linkText = nextEl.find('a').first().text().trim();
          shipsFrom = deduplicateSellerName(linkText || normalizeText(nextEl.text()));
          break;
       }
    }
  }

  if (!shipsFrom) {
     const match = $('#merchant-info').text().replace(/\s+/g, ' ').match(/Ships from\s+([\w\s.]+?)(?:\s+Sold by|$)/i);
     if (match) shipsFrom = match[1].trim();
  }
  if (!shipsFrom && isFBA) shipsFrom = 'Amazon';

  if (metrics.price && metrics.price > 0) {
    metrics.buyBox = {
      sellerName: buyBoxSeller,
      price: metrics.price,
      isFBA,
      isAmazon,
      sellerRatingPercent,
      sellerRatingsCount,
      shipsFrom,
    };
    metrics.selectedOffer = {
      source: 'buybox',
      sellerName: buyBoxSeller,
      price: metrics.price,
      currency: metrics.currency,
      condition: 'New',
      isFBA,
      isAmazon,
    };
  }

  // ─── 23. Offer Counts (New / Used / Collectible) ───
  const olpNewText = $('#olp-upd-new a, #olp-upd-new-used a').first().text().trim();
  const olpUsedText = $('#olp-upd-used a').first().text().trim();
  const olpCollText = $('#olp-upd-coll a').first().text().trim();

  const parseOfferCount = (text: string): number | undefined => {
    const m = text.match(/(\d+)\s+(?:new|used|collectible)/i);
    return m ? parseInt(m[1], 10) : undefined;
  };

  const newCount = parseOfferCount(olpNewText);
  const usedCount = parseOfferCount(olpUsedText); 
  const collCount = parseOfferCount(olpCollText);

  if (newCount !== undefined) metrics.newOffersCount = newCount;
  if (usedCount !== undefined) metrics.usedOffersCount = usedCount;
  if (collCount !== undefined) metrics.collectibleOffersCount = collCount;

  // ─── 24. Lightning Deal ───
  const dealBadge = $('#dealBadgeSupportingText').text().trim() || $('#deal-badge').text().trim();
  if (dealBadge) {
    const dealPriceText = $('#dealprice_feature_div .a-offscreen').first().text().trim();
    const claimedText = $('#deal-expiry-timer, .a-meter-bar').attr('style') || '';
    const claimedMatch = claimedText.match(/width:\s*([\d.]+)%/);

    const ld: LightningDeal = {
      dealPrice: dealPriceText ? parsePrice(dealPriceText) : metrics.price || 0,
      originalPrice: metrics.originalPrice || metrics.price || 0,
      claimedPercent: claimedMatch ? parseFloat(claimedMatch[1]) : 0,
    };

    const timerText = $('#deal-expiry-timer').text().trim();
    if (timerText) ld.endsAt = timerText;

    metrics.lightningDeal = ld;
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── OFFERS / SELLERS ───
  // ═══════════════════════════════════════════════════════════════

  // ─── 25. Build offers list ───
  metrics.offers = [];
  const seenOfferKeys = new Set<string>();
  const makeOfferDedupKey = (offer: Offer): string => {
    const sellerName = normalizeSellerName(offer.sellerName || '');
    const priceKey = Number(offer.price || 0).toFixed(2);
    const offerId = normalizeText(offer.offerId || '').toLowerCase();
    const stableOfferId = isStableOfferId(offerId) ? offerId : '';
    const sellerId = extractSellerIdFromOfferUrl(offer.offerUrl);
    const offerUrl = normalizeText(offer.offerUrl || '').toLowerCase();
    if (sellerId) {
      return ['seller-id', sellerId, priceKey, normalizeText(offer.condition || '').toLowerCase()].join('|');
    }
    if (isGenericSellerName(sellerName)) {
      if (stableOfferId) {
        return ['generic-id', stableOfferId, priceKey].join('|');
      }
      const condition = normalizeText(offer.condition || '');
      const delivery = normalizeText(offer.deliveryInfo || '');
      const stock = normalizeText(offer.stockStatus || '');
      const stockCount = typeof offer.stockCount === 'number' ? String(offer.stockCount) : 'null';
      return ['generic', priceKey, condition, delivery, stock, stockCount, offerUrl, offer.isFBA ? 'fba' : 'mfn'].join('|');
    }
    return ['named', sellerName.toLowerCase(), priceKey, stableOfferId, offerUrl].join('|');
  };
  const pushUniqueOffer = (candidate: Offer): void => {
    const normalizedCandidate: Offer = {
      ...candidate,
      sellerName: normalizeSellerName(candidate.sellerName || '') || 'Third-party Seller',
    };
    if (isInvalidOfferSellerName(normalizedCandidate.sellerName)) return;
    const dedupKey = makeOfferDedupKey(normalizedCandidate);
    if (seenOfferKeys.has(dedupKey)) return;
    seenOfferKeys.add(dedupKey);
    metrics.offers!.push(normalizedCandidate);
  };

  // Buy Box seller
  if (metrics.price! > 0) {
    pushUniqueOffer({
      sellerName: buyBoxSeller,
      price: metrics.price!,
      currency: metrics.currency!,
      stockStatus: availabilityClean || 'In Stock',
      stockCount: resolvedStockCount,
      condition: 'New',
      isFBA,
    });
  }

  // MBC Sidebar offers
  $('#mbc .a-box').each((_, el) => {
    const offerPriceText = $(el).find('.a-color-price').first().text().trim();
    const offerSellerText = $(el).find('.mbcMerchantName').text().trim() || $(el).find('a').first().text().trim();
    const offerCondition = $(el).find('.a-text-bold').first().text().trim() || 'New';
    const offerDelivery = $(el).find('.a-color-secondary').first().text().replace(/\s+/g, ' ').trim();
    const offerFba = $(el).text().toLowerCase().includes('fulfilled by amazon') || $(el).text().toLowerCase().includes('amazon.com');

    if (offerPriceText) {
      const offer: Offer = {
        sellerName: offerSellerText || 'Third-party Seller',
        price: parsePrice(offerPriceText),
        currency: metrics.currency!,
        stockStatus: 'In Stock',
        stockCount: null,
        condition: offerCondition,
        deliveryInfo: offerDelivery,
        isFBA: offerFba,
      };
      pushUniqueOffer(offer);
    }
  });

  // OLP offers
  $('#olp-upd-new .olpOffer, #olp-sl-new .olpOffer').each((_, el) => {
    const price = parsePrice($(el).find('.olpOfferPrice').text().trim());
    const seller = $(el).find('.olpSellerName').text().trim() || 'Third-party Seller';
    const condition = $(el).find('.olpCondition').text().trim() || 'New';
    const olpFba = $(el).text().toLowerCase().includes('fulfilled by amazon');

    if (price > 0) {
      pushUniqueOffer({ sellerName: seller, price, currency: metrics.currency!, stockStatus: 'In Stock', stockCount: null, condition, isFBA: olpFba });
    }
  });

  // Injected DOM AOD offers (captured from live Playwright page after opening panel/dropdowns)
  const injectedAodOffers = extractInjectedDomAodOffers($, metrics.currency!);
  for (const injectedOffer of injectedAodOffers) {
    pushUniqueOffer(injectedOffer);
  }

  // AOD / "Other sellers on Amazon" panel offers (when panel is rendered in current HTML)
  $('#aod-pinned-offer, #aod-offer-list > .aod-information-block, #aod-retail-other-offers-content > .aod-information-block, #aod-offer-list > #aod-offer, #aod-retail-other-offers-content > #aod-offer, #aod-offer, .aod-offer, .aod-offer-row, .aod-information-block, [id^="aod-offer-"], #all-offers-display .aod-offer').each((_, el) => {
    const offerRoot = $(el);
    if (!isLikelyAodOfferNode(offerRoot)) return;
    const hasPriceEl =
      offerRoot.find('#aod-offer-price, .aod-offer-price, .a-price .a-offscreen, .a-price, [id^="aod-price-"]').length > 0;
    if (!hasPriceEl) return;

    let priceText =
      offerRoot.find('.a-price .a-offscreen').first().text().trim() ||
      offerRoot.find('.aod-offer-price .a-offscreen').first().text().trim() ||
      offerRoot.find('[id^="aod-price-"] .a-offscreen').first().text().trim();
    if (!priceText) {
      const whole = offerRoot.find('.a-price-whole').first().text().replace(/[^\d]/g, '').trim();
      const fraction = offerRoot.find('.a-price-fraction').first().text().replace(/[^\d]/g, '').trim();
      if (whole) {
        priceText = `${whole}.${fraction || '00'}`;
      }
    }
    if (!priceText) {
      const fromText = normalizeText(offerRoot.text()).match(/(?:[$€£]|USD|EUR|GBP)\s?\d[\d,.]*/i)?.[0];
      if (fromText) priceText = fromText;
    }
    const price = parsePrice(priceText);
    if (price <= 0) return;

    const seller = normalizeSellerName(extractAodSellerName(offerRoot));
    const offerId = offerRoot.attr('id')?.trim()
      || offerRoot.attr('data-csa-c-item-id')?.trim()
      || offerRoot.attr('data-aod-atc-action')?.trim()
      || offerRoot.find('input[name*="offeringID"]').first().attr('value')?.trim()
      || offerRoot.find('input[name*="offerListingID"]').first().attr('value')?.trim();
    const offerHref = offerRoot.find('#aod-offer-soldBy a[href], .aod-offer-soldBy a[href], a[href*="seller="], a[href*="smid="]').first().attr('href')?.trim() || '';
    const offerUrl = offerHref
      ? offerHref.startsWith('http')
        ? offerHref
        : `${new URL(url).origin}${offerHref.startsWith('/') ? '' : '/'}${offerHref}`
      : undefined;
    const condition = offerRoot.find('#aod-offer-heading h5').text().trim()
      || offerRoot.find('.aod-offer-heading').text().trim()
      || 'New';
    const availabilityText = normalizeText(
      offerRoot.find('#aod-offer-availability').text()
      || offerRoot.find('.aod-offer-availability').text()
      || 'In Stock'
    );
    const qtyFromAvailability = parseStockCount(availabilityText);
    const qtyFromOptions = extractMaxQuantityFromOptions($, offerRoot);
    const qtyFromDropdownItems = extractMaxQuantityFromDropdownItems($, offerRoot);
    const qtyFromText = extractQuantityFromText(offerRoot.text());
    const stockCount = coalesceStockCount(qtyFromAvailability, qtyFromOptions, qtyFromDropdownItems, qtyFromText);
    const isFBA = /fulfilled by amazon|amazon\.com/i.test(offerRoot.text());

    pushUniqueOffer({
      offerId,
      offerUrl,
      sellerName: seller,
      price,
      currency: metrics.currency!,
      stockStatus: availabilityText || 'In Stock',
      stockCount,
      condition,
      isFBA,
    });
  });

  const remotePayloadOffers = extractRemoteAodPayloadOffers($, metrics.currency!, url);
  for (const payloadOffer of remotePayloadOffers) {
    pushUniqueOffer(payloadOffer);
  }

  // Other sellers on Amazon (AOD / offer listing endpoint)
  const hasOtherSellersSignal =
    $('#dynamic-aod-ingress-box, #dynamic-aod-ingress-box_feature_div, #aod-asin-count, #olp_feature_div, #olp-upd-new-used').length > 0 ||
    /other sellers on amazon|other buying options/i.test($('body').text());

  const shouldTryRemoteAod = /amazon\./i.test(url);
  const allowRemoteAodFetch = process.env.NODE_ENV !== 'test' && shouldTryRemoteAod;
  if (metrics.asin && allowRemoteAodFetch) {
    try {
      const remoteOffers = await fetchAmazonOffers(metrics.asin, metrics.currency!, url);
      for (const remoteOffer of remoteOffers) {
        pushUniqueOffer(remoteOffer);
      }
    } catch {
      // Ignore remote offers fetch failures and keep primary-page offers.
    }
  }

  metrics.sellerCount = metrics.offers!.length;

  // Prefer AOD-provided count ("New & Used (N) from ...") over inferred visible rows.
  const declaredSellerCount = extractAodSellerCount($);
  if (Number.isFinite(declaredSellerCount) && declaredSellerCount! > 0) {
    metrics.sellerCount = Math.max(metrics.offers!.length, declaredSellerCount);
  }

  // Average Offer Price
  if (metrics.offers!.length > 0) {
    const namedPriceKeys = new Set(
      metrics.offers!
        .filter((offer) => !isGenericSellerName(offer.sellerName))
        .map((offer) => Number(offer.price || 0).toFixed(2))
    );
    const targetOfferCount = Number(metrics.sellerCount || 0);
    const extractedOfferCount = metrics.offers!.length;
    // If Amazon reports many more offers than we can extract from DOM/session,
    // avoid aggressive generic cleanup to preserve partial visibility.
    const allowAggressiveGenericCleanup =
      targetOfferCount <= 0 || extractedOfferCount >= Math.max(8, Math.floor(targetOfferCount * 0.8));
    if (namedPriceKeys.size > 0 && allowAggressiveGenericCleanup) {
      metrics.offers = metrics.offers!.filter((offer) => {
        if (!isGenericSellerName(offer.sellerName)) return true;
        // Keep distinct AOD rows that have a stable offer identifier.
        if (isStableOfferId(offer.offerId)) return true;
        const priceKey = Number(offer.price || 0).toFixed(2);
        return !namedPriceKeys.has(priceKey);
      });
    }
    const seenAmazonOwnedKeys = new Set<string>();
    metrics.offers = metrics.offers!.filter((offer) => {
      if (!isAmazonOwnedSellerName(offer.sellerName)) return true;
      const sellerId = extractSellerIdFromOfferUrl(offer.offerUrl);
      const key = [
        sellerId || 'no-seller-id',
        Number(offer.price || 0).toFixed(2),
        normalizeText(offer.condition || '').toLowerCase(),
      ].join('|');
      if (seenAmazonOwnedKeys.has(key)) return false;
      seenAmazonOwnedKeys.add(key);
      return true;
    });

    if (/^(unknown seller|third-party seller)$/i.test(buyBoxSeller)) {
      const namedOffer = metrics.offers!.find((offer) => !/^(unknown seller|third-party seller)$/i.test(offer.sellerName));
      if (namedOffer) {
        buyBoxSeller = namedOffer.sellerName;
        if (metrics.buyBox) metrics.buyBox.sellerName = namedOffer.sellerName;
        if (metrics.selectedOffer?.source === 'buybox') metrics.selectedOffer.sellerName = namedOffer.sellerName;
      }
    }

    const currentPrice = Number(metrics.price || metrics.itemPrice || 0);
    if (currentPrice > 0) {
      const samePriceOffers = metrics.offers!.filter((offer) => Math.abs(Number(offer.price || 0) - currentPrice) <= 0.05);
      const amazonAtDisplayedPrice = samePriceOffers.find((offer) => isAmazonOwnedSellerName(offer.sellerName));
      if (amazonAtDisplayedPrice && !isAmazonOwnedSellerName(buyBoxSeller)) {
        buyBoxSeller = normalizeSellerName(amazonAtDisplayedPrice.sellerName);
        if (metrics.buyBox) {
          metrics.buyBox.sellerName = buyBoxSeller;
          metrics.buyBox.isAmazon = true;
          metrics.buyBox.isFBA = true;
        }
        if (metrics.selectedOffer?.source === 'buybox') {
          metrics.selectedOffer.sellerName = buyBoxSeller;
          metrics.selectedOffer.isAmazon = true;
          metrics.selectedOffer.isFBA = true;
        }
      }
    }

    const total = metrics.offers!.reduce((sum, o) => sum + o.price, 0);
    metrics.averageOfferPrice = parseFloat((total / metrics.offers!.length).toFixed(2));
    metrics.lowestOfferPrice = metrics.offers!.reduce((min, offer) => Math.min(min, offer.price), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(metrics.lowestOfferPrice)) {
      metrics.lowestOfferPrice = undefined;
    }
    if (!metrics.selectedOffer) {
      const chosenOffer = metrics.offers![0];
      metrics.selectedOffer = {
        source: 'offer',
        sellerName: chosenOffer.sellerName,
        price: chosenOffer.price,
        currency: chosenOffer.currency,
        condition: chosenOffer.condition,
        isFBA: chosenOffer.isFBA,
        isAmazon: chosenOffer.sellerName.toLowerCase().includes('amazon'),
      };
    }

  }

  // Guardrail: never report fewer sellers than the number of unique extracted offers.
  metrics.sellerCount = Math.max(Number(metrics.sellerCount || 0), metrics.offers!.length);

  // ═══════════════════════════════════════════════════════════════
  // ─── CONTENT ───
  // ═══════════════════════════════════════════════════════════════

  // ─── 26. Images ───
  metrics.imageUrl = $('#landingImage').attr('src') || $('#imgTagWrapperId img').attr('src') || '';
  
  const imageUrls: string[] = [];
  $('#altImages .a-spacing-small img, #imageBlock img').each((_, img) => {
    const src = $(img).attr('src') || '';
    if (src && !src.includes('sprite') && !src.includes('transparent-pixel') && src.includes('images/I/')) {
      const hiRes = src.replace(/\._[A-Z0-9_]+_\./, '.');
      if (!imageUrls.includes(hiRes)) imageUrls.push(hiRes);
    }
  });
  if (imageUrls.length > 0) metrics.imageUrls = imageUrls;

  // ─── 27. Description ───
  const descParts: string[] = [];
  const desc1 = $('#productDescription').text().replace(/\s+/g, ' ').trim();
  if (desc1) descParts.push(desc1);
  const desc2 = $('#feature-bullets').text().replace(/\s+/g, ' ').trim();
  if (desc2 && desc2.length > 50 && !desc1.includes(desc2.slice(0, 50))) descParts.push(desc2);
  metrics.description = descParts.join(' ').slice(0, 2000) || '';

  // ─── 28. Brand ───
  const brand = $('#bylineInfo').text().trim() || $('.po-brand .a-span9').text().trim() || '';
  if (brand) {
    metrics.brand = brand.replace(/^Brand:\s*/i, '').replace(/^Visit the\s*/i, '').replace(/\s*Store$/i, '').trim();
  }
  
  // ─── 29. Category ───
  const categoryBreadcrumbs = $('#wayfinding-breadcrumbs_feature_div .a-link-normal')
    .map((_: any, el: any) => $(el).text().trim()).get();
  metrics.category = categoryBreadcrumbs.join(' > ');
  
  // ─── 30. Features ───
  metrics.features = $('#feature-bullets ul li span.a-list-item')
    .map((_: any, el: any) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((f: any) => f.length > 0)
    .slice(0, 15);

  const amazonMetrics: AmazonMarketplaceMetrics = {
    asin: metrics.asin,
    buyBox: metrics.buyBox,
    bsrCategories: metrics.bsrCategories,
    bestSellerRank: metrics.bestSellerRank,
    isPrime: metrics.isPrime,
    isAmazonChoice: metrics.isAmazonChoice,
    isBestSeller: metrics.isBestSeller,
    isClimateFriendly: metrics.isClimateFriendly,
    sellerCount: metrics.sellerCount,
    offers: metrics.offers,
    newOffersCount: metrics.newOffersCount,
    usedOffersCount: metrics.usedOffersCount,
    collectibleOffersCount: metrics.collectibleOffersCount,
    lightningDeal: metrics.lightningDeal,
    subscribeAndSavePrice: metrics.subscribeAndSavePrice,
    subscribeAndSavePercent: metrics.subscribeAndSavePercent,
  };
  metrics.amazonMetrics = amazonMetrics;

  return { title, metrics, success: true };
};
