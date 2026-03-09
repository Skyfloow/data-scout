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
import { parsePrice, parseCurrency, parseStockCount, detectCurrencyFromDomain } from '../../../utils/parsers';
import { extractAsin } from './amazon-offers';
import * as cheerio from 'cheerio';

const normalizeText = (input: string): string => input.replace(/\s+/g, ' ').trim();

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

  // ─── 3. Currency — domain-based detection (primary) ───
  const domainCurrency = detectCurrencyFromDomain(url);
  const symbolText = $('.a-price-symbol').first().text().trim();
  metrics.currency = domainCurrency || parseCurrency(symbolText) || 'USD';

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
  const availabilityHtml = $('#availability span').html() || '';
  // Sanitization: Remove inner script/style tags if any bled through
  const availabilityClean = cheerio.load(availabilityHtml)('*').text()
    .replace(/\{.*\}/g, '') // remove inline objects
    .replace(/function\s*\(.*}/g, '') // remove functions
    .replace(/\s+/g, ' ').trim();
  metrics.availability = availabilityClean;
  const stockCount = parseStockCount(availabilityClean);
  if (stockCount !== null) {
      metrics.stockCount = stockCount;
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
  let buyBoxSeller = $('#sellerProfileTriggerId').text().trim();
  if (!buyBoxSeller) buyBoxSeller = $('#merchant-info a').first().text().trim();
  
  const merchantInfo = $('#merchant-info').text().trim().toLowerCase();
  const isAmazon = merchantInfo.includes('amazon.com') || merchantInfo.includes('ships from and sold by amazon');
  const isFBA = isAmazon || merchantInfo.includes('fulfilled by amazon') || merchantInfo.includes('fulfillment by amazon');

  if (!buyBoxSeller && isAmazon) buyBoxSeller = 'Amazon.com';
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
  const tabularBuyboxDiv = $('#tabular-buybox .tabular-buybox-text').toArray();
  for (let i = 0; i < tabularBuyboxDiv.length; i++) {
     const text = $(tabularBuyboxDiv[i]).text().trim().toLowerCase();
     if (text.includes('ships from')) {
        const nextSpan = $(tabularBuyboxDiv[i]).next('span, div').text() || $(tabularBuyboxDiv[i]).parent().next().text();
        if (nextSpan) {
           shipsFrom = normalizeText(nextSpan);
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

  // Buy Box seller
  if (metrics.price! > 0) {
    metrics.offers.push({
      sellerName: buyBoxSeller,
      price: metrics.price!,
      currency: metrics.currency!,
      stockStatus: availabilityClean || 'In Stock',
      stockCount: parseStockCount(availabilityClean),
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
      const isDuplicate = metrics.offers!.some(
        e => e.sellerName.toLowerCase() === offer.sellerName.toLowerCase() && Math.abs(e.price - offer.price) < 0.01
      );
      if (!isDuplicate) metrics.offers!.push(offer);
    }
  });

  // OLP offers
  $('#olp-upd-new .olpOffer, #olp-sl-new .olpOffer').each((_, el) => {
    const price = parsePrice($(el).find('.olpOfferPrice').text().trim());
    const seller = $(el).find('.olpSellerName').text().trim() || 'Third-party Seller';
    const condition = $(el).find('.olpCondition').text().trim() || 'New';
    const olpFba = $(el).text().toLowerCase().includes('fulfilled by amazon');

    if (price > 0) {
      const isDuplicate = metrics.offers!.some(
        e => e.sellerName.toLowerCase() === seller.toLowerCase() && Math.abs(e.price - price) < 0.01
      );
      if (!isDuplicate) {
        metrics.offers!.push({ sellerName: seller, price, currency: metrics.currency!, stockStatus: 'In Stock', stockCount: null, condition, isFBA: olpFba });
      }
    }
  });

  metrics.sellerCount = metrics.offers!.length;

  // Seller count from page text (may be higher than visible offers)
  const sellerCountText = $('#olp-upd-new-used, #aod-asin-count, #olp_feature_div').text().trim();
  if (sellerCountText) {
    const countMatch = sellerCountText.match(/(\d+)\s*(?:new|used|offer)/i);
    if (countMatch) {
      const totalCount = parseInt(countMatch[1], 10);
      if (totalCount > metrics.sellerCount) metrics.sellerCount = totalCount;
    }
  }

  // Average Offer Price
  if (metrics.offers!.length > 0) {
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
