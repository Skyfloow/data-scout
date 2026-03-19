export type ScraperType = 'crawler' | 'firecrawl';
export type JobStatus = 'pending' | 'completed' | 'failed';

export interface DashboardMetrics {
  averagePrice: number;
  medianPrice?: number;
  distributionBySource: Record<string, number>;
  ratingsHistogram: Record<string, number>;
  totalProducts: number;
  uniqueProducts: number;
  productsWithPrice: number;
  productsWithRating: number;
  ratingCoveragePercent: number;
  amazonProducts: number;
  etsyProducts: number;
  marketplaceShare: {
    amazon: number;
    etsy: number;
  };
}

// ─── Offer from a single seller ───
export interface Offer {
  offerId?: string;
  offerUrl?: string;
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
  attribute: string;
  value: string;
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
  stockCount?: number;
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

  // Listing data (Keepa-like)
  isPrime?: boolean;
  variations?: Variation[];
  aPlusContent?: string;
  videoCount?: number;
  frequentlyBoughtTogether?: RelatedProduct[];
  customersAlsoViewed?: RelatedProduct[];

  // Market snapshot (Keepa-like)
  bsrCategories?: BsrCategory[];
  bestSellerRank?: string;
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
  bestsellerBadge?: boolean;
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

export interface ScrapeJob {
  jobId: string;
  url: string;
  scraper: ScraperType;
  status: JobStatus;
  createdAt: string;
  resultId?: string;
  error?: string;
}

export type TrackingType = 'product' | 'keyword' | 'category';

export interface MonitoredEntity {
  id: string;
  type: TrackingType;
  value: string;
  marketplace: string;
  intervalHours: number;
  addedAt: string;
  lastScrapedAt?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  status: 'active' | 'paused' | 'error';
}

export interface SerpRanking {
  rank: number;
  asin: string;
  title: string;
  price?: number;
  sponsored: boolean;
}

export interface SerpResult {
  keyword: string;
  marketplace: string;
  scrapedAt: string;
  rankings: SerpRanking[];
}

export interface PriceHistoryPoint extends PriceSnapshot {}

export interface TrackerLatestProductData {
  scrapedAt: string;
  price?: number;
  currency?: string;
  asin?: string;
}

export interface TrackerLatestKeywordData {
  scrapedAt: string;
  topAsin?: string;
  topTitle?: string;
}

export type TrackerLatestData = TrackerLatestProductData | TrackerLatestKeywordData | null;

export interface TrackerResult extends MonitoredEntity {
  latestData: TrackerLatestData;
}
