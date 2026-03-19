import { describe, expect, it, vi } from 'vitest';

describe('FireCrawlAdapter (Amazon AOD offers)', () => {
  it('extracts AOD offers from Firecrawl HTML payload', async () => {
    vi.resetModules();
    process.env.FIRECRAWL_API_KEY = 'unit_test_key';

    const html = `
      <html>
        <head>
          <title>Amazon.com: Test Product</title>
          <meta property="og:title" content="Test Product" />
        </head>
        <body>
          <span id="productTitle">Test Product</span>
          <div id="corePrice_feature_div">
            <span class="a-price"><span class="a-offscreen">$12.34</span></span>
          </div>

          <div id="aod-offer">
            <div id="aod-offer-price">
              <span class="a-price"><span class="a-offscreen">$11.11</span></span>
            </div>
            <div id="aod-offer-soldBy"><a>Seller One</a></div>
            <div id="aod-offer-availability"><span class="a-size-small">Only 2 left in stock</span></div>
          </div>
        </body>
      </html>
    `;

    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          html,
          markdown: '# Test Product',
        },
      }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', mockFetch as any);

    const { FireCrawlAdapter } = await import('../src/modules/scraping/adapters/FirecrawlAdapter');
    const adapter = new FireCrawlAdapter();
    const result = await adapter.scrapeProduct('https://www.amazon.com/dp/B000000000');

    expect(result.error).toBeUndefined();
    expect(result.html).toContain('aod-offer');
    expect(result.markdown).toContain('Test Product');
    expect(result.product).toBeTruthy();
    expect(result.product?.scrapedBy).toBe('firecrawl');
    expect(result.product?.metrics.currency).toBe('USD');
    expect(result.product?.metrics.price).toBeCloseTo(12.34, 2);
    expect(result.product?.metrics.offers?.length).toBeGreaterThanOrEqual(1);
    const offers = result.product?.metrics.offers || [];
    expect(offers.some((offer) => offer.sellerName === 'Seller One' && Number(offer.price).toFixed(2) === '11.11')).toBe(true);
  });

  it('fetches AOD offers via Firecrawl when not present in initial HTML', async () => {
    vi.resetModules();
    process.env.FIRECRAWL_API_KEY = 'unit_test_key';

    const initialHtml = `
      <html>
        <head>
          <title>Amazon.com: Test Product</title>
          <meta property="og:title" content="Test Product" />
        </head>
        <body>
          <span id="productTitle">Test Product</span>
          <div id="corePrice_feature_div">
            <span class="a-price"><span class="a-offscreen">$12.34</span></span>
          </div>
          <div id="dynamic-aod-ingress-box">Other sellers on Amazon</div>
        </body>
      </html>
    `;

    const aodHtml = `
      <div id="aod-offer">
        <div id="aod-offer-price">
          <span class="a-price"><span class="a-offscreen">$11.11</span></span>
        </div>
        <div id="aod-offer-soldBy"><a href="/sp?seller=A1TESTSELLER&smid=A1TESTSELLER">Seller One</a></div>
        <div id="aod-offer-availability"><span class="a-size-small">Only 2 left in stock</span></div>
      </div>
    `;

    const mockFetch = vi.fn(async (_input: any, init?: any) => {
      const parsedBody = init?.body ? JSON.parse(init.body) : {};
      const targetUrl = String(parsedBody?.url || '');

      if (targetUrl.includes('/gp/product/ajax/') || targetUrl.includes('/gp/offer-listing/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { html: aodHtml } }),
          text: async () => '',
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { html: initialHtml, markdown: '# Test Product' } }),
        text: async () => '',
      } as any;
    });
    vi.stubGlobal('fetch', mockFetch as any);

    const { FireCrawlAdapter } = await import('../src/modules/scraping/adapters/FirecrawlAdapter');
    const adapter = new FireCrawlAdapter();
    const result = await adapter.scrapeProduct('https://www.amazon.com/dp/B000000000');

    expect(result.product).toBeTruthy();
    const offers = result.product?.metrics.offers || [];
    expect(offers.some((offer) => Number(offer.price).toFixed(2) === '11.11')).toBe(true);
  });
});
