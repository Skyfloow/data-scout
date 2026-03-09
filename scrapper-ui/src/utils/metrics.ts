import { ProductMetrics } from '../types';

export function resolveMetricPrice(m: ProductMetrics): number {
  return m.priceUSD || m.itemPriceUSD || m.buyBox?.price || m.itemPrice || m.price || 0;
}

/**
 * Listing Strength (0-10)
 * Multi-signal weighted score for listing quality.
 * titleArg: the product's title string (not stored in metrics)
 */
export function calcListingStrength(m: ProductMetrics, titleArg?: string): number {
  const title = titleArg || '';
  const titleScore = Math.min(title.length / 150, 1) * 2.5;            // Title quality:   0-2.5
  const reviewScore = Math.min((m.reviewsCount || 0) / 500, 1) * 2.5;  // Social proof:    0-2.5
  const ratingScore = ((m.averageRating || 0) / 5) * 2.0;              // Star rating:     0-2.0
  const imageScore  = Math.min((m.imageUrls?.length || 0) / 6, 1) * 1.5; // Media richness: 0-1.5
  const featureScore = Math.min((m.features?.length || 0) / 5, 1) * 1.0; // Bullet points:  0-1.0
  const badgeScore = (m.isAmazonChoice ? 0.5 : 0) + (m.isBestSeller ? 0.5 : 0); // Badges: 0-1.0

  return Math.min(10, titleScore + reviewScore + ratingScore + imageScore + featureScore + badgeScore);
}

/**
 * Sales Volume (estimated monthly units)
 * BSR-based heuristic: the higher the BSR rank, the lower the sales.
 */
export function calcSalesVolume(m: ProductMetrics): number {
  const salesVolumeText = m.salesVolume || '';
  if (salesVolumeText) {
    const match = salesVolumeText.match(/(\d[\d,]*)\+?/);
    if (match?.[1]) {
      const parsed = parseInt(match[1].replace(/,/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  let bsr = m.bsrCategories?.[0]?.rank;
  if (!bsr && m.bestSellerRank) {
    const rankMatch = m.bestSellerRank.match(/#?\s*([\d,]+)/);
    if (rankMatch?.[1]) {
      const parsed = parseInt(rankMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) bsr = parsed;
    }
  }
  if (!bsr || bsr <= 0) return 0;
  return Math.ceil(500_000 / Math.pow(bsr, 0.65));
}

/**
 * Revenue Potential (estimated monthly $ revenue)
 */
export function calcRevenuePotential(m: ProductMetrics): number {
  const price = resolveMetricPrice(m);
  return calcSalesVolume(m) * price;
}

/**
 * Competition Opportunity (0-100)
 * 4-factor composite: measures how easy it is to ENTER this niche.
 * Higher = fewer barriers = better opportunity.
 */
export function calcCompetitionOpportunity(m: ProductMetrics): number {
  const sellerPressure  = Math.min((m.sellerCount || 1), 20) / 20;       // many sellers = less opp
  const reviewBarrier   = Math.min((m.reviewsCount || 0), 5000) / 5000;  // high reviews = harder
  const priceElasticity = resolveMetricPrice(m) > 30 ? 0.1 : 0;  // margin headroom
  const noBadge         = (m.isAmazonChoice || m.isBestSeller) ? 0 : 0.2; // no incumbent = room

  const rawScore = (1 - sellerPressure) * 0.35
                 + (1 - reviewBarrier) * 0.35
                 + priceElasticity
                 + noBadge;
  return Math.round(rawScore * 100);
}

/**
 * Trust Index (0-100)
 * Composite buyer-credibility score.
 * Formula: (rating/5×60%) + Choice×20% + BestSeller×20%
 */
export function calcTrustIndex(m: ProductMetrics): number {
  const rating = m.averageRating || 0;
  return Math.round(
    ((rating / 5) * 0.6 + (m.isAmazonChoice ? 0.2 : 0) + (m.isBestSeller ? 0.2 : 0)) * 100
  );
}

/**
 * Value Score (0-100)
 * How well-priced this product is for what it offers.
 * Formula: (rating/5 × 50%) + (discount × 30%) + (reviews_normalized × 20%)
 * High Value Score = great deal with strong social proof.
 */
export function calcValueScore(m: ProductMetrics): number {
  const ratingFactor   = ((m.averageRating || 0) / 5) * 50;
  const discountFactor = Math.min((m.discountPercentage || 0) / 50, 1) * 30; // caps at 50% off
  const reviewFactor   = Math.min((m.reviewsCount || 0) / 10_000, 1) * 20;

  return Math.round(ratingFactor + discountFactor + reviewFactor);
}

/**
 * Gross Margin / ROI Forecast
 * Returns the estimated dollar profit and percentage margin.
 * Assumes 35% Amazon FBA Fees + Referral, and 15% estimated COGS.
 */
export function calcGrossMargin(m: ProductMetrics): { marginAmount: number; marginPercent: number } {
  const price = resolveMetricPrice(m);
  if (!price) return { marginAmount: 0, marginPercent: 0 };
  
  // Standard heuristic model: 50% of revenue goes to Amazon fees and COGS
  const fbaFees = price * 0.35;
  const estimatedCogs = price * 0.15;
  const marginAmount = price - fbaFees - estimatedCogs;
  
  const marginPercent = Math.round((marginAmount / price) * 100);
  return { marginAmount, marginPercent };
}

/**
 * Niche Score (0-100)
 * Overall niche attractiveness. Weighted composite — no double-counting.
 * Sales(40%) + Competition Opportunity(30%) + Trust(30%)
 */
export function calcNicheScore(m: ProductMetrics): number {
  const salesNorm = Math.min(calcSalesVolume(m) / 1000, 1) * 100; // caps at 1000 units/mo = 100
  const co = calcCompetitionOpportunity(m);
  const ti = calcTrustIndex(m);
  return Math.round(salesNorm * 0.40 + co * 0.30 + ti * 0.30);
}
