import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { etsyExtractor } from '../src/modules/scraping/selectors/etsy';

describe('etsyExtractor price resolution', () => {
  it('extracts lowPrice from JSON-LD AggregateOffer', async () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Custom Neon Sign",
              "offers": {
                "@type": "AggregateOffer",
                "lowPrice": "18.95",
                "highPrice": "44.50",
                "priceCurrency": "USD"
              }
            }
          </script>
        </head>
        <body><h1 data-buy-box-region="title">Custom Neon Sign</h1></body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await etsyExtractor({ $, html, url: 'https://www.etsy.com/listing/123456/custom-neon-sign' });
    expect(result.success).toBe(true);
    expect(result.metrics.price).toBeCloseTo(18.95, 2);
    expect(result.metrics.currency).toBe('USD');
    expect(result.metrics.etsyMetrics?.shippingProfiles).toBeUndefined();
  });

  it('extracts price from buy-box DOM selectors', async () => {
    const html = `
      <html>
        <body>
          <h1 data-buy-box-region="title">Printable Wall Art</h1>
          <div data-buy-box-region="price">
            <p class="wt-text-title-larger">EUR 12,49+</p>
          </div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await etsyExtractor({ $, html, url: 'https://www.etsy.com/listing/654321/printable-wall-art' });
    expect(result.success).toBe(true);
    expect(result.metrics.price).toBeCloseTo(12.49, 2);
    expect(result.metrics.currency).toBe('EUR');
  });

  it('falls back to script state when JSON-LD and visible selectors are missing', async () => {
    const html = `
      <html>
        <body>
          <h1>Digital Planner</h1>
          <script>
            window.__STATE__ = {
              "listing": {
                "price": { "amount": 1499, "divisor": 100, "currency_code": "USD" }
              }
            };
          </script>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await etsyExtractor({ $, html, url: 'https://www.etsy.com/listing/111222/digital-planner' });
    expect(result.success).toBe(true);
    expect(result.metrics.price).toBeCloseTo(14.99, 2);
    expect(result.metrics.currency).toBe('USD');
  });

  it('sanitizes bad title candidates and uses valid h1 title', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="- [Homepage](" />
          <title>Homepage - Etsy</title>
        </head>
        <body>
          <h1 data-buy-box-region="title">Minimalist Candle Label</h1>
          <div data-buy-box-region="price"><p class="wt-text-title-larger">$9.99</p></div>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await etsyExtractor({ $, html, url: 'https://www.etsy.com/listing/222333/minimalist-candle-label' });
    expect(result.success).toBe(true);
    expect(result.title).toBe('Minimalist Candle Label');
  });

  it('extracts additional fields: description, brand, availability, category and images', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:description" content="Handmade ceramic mug with custom name." />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Personalized Mug",
              "brand": { "@type": "Brand", "name": "ClayLabStudio" },
              "category": "Home & Living",
              "aggregateRating": { "ratingValue": "4.8", "reviewCount": "1,234" },
              "offers": {
                "@type": "Offer",
                "price": "24.00",
                "priceCurrency": "USD",
                "availability": "http://schema.org/InStock"
              },
              "image": [
                "https://i.etsystatic.com/1.jpg",
                "https://i.etsystatic.com/2.jpg"
              ]
            }
          </script>
        </head>
        <body>
          <h1 data-buy-box-region="title">Personalized Mug</h1>
          <div data-buy-box-region="delivery">
            <p>Estimated delivery: Mar 10-15. Shipping: $5.00</p>
          </div>
          <div data-buy-box-region="promotion">
            <p>Save 20% with coupon code MUG20</p>
          </div>
          <section id="returns-and-exchanges">
            Returns & exchanges accepted within 14 days.
          </section>
          <h2>12 questions about this item</h2>
          <span>1,120 views in the last 30 days</span>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await etsyExtractor({ $, html, url: 'https://www.etsy.com/listing/444555/personalized-mug' });
    expect(result.success).toBe(true);
    expect(result.metrics.brand).toBe('ClayLabStudio');
    expect(result.metrics.sellerCount).toBe(1);
    expect(result.metrics.description).toContain('Handmade ceramic mug');
    expect(result.metrics.availability).toBe('InStock');
    expect(result.metrics.deliveryInfo).toContain('Shipping: $5.00');
    expect(result.metrics.estimatedShipping).toBeCloseTo(5, 2);
    expect(result.metrics.landedPrice).toBeCloseTo(29, 2);
    expect(result.metrics.couponText).toContain('coupon code MUG20');
    expect(result.metrics.returnPolicy).toContain('Returns & exchanges accepted');
    expect(result.metrics.qaCount).toBe(12);
    expect(result.metrics.viewsCount).toBe(1120);
    expect(result.metrics.category).toBe('Home & Living');
    expect(result.metrics.averageRating).toBeCloseTo(4.8, 2);
    expect(result.metrics.reviewsCount).toBe(1234);
    expect(result.metrics.imageUrl).toBe('https://i.etsystatic.com/1.jpg');
    expect(result.metrics.imageUrls?.length).toBe(2);
  });

  it('extracts shipping profile, dispatch, tags/materials, digital flag and shop signals', async () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Editable Budget Planner",
              "keywords": "planner, budget template, finance tracker",
              "material": ["PDF", "Canva template"],
              "offers": { "@type": "Offer", "price": "7.50", "priceCurrency": "USD" }
            }
          </script>
        </head>
        <body>
          <h1 data-buy-box-region="title">Editable Budget Planner</h1>
          <div data-buy-box-region="delivery">
            <p>United States: Arrives Mar 12-16, Shipping $3.00</p>
            <p>Europe: Arrives Mar 20-27, Shipping $5.00</p>
            <p>Ready to ship in 1-2 business days</p>
          </div>
          <div data-id="processing-time">Made to order, dispatches in 3-5 days</div>
          <ul data-id="materials">
            <li>Materials: PDF, Canva template</li>
          </ul>
          <div data-id="tags">
            <a href="/search?q=budget+planner">budget planner</a>
            <a href="/search?q=printable+planner">printable planner</a>
            <a href="/search?q=back+to+search+results">Back to search results</a>
          </div>
          <div id="shop-info">
            Star Seller. On Etsy since 2018. 97% response rate.
          </div>
          <p>This is a digital download. No physical item will be shipped.</p>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const result = await etsyExtractor({ $, html, url: 'https://www.etsy.com/listing/777888/editable-budget-planner' });
    expect(result.success).toBe(true);
    expect(result.metrics.shippingProfiles).toBeUndefined();
    expect(result.metrics.dispatchTime).toContain('3-5 days');
    expect(result.metrics.dispatchMinDays).toBe(3);
    expect(result.metrics.dispatchMaxDays).toBe(5);
    expect(result.metrics.madeToOrder).toBe(true);
    expect(result.metrics.materials).toContain('PDF');
    expect(result.metrics.tags).toContain('budget planner');
    expect(result.metrics.tags).not.toContain('Back to search results');
    expect(result.metrics.isDigitalDownload).toBe(true);
    expect(result.metrics.shopAgeText).toBe('2018');
    expect(result.metrics.shopAgeYears).toBeGreaterThanOrEqual(0);
    expect(result.metrics.isStarSeller).toBe(true);
    expect(result.metrics.shopResponseRate).toBe(97);
    expect(result.metrics.etsyMetrics?.dispatchTime).toContain('3-5 days');
    expect(result.metrics.etsyMetrics?.dispatchMinDays).toBe(3);
    expect(result.metrics.etsyMetrics?.dispatchMaxDays).toBe(5);
    expect(result.metrics.etsyMetrics?.isDigitalDownload).toBe(true);
  });
});
