import * as cheerio from 'cheerio';
import { SerpResult } from '../../../types';

export function extractAmazonSerp(html: string, keyword: string, marketplace: string): SerpResult {
  const $ = cheerio.load(html);
  const rankings: SerpResult['rankings'] = [];

  // Amazon's SERP item container
  const items = $('div[data-component-type="s-search-result"]');

  items.each((index, element) => {
    const el = $(element);
    
    // Extract ASIN
    const asin = el.attr('data-asin');
    if (!asin) return;

    // Extract Title
    let title = el.find('h2 a span').text().trim();
    if (!title) {
      // Fallback selector for some layouts
      title = el.find('.a-text-normal').first().text().trim();
    }

    // Extract Price
    const priceFraction = el.find('.a-price-fraction').first().text().trim();
    const priceWhole = el.find('.a-price-whole').first().text().replace(/[.,]/g, '').trim();
    let price: number | undefined;
    if (priceWhole) {
      const parsed = parseFloat(`${priceWhole}.${priceFraction || '00'}`);
      if (!isNaN(parsed)) price = parsed;
    }

    // Determine if sponsored
    const sponsoredText = el.find('.puis-sponsored-label-text, .s-sponsored-label-info').text().trim();
    const isSponsored = sponsoredText.length > 0;

    rankings.push({
      rank: index + 1, // Store absolute position on the page
      asin,
      title,
      price,
      sponsored: isSponsored
    });
  });

  return {
    keyword,
    marketplace,
    scrapedAt: new Date().toISOString(),
    rankings
  };
}
