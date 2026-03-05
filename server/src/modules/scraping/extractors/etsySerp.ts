import * as cheerio from 'cheerio';
import { SerpResult } from '../../../types';
import { parsePrice } from '../../../utils/parsers';

export function extractEtsySerp(html: string, keyword: string, marketplace: string): SerpResult {
  const $ = cheerio.load(html);
  const rankings: SerpResult['rankings'] = [];

  // Etsy uses .v2-listing-card or specific li items in the search results
  const items = $('div[data-search-results] li, .v2-listing-card');

  let rankRank = 1;
  items.each((_, element) => {
    const el = $(element);
    
    const link = el.find('a.listing-link');
    if (link.length === 0) return;

    const url = link.attr('href');
    if (!url) return;
    
    // Extract ID from URL for an ASIN equivalent
    const idMatch = url.match(/listing\/(\d+)/);
    const asin = idMatch ? idMatch[1] : url.split('?')[0];

    const title = link.attr('title') || el.find('h3').text().trim() || el.find('.v2-listing-card__title').text().trim();
    if (!title) return;

    const priceText = el.find('.currency-value').text().trim() || el.find('.n-listing-card__price').text().trim();
    const price = parsePrice(priceText);

    // Etsy sponsored items usually have a specific span with "Ad" or similar text, often visually hidden
    const sponsoredText = el.find('.wt-screen-reader-only:contains("Ad"), span:contains("Ad by")').text().trim();
    const isSponsored = sponsoredText.length > 0 || link.attr('data-is-ad') === 'true';

    rankings.push({
      rank: rankRank++,
      asin,
      title,
      price: price > 0 ? price : undefined,
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
