import { describe, it, expect } from 'vitest';
import { CrawleeAdapter } from '../src/modules/scraping/adapters/CrawleeAdapter';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('CrawleeAdapter - Amazon Integration', () => {
    it('should successfully scrape an Amazon URL and extract basic data', async () => {
        const adapter = new CrawleeAdapter();
        // ASIN specified by user
        const url = 'https://www.amazon.com/dp/B0DHJ9SCJ4'; 
        
        const result = await adapter.scrapeProduct(url);
        
        expect(result.error).toBeUndefined();
        expect(result.product).toBeDefined();
        if (result.product) {
            expect(result.product.title).not.toBe('Unknown Product');
            expect(result.product.metrics.price).toBeDefined();
            expect(result.product.metrics.price).toBeGreaterThan(0);
            expect(['USD', 'EUR']).toContain(result.product.metrics.currency);
            console.log('Extracted Product:', JSON.stringify(result.product, null, 2));
        }
    }, 90000); // 90s timeout for browser launch and scraping
});
