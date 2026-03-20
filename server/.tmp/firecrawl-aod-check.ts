import { config } from '../src/config';
(async () => {
  const apiKey = process.env.FIRECRAWL_API_KEY || config.firecrawlApiKey || '';
  const url = 'https://www.amazon.de/-/en/gp/offer-listing/B0FHL3385S/ref=dp_olp_ALL_mbc?ie=UTF8&condition=ALL';
  const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      url,
      formats: ['html'],
      waitFor: 0,
      location: { country: 'DE' },
      headers: { 'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8' },
    }),
  });
  console.log('STATUS', r.status);
  const raw = await r.text();
  console.log('RAW_HEAD', raw.slice(0, 1000).replace(/\s+/g, ' '));
})();
