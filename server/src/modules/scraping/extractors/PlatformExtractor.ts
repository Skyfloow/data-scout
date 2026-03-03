import { ExtractorContext, ExtractorResult, IExtractor } from './types';
import { getPlatformSelector } from '../selectors';

export class PlatformExtractor implements IExtractor {
  async extract(context: ExtractorContext): Promise<ExtractorResult> {
    const { url } = context;
    
    const selectorFunc = getPlatformSelector(url);
    
    if (!selectorFunc) {
      return {
        success: false,
        metrics: {},
        error: 'No platform-specific selector found for this URL',
      };
    }

    try {
      return await Promise.resolve(selectorFunc(context));
    } catch (error: any) {
      return {
        success: false,
        metrics: {},
        error: `Platform extractor failed: ${error.message}`,
      };
    }
  }
}

export const platformExtractor = new PlatformExtractor();
