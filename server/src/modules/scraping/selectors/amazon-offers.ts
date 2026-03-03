import * as cheerio from 'cheerio';
import { Offer } from '../../../types';
import { parsePrice, parseStockCount } from '../../../utils/parsers';
import { fetcher } from '../network/Fetcher';

/**
 * Parses seller offers from Amazon's All Offers Display (AOD) AJAX response HTML.
 * This is the modern replacement for the deprecated /gp/offer-listing/ pages.
 */
function parseAodOffers(html: string, currency: string): Offer[] {
  const $ = cheerio.load(html);
  const offers: Offer[] = [];

  // AOD panel uses #aod-offer elements
  $('#aod-offer, .aod-information-block').each((_, el) => {
    const priceText = $(el).find('.a-price .a-offscreen').first().text().trim()
                   || $(el).find('.a-price-whole').first().text().trim();
    
    const sellerName = $(el).find('#aod-offer-soldBy a[aria-label]').first().text().trim()
                    || $(el).find('#aod-offer-soldBy a').first().text().trim()
                    || $(el).find('.aod-information-block a').first().text().trim()
                    || 'Third-party Seller';

    const condition = $(el).find('#aod-offer-heading h5').text().trim()
                   || $(el).find('.aod-offer-heading').text().trim()
                   || 'New';

    const deliveryText = $(el).find('#aod-offer-price .aod-ship-speed').text().replace(/\s+/g, ' ').trim()
                      || $(el).find('.a-color-base.a-text-bold').text().replace(/\s+/g, ' ').trim();

    const stockText = $(el).find('#aod-offer-shipsFrom .a-color-base').text().replace(/\s+/g, ' ').trim();
    
    if (priceText) {
      const price = parsePrice(priceText);
      const elText = $(el).text().toLowerCase();
      const offerIsFBA = elText.includes('fulfilled by amazon') || elText.includes('amazon.com');

      if (price > 0) {
        offers.push({
          sellerName: sellerName.replace(/\s+/g, ' ').trim(),
          price,
          currency,
          stockStatus: stockText || 'In Stock',
          stockCount: parseStockCount(stockText),
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
 */
export async function fetchAmazonOffers(asin: string, currency: string): Promise<Offer[]> {
  const allOffers: Offer[] = [];
  const maxPages = 1;

  for (let page = 0; page < maxPages; page++) {
    // Try the AOD AJAX endpoint first (modern Amazon)
    const aodUrl = `https://www.amazon.com/gp/product/ajax/ref=aod_page_${page}?asin=${asin}&pc=dp&experienceId=aodAjaxMain&pageno=${page + 1}`;
    
    let result = await fetcher.fetchHtml(aodUrl);

    // Fallback to offer-listing if AOD fails
    if (!result.success || !result.html || result.html.length < 200) {
      const olpUrl = `https://www.amazon.com/gp/offer-listing/${asin}?startIndex=${page * 10}`;
      result = await fetcher.fetchHtml(olpUrl);
    }

    if (!result.success || !result.html) {
      console.warn(`amazon-offers: Failed to fetch page ${page + 1} for ASIN ${asin}: ${result.error}`);
      break;
    }

    const pageOffers = parseAodOffers(result.html, currency);

    if (pageOffers.length === 0) {
      break; // No more offers
    }

    allOffers.push(...pageOffers);

    // Rate limit between pages
    if (page < maxPages - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
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
