export type ScraperType = 'crawler' | 'firecrawl';

export type JobStatus = 'pending' | 'completed' | 'failed';

export interface ScrapeJob {
  jobId: string;
  url: string;
  status: JobStatus;
  scraper: ScraperType;
  createdAt: string;
  finishedAt?: string;
  resultId?: string;
  error?: string;
  durationMs?: number;
}

// ─── Offer from a single seller ───
export interface Offer {
  sellerName: string;
  price: number;
  currency: string;
  stockStatus: string;
  stockCount?: number | null;
  condition?: string;
  deliveryInfo?: string;
  isFBA?: boolean;
}

export interface SelectedOfferInfo {
  source: 'buybox' | 'offer' | 'unknown';
  sellerName?: string;
  price?: number;
  currency?: string;
  condition?: string;
  isFBA?: boolean;
  isAmazon?: boolean;
}

// ─── Price history snapshot ───
export interface PriceSnapshot {
  price: number;
  priceUSD?: number;
  itemPrice?: number;
  itemPriceUSD?: number;
  landedPrice?: number;
  landedPriceUSD?: number;
  currency: string;
  scrapedAt: string;
  priceObservedAt?: string;
  itemPriceObservedAt?: string;
}

// ─── Keepa-like structured types ───
export interface Variation {
  asin: string;
  attribute: string;   // e.g. "Color", "Size", "Style"
  value: string;        // e.g. "Icy Blue", "128GB"
  price?: number;
  available: boolean;
}

export interface RelatedProduct {
  asin: string;
  title: string;
  price?: number;
}

export interface BsrCategory {
  rank: number;
  category: string;
  categoryUrl?: string;
}

export interface BuyBoxInfo {
  sellerName: string;
  price: number;
  isFBA: boolean;
  isAmazon: boolean;
  observedAt?: string;
  sellerRatingPercent?: number;
  sellerRatingsCount?: number;
}

export interface LightningDeal {
  dealPrice: number;
  originalPrice: number;
  claimedPercent: number;
  endsAt?: string;
}

export interface ShippingProfileEntry {
  region: string;
  eta?: string;
  price?: number;
  currency?: string;
  raw?: string;
}

export interface AmazonMarketplaceMetrics {
  asin?: string;
  buyBox?: BuyBoxInfo;
  bsrCategories?: BsrCategory[];
  bestSellerRank?: string;
  isPrime?: boolean;
  isAmazonChoice?: boolean;
  isBestSeller?: boolean;
  isClimateFriendly?: boolean;
  sellerCount?: number;
  offers?: Offer[];
  newOffersCount?: number;
  usedOffersCount?: number;
  collectibleOffersCount?: number;
  lightningDeal?: LightningDeal;
  subscribeAndSavePrice?: number;
  subscribeAndSavePercent?: number;
}

export interface EtsyMarketplaceMetrics {
  shippingProfiles?: ShippingProfileEntry[];
  dispatchTime?: string;
  dispatchMinDays?: number;
  dispatchMaxDays?: number;
  madeToOrder?: boolean;
  materials?: string[];
  tags?: string[];
  isDigitalDownload?: boolean;
  shopAgeText?: string;
  shopAgeYears?: number;
  isStarSeller?: boolean;
  shopResponseRate?: number;
}

// ─── Main product metrics ───
export interface ProductMetrics {
  price?: number;
  priceUSD?: number;
  itemPrice?: number;
  itemPriceUSD?: number;
  priceObservedAt?: string;
  itemPriceObservedAt?: string;
  landedPrice?: number;
  landedPriceUSD?: number;
  estimatedShipping?: number;
  estimatedImportFees?: number;
  shippingAndImportCharges?: number;
  estimatedTax?: number;
  selectedOffer?: SelectedOfferInfo;
  priceAnomalyDetected?: boolean;
  priceAnomalyReason?: string;
  rawPrice?: number;
  rawItemPrice?: number;
  rawLandedPrice?: number;
  dataQualityScore?: number;
  averageRating?: number;
  reviewsCount?: number;
  viewsCount?: number;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  brand?: string;
  category?: string;
  features?: string[];
  originalPrice?: number;
  discountPercentage?: number;
  availability?: string;
  deliveryInfo?: string;
  currency?: string;
  offers?: Offer[];
  averageOfferPrice?: number;
  averageOfferPriceUSD?: number;
  lowestOfferPrice?: number;

  // Amazon identifiers
  asin?: string;

  // Product physical details
  modelNumber?: string;
  dateFirstAvailable?: string;
  warranty?: string;
  manufacturer?: string;
  countryOfOrigin?: string;

  // ─── Listing data (Keepa-like) ───
  isPrime?: boolean;
  variations?: Variation[];
  aPlusContent?: string;
  videoCount?: number;
  frequentlyBoughtTogether?: RelatedProduct[];
  customersAlsoViewed?: RelatedProduct[];

  // ─── Market snapshot (Keepa-like) ───
  bsrCategories?: BsrCategory[];
  bestSellerRank?: string;  // Legacy text field, kept for simple display
  buyBox?: BuyBoxInfo;
  isAmazonChoice?: boolean;
  isBestSeller?: boolean;
  isClimateFriendly?: boolean;
  salesVolume?: string;
  qaCount?: number;
  returnPolicy?: string;
  sellerCount?: number;
  newOffersCount?: number;
  usedOffersCount?: number;
  collectibleOffersCount?: number;
  lightningDeal?: LightningDeal;
  subscribeAndSavePrice?: number;
  subscribeAndSavePercent?: number;
  couponText?: string;

  // Etsy-oriented optional fields
  shippingProfiles?: ShippingProfileEntry[];
  dispatchTime?: string;
  dispatchMinDays?: number;
  dispatchMaxDays?: number;
  madeToOrder?: boolean;
  materials?: string[];
  tags?: string[];
  isDigitalDownload?: boolean;
  shopAgeText?: string;
  shopAgeYears?: number;
  isStarSeller?: boolean;
  shopResponseRate?: number;

  // Marketplace-specific structured blocks
  amazonMetrics?: AmazonMarketplaceMetrics;
  etsyMetrics?: EtsyMarketplaceMetrics;
}

export interface Product {
  id: string;
  title: string;
  url: string;
  marketplace: string;
  metrics: ProductMetrics;
  scrapedAt: string;
  scrapedBy: ScraperType;
  priceHistory?: PriceSnapshot[];
}

export interface ProductScrapeResult {
  product?: Product;
  error?: string;
}

export type TrackingType = 'product' | 'keyword' | 'category';

export interface MonitoredEntity {
  id: string; // uuid
  type: TrackingType;
  value: string; // URL, ASIN, Keyword, or Category Node
  marketplace: string; // e.g. 'amazon.com'
  intervalHours: number;
  addedAt: string;
  lastScrapedAt?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  status: 'active' | 'paused' | 'error';
}

export interface SerpResult {
  keyword: string;
  scrapedAt: string;
  marketplace: string;
  rankings: Array<{
    rank: number;
    asin: string;
    title: string;
    price?: number;
    sponsored: boolean;
  }>;
}

export type ScrapingStrategy = 'hybrid' | 'fast' | 'stealth';

export interface AppSettings {
  scrapingStrategy: ScrapingStrategy;
  defaultScraper: ScraperType;
  proxyMode?: 'direct' | 'free' | 'paid';
}
