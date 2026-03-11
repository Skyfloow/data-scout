import fs from 'fs';
import path from 'path';
import { LLMProviderFactory } from './llm/LLMProviderFactory';
import { logger as baseLogger } from '../../../utils/logger';

const logger = baseLogger.child({ module: 'LLMSelectorCache' });

const CACHE_FILE = path.join(process.cwd(), 'data', 'selectors.json');

export class LLMSelectorCache {
  private cache: Record<string, Record<string, string>> = {};

  constructor() {
    this.loadCache();
  }

  private loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        this.cache = JSON.parse(raw);
      }
    } catch (err) {
      logger.warn(`Failed to load selector cache: ${(err as Error).message}`);
      this.cache = {};
    }
  }

  private isSaving = false;
  private savePending = false;

  private async saveCache() {
    if (this.isSaving) {
      this.savePending = true;
      return;
    }
    this.isSaving = true;
    this.savePending = false;
    
    try {
      const dir = path.dirname(CACHE_FILE);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`Failed to save selector cache: ${(err as Error).message}`);
    } finally {
      this.isSaving = false;
      if (this.savePending) {
        this.saveCache().catch(e => logger.error(`Error in saveCache retry: ${e.message}`));
      }
    }
  }

  private getDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  public getSelector(url: string, field: string): string | null {
    const domain = this.getDomain(url);
    if (this.cache[domain] && this.cache[domain][field]) {
      return this.cache[domain][field];
    }
    return null;
  }

  public setSelector(url: string, field: string, selector: string): void {
    const domain = this.getDomain(url);
    if (!this.cache[domain]) {
      this.cache[domain] = {};
    }
    this.cache[domain][field] = selector;
    this.saveCache();
  }

  public clearCache(url: string, field?: string): void {
    const domain = this.getDomain(url);
    if (this.cache[domain]) {
      if (field) {
        delete this.cache[domain][field];
      } else {
        delete this.cache[domain];
      }
      this.saveCache();
    }
  }

  public async heal(url: string, html: string, missingField: string): Promise<string | null> {
    try {
      // Create a prompt specifically to extract a CSS selector for the given field
      const prompt = `
You are an expert web scraper and DOM analyst. I am trying to extract the "${missingField}" from a web page.
My current CSS selector failed or returned null.
I will provide you with a simplified snippet of the HTML page content.
Your task is to identify the unique CSS selector that correctly points to the element containing the "${missingField}".

Return ONLY a valid JSON object with a single key "selector".
For example:
{
  "selector": ".price-block span.main-price"
}

If you cannot find it, return {"selector": null}.
      `.trim();

      const provider = LLMProviderFactory.createProvider('gemini');
      logger.info({ url, missingField }, `Triggering LLM healing to find selector for ${missingField}...`);
      
      const result = await provider.extractGenericJson<{ selector: string | null }>(html, prompt);

      if (result && result.selector) {
        logger.info({ url, missingField, selector: result.selector }, `LLM successfully generated a new selector`);
        this.setSelector(url, missingField, result.selector);
        return result.selector;
      } else {
        logger.warn({ url, missingField }, `LLM could not find a selector for ${missingField}`);
        return null; // Don't cache null so we can try again if the HTML changes
      }
    } catch (error: any) {
      logger.error({ err: error, url, missingField }, 'LLM selector healing failed');
      return null;
    }
  }
}

export const llmSelectorCache = new LLMSelectorCache();
