# Dashboard Metrics Definitions (Contract)

This document fixes the current formulas and data sources used by `GET /api/metrics`.
If any formula changes, update this file and corresponding golden tests.

Programmatic contract endpoint:

- `GET /api/metrics/definitions` (versioned machine-readable contract)

## Scope

- Endpoint: `/api/metrics`
- Source records: latest unique products (identity by `asin` if present, else normalized URL)
- Price history source for anomaly checks: `PriceHistoryService.getPriceHistoryBatch`

## Price Resolution

- Effective local price:
  1. `buyBox.price`
  2. `itemPrice`
  3. `price`
- Effective USD price:
  1. `priceUSD`
  2. `itemPriceUSD`
  3. `landedPriceUSD`
  4. convert effective local price via `CurrencyService.convertToUSD(...)`

Global price metrics use effective USD price (fallback to effective local if needed).

## Global Metrics

- `totalProducts`: count of all raw stored products (`crawler + firecrawl`)
- `uniqueProducts`: count after deduplication to latest unique snapshot
- `averagePrice`: mean of effective price values for products with valid positive price
- `medianPrice`: median of effective price values
- `distributionBySource`: counts by `marketplace`
- `ratingsHistogram`: counts by rounded `averageRating`

### Quality & Stability

- `dataCoveragePercent`:
  - per product score from 5 fields:
    - valid title (`title` and not `Unknown Product`)
    - effective price > 0
    - `brand`
    - `imageUrl`
    - `availability`
  - coverage = round((sum(filled/5) / uniqueProducts) * 100)

- `anomaliesCount`:
  - for each product with history length >= 2:
  - `diffPct = abs(latest - previous) / previous`
  - anomaly if `diffPct > 0.30`

- `stableProductsPercent`:
  - `round(((uniqueProducts - anomaliesCount) / uniqueProducts) * 100)`

### Commercial Coverage

- `buyBoxCoveragePercent`: percent with `buyBox.price > 0`
- `discountedProductsPercent`: percent with `discountPercentage > 0`
- `primeProductsPercent`: percent with `isPrime === true`
- `avgSellerCount`:
  - per product: `sellerCount` if positive, else `offers.length` if present, else `0`
  - average across all unique products, fixed to 2 decimals

## Segment Metrics

Returned in `segmentMetrics.amazon` and `segmentMetrics.etsy`.
Segments are selected by `marketplace` containing `amazon` or `etsy` (case-insensitive).

- `count`: products in segment
- `avgPrice`: mean effective price within segment
- `avgMargin`: mean of estimated margin amount
  - margin amount per product = `effectivePrice * 0.5`
- `avgValueScore`:
  - `ratingFactor = (averageRating / 5) * 50`
  - `discountFactor = min(discountPercentage / 50, 1) * 30`
  - `reviewFactor = min(reviewsCount / 10000, 1) * 20`
  - value score = `round(ratingFactor + discountFactor + reviewFactor)`
  - segment average is rounded integer
- `avgTrust`:
  - Amazon: `((rating/5)*0.6 + AmazonChoice*0.2 + BestSeller*0.2) * 100`
  - Etsy: `((rating/5)*0.75 + StarSeller*0.25) * 100`
  - segment average is rounded integer
- `avgDiscount`: rounded mean over only products with discount > 0
- `specialSharePercent`:
  - Amazon: share where `amazonMetrics.isPrime || isPrime`
  - Etsy: share where `etsyMetrics.isDigitalDownload || isDigitalDownload`
- `bestOpportunityTitle`:
  - max by `discountPercentage * (reviewsCount / 10000) * (1 / max(1, sellerCount|offers.length|1))`

## Regression Guard

- Golden tests: `server/tests/dashboardMetrics.test.ts`
- Required when editing formulas:
  1. update this document
  2. update test expectations
  3. run `npm test` in `server`
