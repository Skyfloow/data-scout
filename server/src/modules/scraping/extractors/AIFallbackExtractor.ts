import { ExtractorContext, ExtractorResult, IExtractor } from './types';
import { ProductMetrics } from '../../../types';
import { config } from '../../../config';

export class AIFallbackExtractor implements IExtractor {
  private apiKey: string;

  constructor() {
    this.apiKey = config.firecrawlApiKey;
  }

  async extract(context: ExtractorContext): Promise<ExtractorResult> {
    const { url } = context;

    if (!this.apiKey || this.apiKey === 'test_api_key') {
      return {
        success: false,
        error: 'Firecrawl API key is missing or invalid. AI Fallback skipped.',
        metrics: {}
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout

      // Ideally we should use the Extract endpoint with a JSON Schema, but for MVP
      // we'll use the Scrape endpoint and parse basic markdown to complement the missing data.
      // E.g. https://docs.firecrawl.dev/api-reference/endpoint/extract
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        return { 
          success: false,
          error: `FireCrawl API error: ${response.status} ${err}`,
          metrics: {}
        };
      }

      const data = await response.json();
      const markdown = data?.data?.markdown || '';
      
      const titleLine = markdown.split('\n').find((l: string) => l.trim().length > 0) || '';
      const title = titleLine
        .replace(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/gi, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/#/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // For this MVP fallback, we just grab what we can easily parse out of markdown or structured returns
      // In production you would provide a Pydantic/Zod schema to their LLM extract endpoint.
      const metrics: Partial<ProductMetrics> = {
        description: markdown.slice(0, 500) + '... (AI Extracted from MD)', // stub
      };

      return {
        title,
        metrics,
        success: true,
      };

    } catch (error: any) {
      return {
        success: false,
        error: `AI Fallback Exception: ${error.message}`,
        metrics: {}
      };
    }
  }
}

export const aiFallbackExtractor = new AIFallbackExtractor();
