import { ExtractorContext, ExtractorResult } from '../extractors/types';
import { amazonExtractor } from './amazon';
import { etsyExtractor } from './etsy';

// Selectors can now be async (e.g. amazon fetches /gp/offer-listing/ in a second HTTP call)
export type SelectorFunction = (context: ExtractorContext) => Promise<ExtractorResult> | ExtractorResult;

// A registry mapping domains to their custom selector extractors
export const selectorRegistry: Record<string, SelectorFunction> = {
  'amazon.com': amazonExtractor,
  'www.amazon.com': amazonExtractor,
  'etsy.com': etsyExtractor,
  'www.etsy.com': etsyExtractor,
  // Future platforms:
  // 'ebay.com': ebayExtractor,
  // 'bestbuy.com': bestbuyExtractor,
};

export const getPlatformSelector = (url: string): SelectorFunction | null => {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Cover all Amazon regional domains (amazon.de, amazon.co.uk, etc.)
    if (hostname === 'amazon.com' || hostname.endsWith('.amazon.com') || hostname.includes('amazon.')) {
      return amazonExtractor;
    }
    
    if (selectorRegistry[hostname]) {
      return selectorRegistry[hostname];
    }
    
    const domainWithoutWww = hostname.replace('www.', '');
    if (selectorRegistry[domainWithoutWww]) {
      return selectorRegistry[domainWithoutWww];
    }
    
    for (const key of Object.keys(selectorRegistry)) {
      if (hostname.includes(key.replace('www.', ''))) {
        return selectorRegistry[key];
      }
    }

    return null;
  } catch {
    return null;
  }
};
