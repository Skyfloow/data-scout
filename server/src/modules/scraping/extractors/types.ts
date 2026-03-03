import { ProductMetrics, Product, ScraperType } from '../../../types';
import * as cheerio from 'cheerio';

// The input for any extractor in the pipeline
export interface ExtractorContext {
  url: string;
  html: string;
  $: cheerio.CheerioAPI;
  marketplace?: string; // e.g. 'amazon', 'ebay'
}

// The output of an extractor
export interface ExtractorResult {
  metrics: Partial<ProductMetrics>;
  title?: string;
  error?: string;
  success: boolean;
}

// The core interface for all extractors
export interface IExtractor {
  extract(context: ExtractorContext): Promise<ExtractorResult>;
}

// Helpers for the pipeline orchestration
export const calculateCompletenessScore = (result: Partial<Product>): number => {
  let score = 0;
  let totalWeights = 0;
  
  const weights: Record<string, number> = {
    title: 20,
    price: 30,
    imageUrl: 10,
    description: 10,
    brand: 10,
    features: 10,
    averageRating: 10,
  };

  if (result.title) score += weights.title;
  totalWeights += weights.title;

  if (result.metrics?.price && result.metrics.price > 0) score += weights.price;
  totalWeights += weights.price;

  if (result.metrics?.imageUrl) score += weights.imageUrl;
  totalWeights += weights.imageUrl;

  if (result.metrics?.description) score += weights.description;
  totalWeights += weights.description;

  if (result.metrics?.brand) score += weights.brand;
  totalWeights += weights.brand;

  if (result.metrics?.features && result.metrics.features.length > 0) score += weights.features;
  totalWeights += weights.features;

  if (result.metrics?.averageRating && result.metrics.averageRating > 0) score += weights.averageRating;
  totalWeights += weights.averageRating;

  return Math.round((score / totalWeights) * 100);
};

export const isCriticalDataMissing = (result: Partial<Product>): boolean => {
  return !result.title || !result.metrics?.price || result.metrics.price <= 0;
};
