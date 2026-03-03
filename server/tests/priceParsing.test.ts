import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { parsePrice } from '../src/utils/parsers';
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
});
