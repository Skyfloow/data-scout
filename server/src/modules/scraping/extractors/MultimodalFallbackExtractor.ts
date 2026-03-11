import { ExtractorResult } from './types';
import { LLMProviderFactory } from './llm/LLMProviderFactory';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'MultimodalFallbackExtractor' });

export class MultimodalFallbackExtractor {
  async extract(url: string, markdown: string, base64Image: string | undefined, marketplace: string): Promise<ExtractorResult> {
    try {
      let schemaDescription = `Return ONLY a valid JSON object. Do not wrap it in markdown codeblocks. It must exactly match this structure:
{
  "title": "Full product title",
  "metrics": {
    "price": 12.99, // numeric only, just the main price
    "currency": "USD", // e.g. USD, EUR, GBP
    "averageRating": 4.5, // numeric
    "reviewsCount": 1500, // integer
    "brand": "Brand Name",
    "description": "Short product description if found",
    "imageUrl": "Main product image URL if found",
    "availability": "In Stock or Out of Stock",
    "stockCount": 5, // numeric only
    "buyBoxSeller": "Seller name in the buy box",
    "features": ["feature 1", "feature 2"],
    "dynamicFeatures": {
       // Extract any additional interesting key-value pairs (e.g. "warranty": "1 year", "origin": "China")
    }
  }
}`;

      if (marketplace === 'amazon') {
        schemaDescription = `Return ONLY a valid JSON object. Do not wrap it in markdown codeblocks. It must exactly match this structure:
{
  "title": "Full product title",
  "metrics": {
    "price": 12.99,
    "currency": "USD",
    "averageRating": 4.5,
    "reviewsCount": 1500,
    "brand": "Brand Name",
    "description": "Short product description",
    "imageUrl": "Main product image URL",
    "availability": "In Stock",
    "amazonMetrics": {
       "bestSellerRank": "String rank",
       "isPrime": true,
       "isAmazonChoice": false
    },
    "dynamicFeatures": {
       // Extract anything else noteworthy
    }
  }
}`;
      } else if (marketplace === 'etsy') {
        schemaDescription = `Return ONLY a valid JSON object. Do not wrap it in markdown codeblocks. It must exactly match this structure:
{
  "title": "Full product title",
  "metrics": {
    "price": 12.99,
    "currency": "USD",
    "averageRating": 4.5,
    "reviewsCount": 1500,
    "brand": "Shop Name",
    "description": "Product description",
    "imageUrl": "Main product image URL",
    "etsyMetrics": {
       "dispatchTime": "1-3 days",
       "madeToOrder": true,
       "isStarSeller": false,
       "shopAgeText": "Since 2020"
    },
    "dynamicFeatures": {
       // Add anything else like materials, customization rules, etc
    }
  }
}`;
      }

      const prompt = `
You are an expert e-commerce data extractor. Extract the product details from the given web page.
You have been provided with both the raw text (markdown) of the page AND a screenshot of the page.
Use BOTH to cross-reference and accurately extract the requested fields. The screenshot helps identify which price is the primary 'Buy Box' price versus crossed-out or irrelevant prices.

The URL is: ${url}
Marketplace: ${marketplace || 'unknown'}

${schemaDescription}

If a field is not found, omit it or set it to null. Ensure the price is accurately mapped.
      `.trim();

      const provider = LLMProviderFactory.createProvider('gemini');
      
      logger.info({ url }, 'Triggering Multimodal Fallback extraction (Phase 3)...');
      const result = await provider.extractMultimodalProductData(markdown, base64Image, prompt);

      logger.info({ url, title: result.title }, 'Multimodal Fallback extraction successful');
      
      return {
        success: true,
        title: result.title,
        metrics: result.metrics,
      };

    } catch (error: any) {
      logger.error({ err: error, url }, 'Multimodal Fallback extraction failed');
      return {
        success: false,
        error: `Multimodal Fallback Exception: ${error.message}`,
        metrics: {}
      };
    }
  }
}

export const multimodalFallbackExtractor = new MultimodalFallbackExtractor();
