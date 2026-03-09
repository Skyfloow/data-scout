import { ExtractorContext, ExtractorResult, IExtractor } from './types';
import { ProductMetrics } from '../../../types';

export class MetadataExtractor implements IExtractor {
  async extract(context: ExtractorContext): Promise<ExtractorResult> {
    const { $, url } = context;
    
    let title = '';
    const metrics: Partial<ProductMetrics> = {};

    try {
      // 1. JSON-LD parsing (Highest priority for structured data)
      const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
      for (const script of jsonLdScripts) {
        try {
          const content = $(script).html();
          if (!content) continue;
          
          let parsedData: any;
          try {
            parsedData = JSON.parse(content);
          } catch(e) {
            // some pages have malformed JSON-LD (e.g. trailing commas, newlines)
            // simple sanitization attempt
            const cleanContent = content.replace(/\n/g, '').replace(/,\s*}/g, '}');
            parsedData = JSON.parse(cleanContent);
          }
          
          // Handle both single objects and arrays of graphs
          const graphs = Array.isArray(parsedData) ? parsedData : (parsedData['@graph'] ? parsedData['@graph'] : [parsedData]);
          
          for (const item of graphs) {
            if (item['@type'] === 'Product') {
              if (item.name) title = item.name;
              if (item.description) metrics.description = item.description;
              if (item.image) {
                const img = Array.isArray(item.image) ? item.image[0] : item.image;
                if (typeof img === 'string') {
                  metrics.imageUrl = img;
                } else if (img && typeof img === 'object' && img.url) {
                  metrics.imageUrl = img.url;
                }
              }
              
              if (item.brand && item.brand.name) {
                metrics.brand = item.brand.name;
              }

              if (item.aggregateRating) {
                metrics.averageRating = parseFloat(item.aggregateRating.ratingValue);
                metrics.reviewsCount = parseInt(item.aggregateRating.reviewCount || item.aggregateRating.ratingCount || '0', 10);
              }

              if (item.offers) {
                const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                if (offer.price) metrics.price = parseFloat(offer.price);
                if (offer.priceCurrency) metrics.currency = offer.priceCurrency;
                if (offer.availability) {
                  metrics.availability = offer.availability.split('/').pop(); // Extract from http://schema.org/InStock
                }
              }
            }
          }
        } catch (e) {
          // Safely ignore parsing errors for a specific block
          continue;
        }
      }

      // 2. OpenGraph & Meta Tags Fallback (Fills in missing data)
      if (!title) {
        title = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text().trim();
      }
      
      if (!metrics.description) {
        metrics.description = $('meta[property="og:description"]').attr('content') || $('meta[name="twitter:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
      }

      if (!metrics.imageUrl) {
        metrics.imageUrl = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';
      }

      if (!metrics.price) {
        const priceStr = $('meta[property="product:price:amount"]').attr('content');
        if (priceStr) metrics.price = parseFloat(priceStr);
      }
      
      if (!metrics.currency) {
         metrics.currency = $('meta[property="product:price:currency"]').attr('content') || '';
      }
      
      if (!metrics.brand) {
         metrics.brand = $('meta[property="product:brand"]').attr('content') || '';
      }

      return {
        title,
        metrics,
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metrics: {}
      };
    }
  }
}

export const metadataExtractor = new MetadataExtractor();
