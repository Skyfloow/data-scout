import { ExtractorContext, ExtractorResult, IExtractor } from './types';
import { LLMProviderFactory } from './llm/LLMProviderFactory';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'AIFallbackExtractor' });

export class AIFallbackExtractor implements IExtractor {
  async extract(context: ExtractorContext): Promise<ExtractorResult> {
    const { url, html, $, marketplace } = context;

    try {
      // 1. Clean the HTML to save tokens
      const $clean = $.load(html);
      // Remove heavy/unnecessary tags
      $clean('script, style, svg, path, iframe, noscript').remove();
      // Remove base64/data URIs to save tokens
      $clean('img').each((i, el) => {
        const src = $clean(el).attr('src');
        if (src && src.startsWith('data:')) {
          $clean(el).removeAttr('src');
        }
      });
      // Optionally remove hidden stuff
      $clean('[style*="display: none"], [style*="display:none"], .hidden, [hidden]').remove();
      
      const compressedHtml = $clean('body').html() || $clean.text();

      // 2. Build the prompt
      const prompt = `
You are an expert e-commerce data extractor. Extract the product details from the following HTML source.
The URL is: ${url}
Marketplace: ${marketplace || 'unknown'}

Return ONLY a valid JSON object with this exact structure (no markdown code blocks, just raw JSON, because we are parsing it directly):
{
  "title": "Full product title",
  "metrics": {
    "price": 12.99, // numeric only, just the main price, no currency symbol
    "currency": "USD", // e.g. USD, EUR, GBP
    "averageRating": 4.5, // numeric
    "reviewsCount": 1500, // integer
    "brand": "Brand Name",
    "description": "Short product description if found",
    "imageUrl": "Main product image URL if found",
    "availability": "In Stock or Out of Stock",
    "stockCount": 5, // numeric only, if exact number of stock left is found
    "buyBoxSeller": "Seller name in the buy box",
    "features": ["feature 1", "feature 2"]
  }
}
If a field is not found, omit it or set it to null. Ensure the price is accurately mapped from the BuyBox or main price block.
      `.trim();

      // 3. Call the LLM Provider
      const provider = LLMProviderFactory.createProvider('gemini');
      
      logger.info({ url }, 'Triggering AI Fallback extraction...');
      const result = await provider.extractProductData(compressedHtml, prompt);

      logger.info({ url, title: result.title }, 'AI Fallback extraction successful');
      
      return {
        success: true,
        title: result.title,
        metrics: result.metrics,
      };

    } catch (error: any) {
      logger.error({ err: error, url }, 'AI Fallback extraction failed');
      return {
        success: false,
        error: `AI Fallback Exception: ${error.message}`,
        metrics: {}
      };
    }
  }
}

export const aiFallbackExtractor = new AIFallbackExtractor();
