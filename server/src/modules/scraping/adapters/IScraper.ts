import { ProductScrapeResult } from '../../../types';

export interface IScraper {
  scrapeProduct(url: string): Promise<ProductScrapeResult>;
}
