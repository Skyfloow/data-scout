import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { parsePrice, parseStockCount, detectCurrencyFromUrlParam, detectCurrencyFromDomain } from '../src/utils/parsers';
import { convertToUSD } from '../src/services/CurrencyService';
import { amazonExtractor } from '../src/modules/scraping/selectors/amazon';

describe('parsePrice', () => {
  it('parses first monetary value when multiple numbers are present', () => {
    expect(parsePrice('$23.99 ($2.40 / Ounce)')).toBeCloseTo(23.99, 2);
  });

  it('parses european format with decimal comma', () => {
    expect(parsePrice('EUR 1.234,56')).toBeCloseTo(1234.56, 2);
  });

  it('parses us format with thousand comma', () => {
    expect(parsePrice('$1,234.56')).toBeCloseTo(1234.56, 2);
  });

  it('parses integer with thousand separator', () => {
    expect(parsePrice('1,299')).toBeCloseTo(1299, 2);
  });

  it('parses first value from a range', () => {
    expect(parsePrice('$12.99 - $15.99')).toBeCloseTo(12.99, 2);
  });

  it('ignores installment and returns one-time price', () => {
    expect(parsePrice('$83.33 / month, one-time purchase $999.00')).toBeCloseTo(999, 2);
  });

  it('ignores unit price and returns product price', () => {
    expect(parsePrice('$23.99 ($2.40 / Ounce)')).toBeCloseTo(23.99, 2);
  });
});

describe('parseStockCount (localized)', () => {
  it('parses English stock strings', () => {
    expect(parseStockCount('Only 3 left in stock')).toBe(3);
    expect(parseStockCount('In Stock')).toBe(999);
    expect(parseStockCount('Currently unavailable')).toBe(0);
  });

  it('parses German stock strings', () => {
    expect(parseStockCount('Nur noch 3 auf Lager')).toBe(3);
    expect(parseStockCount('Auf Lager')).toBe(999);
    expect(parseStockCount('Derzeit nicht verfügbar')).toBe(0);
  });

  it('parses Italian stock strings', () => {
    expect(parseStockCount('Solo 2 rimasti in magazzino')).toBe(2);
    expect(parseStockCount('Disponibile')).toBe(999);
    expect(parseStockCount('Non disponibile')).toBe(0);
  });

  it('parses French and Spanish stock strings', () => {
    expect(parseStockCount('Plus que 4 en stock')).toBe(4);
    expect(parseStockCount('En stock')).toBe(999);
    expect(parseStockCount('Solo quedan 5')).toBe(5);
    expect(parseStockCount('No disponible')).toBe(0);
  });
});

describe('convertToUSD fallback rates', () => {
  it('converts GBP to USD even without ECB refresh', () => {
    const converted = convertToUSD(100, 'GBP');
    expect(converted).toBeGreaterThan(100);
  });
});

describe('currency detection overrides', () => {
  it('detects currency from URL query params', () => {
    expect(detectCurrencyFromUrlParam('https://www.amazon.co.uk/dp/B0TEST?currency=USD')).toBe('USD');
    expect(detectCurrencyFromUrlParam('https://www.amazon.de/dp/B0TEST?currencyCode=EUR')).toBe('EUR');
  });

  it('detects currency for amazon.com.be and amazon.com.sa domains', () => {
    expect(detectCurrencyFromDomain('https://www.amazon.com.be/dp/B0TEST')).toBe('EUR');
    expect(detectCurrencyFromDomain('https://www.amazon.com.sa/dp/B0TEST')).toBe('SAR');
  });
});

describe('amazonExtractor price resolution', () => {
  it('prefers priceToPay over list price in the same block', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Test Product</span>
          <div id="corePrice_feature_div">
            <span class="a-price a-text-price"><span class="a-offscreen">$999.99</span></span>
            <span class="priceToPay"><span class="a-offscreen">$749.99</span></span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000000' });
    expect(result.metrics.price).toBeCloseTo(749.99, 2);
    expect(result.metrics.amazonMetrics?.asin).toBe('B000000000');
  });

  it('ignores installment value and picks one-time price', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Installment Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$83.33</span><span> / month</span></span>
            <span id="priceblock_ourprice">$999.00</span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000001' });
    expect(result.metrics.price).toBeCloseTo(999, 2);
  });

  it('falls back to structured price when DOM price diverges too much', async () => {
    const html = `
      <html>
        <head>
          <meta property="product:price:amount" content="999.99" />
        </head>
        <body>
          <span id="productTitle">Structured Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$1499.99</span></span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000002' });
    expect(result.metrics.price).toBeCloseTo(999.99, 2);
  });

  it('extracts title from page title when #productTitle is missing', async () => {
    const html = `
      <html>
        <head>
          <title>Noise Cancelling Headphones - Amazon.com</title>
        </head>
        <body>
          <div id="dp-container"></div>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$199.99</span></span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000003' });
    expect(result.title).toBe('Noise Cancelling Headphones');
    expect(result.metrics.price).toBeCloseTo(199.99, 2);
  });

  it('ignores image URL in title meta and falls back to visible title', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="https://m.media-amazon.com/images/I/abc123.jpg" />
        </head>
        <body>
          <span id="productTitle">Actual Product Name</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$49.99</span></span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000004' });
    expect(result.title).toBe('Actual Product Name');
    expect(result.metrics.price).toBeCloseTo(49.99, 2);
  });

  it('extracts price from buybox buy now block when core price block is missing', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Buybox Product</span>
          <div id="buybox">
            <span>Buy Now</span>
            <span class="a-price">
              <span class="a-offscreen">$321.45</span>
            </span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000005' });
    expect(result.metrics.price).toBeCloseTo(321.45, 2);
  });

  it('uses URL currency when page does not provide explicit currency signal', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Currency Override Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$999.99</span></span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({
      $,
      html,
      url: 'https://www.amazon.co.uk/dp/B000000099?th=1&currency=USD',
    });
    expect(result.metrics.currency).toBe('USD');
    expect(result.metrics.price).toBeCloseTo(999.99, 2);
  });

  it('prefers page currency over conflicting URL currency param', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Currency Conflict Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">€999.99</span></span>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({
      $,
      html,
      url: 'https://www.amazon.co.uk/dp/B000000100?th=1&currency=USD',
    });
    expect(result.metrics.currency).toBe('EUR');
    expect(result.metrics.price).toBeCloseTo(999.99, 2);
  });

  it('cleans markdown image links from title and uses textual fallback', async () => {
    const html = `
      <html>
        <head>
          <title>![](https://fls-eu.amazon.de/x.png)![](https://m.media-amazon.com/images/G/03/gno/sprites/nav.png) Real Product Name - Amazon.de</title>
        </head>
        <body>
          <div id="dp-container"></div>
          <div id="buybox"><span class="a-price"><span class="a-offscreen">EUR 79,99</span></span></div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.de/dp/B000000006' });
    expect(result.title).toBe('Real Product Name');
    expect(result.metrics.price).toBeCloseTo(79.99, 2);
  });

  it('extracts buy now price from data-a-state JSON when visible price nodes are missing', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">JSON Buybox Product</span>
          <div id="buybox">
            <div data-a-state='{"displayPrice":"$459.90","buyNowPrice":"$459.90"}'></div>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000007' });
    expect(result.metrics.price).toBeCloseTo(459.9, 2);
  });

  it('extracts buy now price from script payload when buybox nodes are noisy', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Script Price Product</span>
          <div id="buybox">Buy Now</div>
          <script>
            window.__buybox = {"displayPrice":"EUR 109,95","priceToPay":"EUR 109,95"};
          </script>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.de/dp/B000000008' });
    expect(result.metrics.price).toBeCloseTo(109.95, 2);
  });

  it('extracts delivery info, sales volume and climate friendly flag', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Climate Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$403.00</span></span>
          </div>
          <div id="deliveryBlockMessage">FREE delivery Fri, Feb 13 Or fastest delivery Tomorrow, Feb 12</div>
          <div id="social-proofing-faceout-title-tk_bought">2K+ bought in past month</div>
          <div id="climatePledgeFriendlyBadge">Climate Pledge Friendly</div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B0CMPMY9ZZ' });
    expect(result.metrics.deliveryInfo).toContain('FREE delivery');
    expect(result.metrics.salesVolume).toBe('2K+ bought in past month');
    expect(result.metrics.isClimateFriendly).toBe(true);
    expect(result.metrics.lowestOfferPrice).toBeCloseTo(403, 2);
  });

  it('uses max quantity option for buybox offer stockCount instead of generic in-stock sentinel', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Quantity Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$99.00</span></span>
          </div>
          <div id="availability"><span>In Stock.</span></div>
          <div id="quantity">
            <select name="quantity">
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="7">7</option>
            </select>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000009' });
    expect(result.metrics.offers?.[0]?.stockCount).toBe(7);
  });

  it('parses sellers from injected remote AOD payload and keeps seller names in offers', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">Remote AOD Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$99.00</span></span>
          </div>
          <div id="availability"><span>In Stock.</span></div>
          <div id="__remote_aod_payload">
            <div id="aod-offer-1">
              <div id="aod-offer-price"><span class="a-price"><span class="a-offscreen">$101.00</span></span></div>
              <div id="aod-offer-soldBy"><a>Seller One</a></div>
              <div id="aod-offer-availability">Only 4 left in stock.</div>
            </div>
            <div id="aod-offer-2">
              <div id="aod-offer-price"><span class="a-price"><span class="a-offscreen">$103.00</span></span></div>
              <div id="aod-offer-soldBy"><a>Seller Two</a></div>
              <div id="aod-offer-availability">In Stock.</div>
              <div class="aod-quantity">
                <select>
                  <option value="1">1</option>
                  <option value="5">5</option>
                </select>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000010' });
    const sellers = (result.metrics.offers || []).map((offer) => offer.sellerName);
    expect(sellers).toContain('Seller One');
    expect(sellers).toContain('Seller Two');
    const sellerTwo = (result.metrics.offers || []).find((offer) => offer.sellerName === 'Seller Two');
    expect(sellerTwo?.stockCount).toBe(5);
  });

  it('deduplicates remote AOD offers by seller id and ignores non-offer AOD container nodes', async () => {
    const html = `
      <html>
        <head></head>
        <body>
          <span id="productTitle">AOD Dedup Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$99.00</span></span>
          </div>
          <div id="availability"><span>In Stock.</span></div>
          <div id="__remote_aod_payload">
            <div id="aod-offer-list">
              <div id="aod-offer">
                <div id="aod-offer-price"><span class="a-price"><span class="a-offscreen">$101.00</span></span></div>
                <div id="aod-offer-soldBy">
                  <a href="/gp/aag/main?seller=A1SELLER123456&sshmPath=shipping-rates">Seller One</a>
                </div>
                <div id="aod-offer-availability">In Stock.</div>
              </div>
              <div id="aod-offer-price"><span class="a-price"><span class="a-offscreen">$101.00</span></span></div>
              <div id="aod-offer">
                <div id="aod-offer-price"><span class="a-price"><span class="a-offscreen">$101.00</span></span></div>
                <div id="aod-offer-soldBy">
                  <a href="/gp/aag/main?seller=A1SELLER123456&sshmPath=shipping-rates"></a>
                </div>
                <div id="aod-offer-availability">In Stock.</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000011' });
    const samePriceOffers = (result.metrics.offers || []).filter((offer) => Number(offer.price || 0) === 101);
    expect(samePriceOffers.length).toBe(1);
    expect(samePriceOffers[0]?.sellerName).toBe('Seller One');
  });

  it('keeps full AOD offers list even when AMAZON_TOP_OFFERS_LIMIT is configured', async () => {
    const previousLimit = process.env.AMAZON_TOP_OFFERS_LIMIT;
    process.env.AMAZON_TOP_OFFERS_LIMIT = '10';

    const offersHtml = Array.from({ length: 12 }, (_, idx) => {
      const n = idx + 1;
      return `
        <div id="aod-offer-${n}">
          <div id="aod-offer-price"><span class="a-price"><span class="a-offscreen">$${100 + n}.00</span></span></div>
          <div id="aod-offer-soldBy"><a href="/gp/aag/details/?seller=A1SELLER${n}&sshmPath=shipping-rates">Seller ${n}</a></div>
          <div id="aod-offer-availability">In Stock.</div>
        </div>
      `;
    }).join('');

    const html = `
      <html>
        <body>
          <span id="productTitle">AOD List Product</span>
          <div id="corePrice_feature_div">
            <span class="priceToPay"><span class="a-offscreen">$99.00</span></span>
          </div>
          <div id="availability"><span>In Stock.</span></div>
          <div id="__remote_aod_payload">${offersHtml}</div>
        </body>
      </html>
    `;

    try {
      const $ = cheerio.load(html);
      const result = await amazonExtractor({ $, html, url: 'https://www.amazon.com/dp/B000000012' });
      const parsedOffers = (result.metrics.offers || []).filter((offer) => offer.sellerName.startsWith('Seller '));
      expect(parsedOffers.length).toBe(12);
    } finally {
      if (previousLimit === undefined) {
        delete process.env.AMAZON_TOP_OFFERS_LIMIT;
      } else {
        process.env.AMAZON_TOP_OFFERS_LIMIT = previousLimit;
      }
    }
  });
});
