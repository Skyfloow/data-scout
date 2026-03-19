import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ExternalLink, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetPriceHistoryQuery, useGetProductByIdQuery } from '../store/apiSlice';
import { resolveMetricPrice } from '../utils/metrics';
import { formatCompactNumber, formatCurrency } from '../utils/formatters';
import { normalizeProductForJson } from '../utils/productJson';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import LazyEChart from '../components/charts/LazyEChart';
import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

type OfferSortKey = 'seller' | 'price' | 'condition' | 'stock' | 'fba';
type SortDirection = 'asc' | 'desc';

function MetricItem({ label, value, tooltip }: { label: string; value: string | number; tooltip?: string }) {
  return (
    <div className="stack-col" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {label}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="icon-btn" style={{ width: 16, height: 16, borderRadius: 999 }}>
                <AlertCircle size={10} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function formatTimeAgo(dateValue: string | undefined, locale: string): string {
  if (!dateValue) return '—';
  const parsed = new Date(dateValue);
  if (!Number.isFinite(parsed.getTime())) return '—';

  const diffMs = parsed.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absMs < 60_000) return rtf.format(0, 'minute');
  if (absMs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute');
  if (absMs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  return rtf.format(Math.round(diffMs / 86_400_000), 'day');
}

function formatDisplayDate(dateValue: string | Date | undefined, locale: string): string {
  if (!dateValue) return '—';
  const parsed = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (!Number.isFinite(parsed.getTime())) return '—';

  const datePart = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);

  return `${datePart}, ${timePart}`;
}

function normalizeSellerDisplayName(name?: string): string {
  if (!name) return '—';
  const cleaned = name.replace(/^sold by\s+/i, '').trim();
  if (/amazon(\.[a-z.]+)?/i.test(cleaned)) return 'Amazon';
  return cleaned;
}

function getMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (token) => {
      let color = '#94a3b8';
      if (token.startsWith('"') && token.endsWith(':')) color = '#93c5fd';
      else if (token.startsWith('"')) color = '#86efac';
      else if (token === 'true' || token === 'false') color = '#fca5a5';
      else if (token === 'null') color = '#c4b5fd';
      else color = '#fcd34d';
      return `<span style="color:${color}">${token}</span>`;
    }
  );
}

export default function ProductDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetProductByIdQuery(id || '');
  const product = data?.data;
  const m = product?.metrics;

  const { data: historyData } = useGetPriceHistoryQuery(product?.url || '', { skip: !product?.url });

  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [offersSortKey, setOffersSortKey] = useState<OfferSortKey>('price');
  const [offersSortDirection, setOffersSortDirection] = useState<SortDirection>('asc');

  const historyStats = useMemo(() => {
    const history = Array.isArray(historyData?.history) ? historyData.history : [];
    const points = history
      .map((h: any) => {
        const observed = h.priceObservedAt || h.itemPriceObservedAt || h.scrapedAt;
        return { time: new Date(observed), price: Number(h.itemPrice || h.price || 0) };
      })
      .filter((x: any) => x.price > 0 && Number.isFinite(x.time.getTime()))
      .sort((a: any, b: any) => a.time.getTime() - b.time.getTime());

    if (points.length === 0) {
      return {
        pointsCount: 0,
        min: 0,
        max: 0,
        latest: 0,
        firstObserved: null as Date | null,
        lastObserved: null as Date | null,
      };
    }

    const prices = points.map((p: any) => p.price);
    return {
      pointsCount: points.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      latest: points[points.length - 1].price,
      firstObserved: points[0].time,
      lastObserved: points[points.length - 1].time,
    };
  }, [historyData?.history]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
        <span className="loader loader-dark" />
      </div>
    );
  }

  if (error || !product || !m) {
    return (
      <div className="stack-col" style={{ gap: 12 }}>
        <h2 style={{ color: 'var(--danger)' }}>{t('product.notFound', { id })}</h2>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> {t('product.backToDashboard')}
        </Button>
      </div>
    );
  }

  const isAmazon = product.marketplace.toLowerCase().includes('amazon');
  const effectivePrice = resolveMetricPrice(m);
  const observedAt = m.buyBox?.observedAt || m.priceObservedAt || m.itemPriceObservedAt || product.scrapedAt;
  const rawObservedAt = observedAt || '—';
  const rawScrapedAt = product.scrapedAt || '—';
  const rawObservedAtDisplay = formatDisplayDate(rawObservedAt, i18n.language);
  const rawScrapedAtDisplay = formatDisplayDate(rawScrapedAt, i18n.language);
  const buyBox = m.amazonMetrics?.buyBox || m.buyBox;
  const buyBoxType = buyBox?.isAmazon
    ? t('product.buyBoxAmazon')
    : buyBox?.isFBA
      ? t('product.buyBoxFba')
      : buyBox
        ? t('product.buyBoxFbm')
        : t('product.unknown');
  const buyBoxSeller = normalizeSellerDisplayName(buyBox?.sellerName);
  const observedAgo = formatTimeAgo(observedAt, i18n.language);
  const scrapedAgo = formatTimeAgo(product.scrapedAt, i18n.language);
  const savingAmount = m.originalPrice && m.originalPrice > effectivePrice ? m.originalPrice - effectivePrice : 0;
  const savingsDisplay = savingAmount > 0 ? formatCurrency(savingAmount) : t('product.noSavings');
  const offers = m.amazonMetrics?.offers || m.offers || [];
  const asinForOfferLink = m.amazonMetrics?.asin || m.asin;
  const buildOfferLink = (offer: { offerUrl?: string; offerId?: string }): string => {
    const extractSellerId = (rawUrl?: string): string | null => {
      if (!rawUrl) return null;
      try {
        const parsed = new URL(rawUrl, product.url);
        return parsed.searchParams.get('smid') || parsed.searchParams.get('seller');
      } catch {
        return null;
      }
    };

    if (asinForOfferLink) {
      try {
        const origin = new URL(product.url).origin;
        const offerListUrl = new URL(`/gp/offer-listing/${asinForOfferLink}`, origin);
        offerListUrl.searchParams.set('ie', 'UTF8');

        const sellerId = extractSellerId(offer.offerUrl);
        if (sellerId) {
          offerListUrl.searchParams.set('smid', sellerId);
        }

        if (offer.offerId && !/^aod-/i.test(offer.offerId)) {
          offerListUrl.searchParams.set('offerListingId', offer.offerId);
        }

        return offerListUrl.toString();
      } catch {
      }
    }

    if (offer.offerUrl) {
      try {
        return new URL(offer.offerUrl, product.url).toString();
      } catch {
        return offer.offerUrl;
      }
    }
    return product.url;
  };
  const otherSellerOffers = offers.filter((offer) => {
    const offerSeller = normalizeSellerDisplayName(offer.sellerName);
    if (offerSeller === '—') return false;
    const sameSeller = offerSeller.toLowerCase() === buyBoxSeller.toLowerCase();
    const samePrice = Number(offer.price || 0).toFixed(2) === Number(buyBox?.price || 0).toFixed(2);
    return !(sameSeller && samePrice);
  });
  const hasStockValues = otherSellerOffers.some((offer) => typeof offer.stockCount === 'number' && offer.stockCount > 0);
  const sortedOtherSellerOffers = (() => {
    const direction = offersSortDirection === 'asc' ? 1 : -1;
    const next = [...otherSellerOffers];
    next.sort((left, right) => {
      const leftSeller = normalizeSellerDisplayName(left.sellerName).toLowerCase();
      const rightSeller = normalizeSellerDisplayName(right.sellerName).toLowerCase();
      const leftPrice = Number(left.price || 0);
      const rightPrice = Number(right.price || 0);
      const leftCondition = (left.condition || '').toLowerCase();
      const rightCondition = (right.condition || '').toLowerCase();
      const leftStock = typeof left.stockCount === 'number' && left.stockCount > 0 ? left.stockCount : Number.POSITIVE_INFINITY;
      const rightStock = typeof right.stockCount === 'number' && right.stockCount > 0 ? right.stockCount : Number.POSITIVE_INFINITY;
      const leftFba = left.isFBA ? 1 : 0;
      const rightFba = right.isFBA ? 1 : 0;

      switch (offersSortKey) {
        case 'seller':
          return direction * leftSeller.localeCompare(rightSeller, i18n.language);
        case 'price':
          return direction * (leftPrice - rightPrice);
        case 'condition':
          return direction * leftCondition.localeCompare(rightCondition, i18n.language);
        case 'stock':
          return direction * (leftStock - rightStock);
        case 'fba':
          return direction * (leftFba - rightFba);
        default:
          return 0;
      }
    });
    return next;
  })();
  const displayedOtherSellerOffers =
    sortedOtherSellerOffers.length > 10 ? sortedOtherSellerOffers.slice(0, 10) : sortedOtherSellerOffers;
  const reportedOtherSellers = Math.max(0, Number(m.sellerCount || 0));
  const totalOtherSellerOffers = Math.max(sortedOtherSellerOffers.length, reportedOtherSellers);
  const otherSellerOffersTitle =
    sortedOtherSellerOffers.length > 10
      ? `${t('product.otherSellerOffers')} (Останнi 10)`
      : t('product.otherSellerOffers');

  const toggleOffersSort = (key: OfferSortKey) => {
    if (offersSortKey === key) {
      setOffersSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setOffersSortKey(key);
    setOffersSortDirection('asc');
  };

  const sortIndicator = (key: OfferSortKey): string => {
    if (offersSortKey !== key) return '';
    return offersSortDirection === 'asc' ? ' ▲' : ' ▼';
  };
  const offerPrices = offers.map((offer) => Number(offer.price)).filter((price) => Number.isFinite(price) && price > 0);
  const offerRangeDisplay = offerPrices.length
    ? Math.min(...offerPrices) === Math.max(...offerPrices)
      ? formatCurrency(Math.min(...offerPrices))
      : `${formatCurrency(Math.min(...offerPrices))} - ${formatCurrency(Math.max(...offerPrices))}`
    : '—';
  const stockCountDisplay = (() => {
    if (typeof m.stockCount === 'number' && m.stockCount > 0) return m.stockCount;
    const offerCounts = offers
      .map((offer) => (typeof offer.stockCount === 'number' && offer.stockCount > 0 ? offer.stockCount : 0))
      .filter((count) => count > 0);
    return offerCounts.length ? Math.max(...offerCounts) : '—';
  })();
  const badges = [
    m.isPrime ? t('table.prime') : null,
    m.isAmazonChoice ? t('product.amazonChoice') : null,
    m.isBestSeller ? t('table.bestSeller') : null,
    m.isClimateFriendly ? t('product.climateFriendly') : null,
  ].filter(Boolean);
  const badgesDisplay = badges.length ? badges.join(', ') : t('product.noBadges');
  const rankDisplay = m.bsrCategories?.[0]
    ? `#${m.bsrCategories[0].rank} · ${m.bsrCategories[0].category}`
    : m.bestSellerRank || '—';
  const rawProductJson = JSON.stringify(normalizeProductForJson(product), null, 2);
  const highlightedRawProductJson = highlightJson(rawProductJson);
  const offersInsights = (() => {
    const offersForInsights = otherSellerOffers;
    const offersWithPrice = offersForInsights.filter((offer) => Number.isFinite(Number(offer.price || 0)) && Number(offer.price || 0) > 0);
    if (offersForInsights.length === 0 || offersWithPrice.length === 0) return null;

    const prices = offersWithPrice.map((offer) => Number(offer.price || 0));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const medianPrice = getMedian(prices);
    const avgPrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    const uniqueSellers = new Set(offersForInsights.map((offer) => normalizeSellerDisplayName(offer.sellerName).toLowerCase())).size;
    const priceSpread = maxPrice - minPrice;
    const priceSpreadPct = minPrice > 0 ? (priceSpread / minPrice) * 100 : 0;
    const fbaCount = offersWithPrice.filter((offer) => Boolean(offer.isFBA)).length;
    const fbmCount = offersWithPrice.length - fbaCount;
    const fbaShare = offersWithPrice.length > 0 ? (fbaCount / offersWithPrice.length) * 100 : 0;
    const knownStockOffers = offersForInsights.filter((offer) => typeof offer.stockCount === 'number' && offer.stockCount > 0).length;
    const buyBoxPrice = Number(buyBox?.price || 0);
    const belowBuyBoxCount = buyBoxPrice > 0
      ? offersWithPrice.filter((offer) => Number(offer.price || 0) < buyBoxPrice).length
      : 0;

    const bucketCount = minPrice === maxPrice ? 1 : 5;
    const step = bucketCount === 1 ? 0 : (maxPrice - minPrice) / bucketCount;
    const priceDistribution = Array.from({ length: bucketCount }).map((_, idx) => {
      const from = minPrice + (step * idx);
      const to = idx === bucketCount - 1 ? maxPrice : minPrice + (step * (idx + 1));
      const count = offersWithPrice.filter((offer) => {
        const price = Number(offer.price || 0);
        if (idx === bucketCount - 1) return price >= from && price <= to;
        return price >= from && price < to;
      }).length;
      const label = bucketCount === 1
        ? formatCurrency(minPrice)
        : `${formatCurrency(from)} - ${formatCurrency(to)}`;
      return { label, count };
    });

    const cheapestOffers = [...offersWithPrice]
      .sort((left, right) => Number(left.price || 0) - Number(right.price || 0))
      .slice(0, 10)
      .map((offer) => ({
        seller: normalizeSellerDisplayName(offer.sellerName),
        price: Number(offer.price || 0),
      }));

    return {
      offersCount: offersForInsights.length,
      offersWithPriceCount: offersWithPrice.length,
      uniqueSellers,
      minPrice,
      maxPrice,
      medianPrice,
      avgPrice,
      priceSpread,
      priceSpreadPct,
      fbaShare,
      knownStockOffers,
      belowBuyBoxCount,
      fbaCount,
      fbmCount,
      priceDistribution,
      cheapestOffers,
    };
  })();

  const exportProductPdf = async () => {
    if (!pdfRef.current) return;
    setIsExportingPdf(true);
    try {
      const { exportElementToPdf } = await import('../utils/export');
      await exportElementToPdf(
        pdfRef.current,
        `product-${product.id}-${new Date().toISOString().slice(0, 10)}.pdf`,
        { preserveLayout: true }
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="stack-col" style={{ gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> {t('product.backToDashboard')}
        </Button>
        <Button onClick={exportProductPdf} disabled={isExportingPdf}>
          <FileDown size={16} />
          {isExportingPdf ? t('product.exportingPdf') : t('product.exportPdf')}
        </Button>
      </div>

      {!isAmazon ? (
        <Alert variant="warning">{t('product.amazonOnlyMessage')}</Alert>
      ) : null}

      <div ref={pdfRef} className="stack-col" style={{ gap: 14 }}>
        <Card data-pdf-block>
          <CardContent>
            <div className="grid" style={{ gridTemplateColumns: 'minmax(100px, 160px) 1fr', gap: 14 }}>
              <div>
                {m.imageUrl ? <img src={m.imageUrl} alt={product.title} style={{ width: '100%', borderRadius: 12, objectFit: 'contain' }} /> : null}
              </div>
              <div className="stack-col" style={{ gap: 8 }}>
                <h2 style={{ fontSize: '1.25rem', lineHeight: 1.35 }}>{product.title}</h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {m.asin ? <Badge variant="outline">ASIN: {m.asin}</Badge> : null}
                  <Badge variant="secondary">{m.currency || 'USD'}</Badge>
                  {m.isAmazonChoice ? <Badge variant="secondary">{t('product.amazonChoice')}</Badge> : null}
                  {m.isBestSeller ? <Badge variant="warning">{t('table.bestSeller')}</Badge> : null}
                  {m.isPrime ? <Badge variant="default">{t('table.prime')}</Badge> : null}
                  <Badge variant="outline">{product.scrapedBy}</Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>${effectivePrice.toFixed(2)}</div>
                    {m.originalPrice && m.originalPrice > effectivePrice ? (
                      <div style={{ textDecoration: 'line-through', color: 'var(--fg-muted)' }}>${m.originalPrice.toFixed(2)}</div>
                    ) : null}
                    {m.discountPercentage ? <Badge variant="success">-{m.discountPercentage}%</Badge> : null}
                  </div>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
                  >
                    <ExternalLink size={14} />
                    {t('table.openMarketplace')}
                  </a>
                </div>
                <div className="muted" style={{ fontSize: '0.84rem' }}>
                  {t('product.priceObserved')}: {formatDisplayDate(observedAt, i18n.language)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-pdf-block>
          <CardContent>
            <CardTitle>{t('product.coreMetrics')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              <MetricItem label={t('product.currentPrice')} value={formatCurrency(effectivePrice)} />
              <MetricItem label={t('product.rating')} value={m.averageRating ? m.averageRating.toFixed(1) : '—'} />
              <MetricItem label={t('product.reviews')} value={formatCompactNumber(m.reviewsCount || 0)} />
              <MetricItem label={t('product.offersCount')} value={totalOtherSellerOffers} />
              <MetricItem label={t('product.stockCount')} value={stockCountDisplay} />
              <MetricItem label={t('product.buyBoxType')} value={buyBoxType} tooltip={t('product.buyBoxTypeTooltip')} />
              <MetricItem label={t('product.scrapedAt')} value={formatDisplayDate(product.scrapedAt, i18n.language)} />
            </div>
          </CardContent>
        </Card>

        <Card data-pdf-block data-pdf-keep-together>
          <CardContent>
            <CardTitle>{t('product.timeToValue')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              <MetricItem label={t('product.savingsAmount')} value={savingsDisplay} />
              <MetricItem label={t('product.priceUpdated')} value={observedAgo} />
              <MetricItem label={t('product.scanFreshness')} value={scrapedAgo} />
              <MetricItem label={t('product.buyBoxSeller')} value={buyBoxSeller} />
              <MetricItem
                label={t('product.offerPriceRange')}
                value={offerRangeDisplay}
                tooltip={t('product.offerPriceRangeTooltip')}
              />
              <MetricItem label={t('product.badges')} value={badgesDisplay} tooltip={t('product.badgesTooltip')} />
              <MetricItem label={t('product.categoryRank')} value={rankDisplay} />
            </div>
          </CardContent>
        </Card>

        <Card data-pdf-block data-pdf-keep-together>
          <CardContent>
            <CardTitle>{t('product.offerInsightsTitle')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            {!offersInsights ? (
              <div className="muted">—</div>
            ) : (
              <div className="stack-col" style={{ gap: 14 }}>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                  <MetricItem label={t('product.offersAnalyzed')} value={offersInsights.offersCount} />
                  <MetricItem label={t('product.offersWithPrice')} value={offersInsights.offersWithPriceCount} />
                  <MetricItem label={t('product.uniqueSellers')} value={offersInsights.uniqueSellers} />
                  <MetricItem label={t('product.cheapestOffer')} value={formatCurrency(offersInsights.minPrice)} />
                  <MetricItem label={t('product.medianOffer')} value={formatCurrency(offersInsights.medianPrice)} />
                  <MetricItem label={t('product.averageOffer')} value={formatCurrency(offersInsights.avgPrice)} />
                  <MetricItem label={t('product.highestOffer')} value={formatCurrency(offersInsights.maxPrice)} />
                  <MetricItem label={t('product.priceSpread')} value={`${formatCurrency(offersInsights.priceSpread)} (${offersInsights.priceSpreadPct.toFixed(1)}%)`} />
                  <MetricItem label={t('product.belowBuyBox')} value={offersInsights.belowBuyBoxCount} />
                  <MetricItem label={t('product.fbaShare')} value={`${offersInsights.fbaShare.toFixed(1)}%`} />
                </div>
                <Separator style={{ margin: '2px 0 0' }} />
                <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <div style={{ border: '1px solid var(--border-soft)', borderRadius: 10, padding: 8, minWidth: 0, overflow: 'hidden' }}>
                    <div className="muted" style={{ marginBottom: 8, fontSize: '0.82rem' }}>{t('product.priceDistribution')}</div>
                    <LazyEChart
                      style={{ height: 280, width: '100%' }}
                      option={{
                        tooltip: {
                          trigger: 'axis',
                          axisPointer: { type: 'shadow' },
                        },
                        grid: { left: 26, right: 20, top: 40, bottom: 86, containLabel: true },
                        xAxis: {
                          type: 'category',
                          data: offersInsights.priceDistribution.map((row) => row.label),
                          axisTick: { alignWithLabel: true },
                          axisLine: { lineStyle: { color: '#94a3b8' } },
                          axisLabel: {
                            interval: 0,
                            rotate: 22,
                            hideOverlap: true,
                            overflow: 'truncate',
                            width: 120,
                            color: '#64748b',
                            margin: 14,
                          },
                        },
                        yAxis: {
                          type: 'value',
                          name: t('product.offerCount'),
                          minInterval: 1,
                          nameTextStyle: { color: '#64748b', padding: [0, 0, 8, 0] },
                          axisLabel: { color: '#64748b' },
                          splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
                        },
                        series: [{
                          type: 'bar',
                          data: offersInsights.priceDistribution.map((row) => row.count),
                          itemStyle: { color: '#2563eb', borderRadius: [6, 6, 0, 0] },
                          barMaxWidth: 34,
                          label: {
                            show: true,
                            position: 'top',
                            color: '#1e293b',
                            fontWeight: 600,
                            distance: 6,
                          },
                        }],
                      }}
                    />
                  </div>
                  <div style={{ border: '1px solid var(--border-soft)', borderRadius: 10, padding: 8, minWidth: 0, overflow: 'hidden' }}>
                    <div className="muted" style={{ marginBottom: 8, fontSize: '0.82rem' }}>{t('product.sellerType')}</div>
                    <LazyEChart
                      style={{ height: 280, width: '100%' }}
                      option={{
                        tooltip: { trigger: 'item' },
                        legend: { bottom: 4, left: 'center' },
                        series: [{
                          type: 'pie',
                          radius: ['45%', '70%'],
                          center: ['50%', '42%'],
                          avoidLabelOverlap: true,
                          label: { formatter: '{b}: {c}' },
                          data: [
                            { name: t('product.fbaLabel'), value: offersInsights.fbaCount, itemStyle: { color: '#16a34a' } },
                            { name: t('product.fbmLabel'), value: offersInsights.fbmCount, itemStyle: { color: '#f59e0b' } },
                          ],
                        }],
                      }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Separator style={{ margin: '2px 0 0' }} />
                  </div>
                  <div style={{ border: '1px solid var(--border-soft)', borderRadius: 10, padding: 8, gridColumn: '1 / -1', minWidth: 0, overflow: 'hidden' }}>
                    <div className="muted" style={{ marginBottom: 8, fontSize: '0.82rem' }}>{t('product.cheapestOffersChart')}</div>
                    <LazyEChart
                      style={{ height: 320, width: '100%' }}
                      option={{
                        tooltip: {
                          trigger: 'axis',
                          axisPointer: { type: 'shadow' },
                          valueFormatter: (value: number) => formatCurrency(Number(value || 0)),
                        },
                        grid: { left: 128, right: 48, top: 26, bottom: 28, containLabel: true },
                        xAxis: {
                          type: 'value',
                          name: m.currency || 'USD',
                          nameLocation: 'middle',
                          nameGap: 30,
                          axisLabel: {
                            color: '#64748b',
                            formatter: (value: number) => formatCurrency(Number(value || 0)),
                          },
                          splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
                        },
                        yAxis: {
                          type: 'category',
                          data: offersInsights.cheapestOffers.map((row) => row.seller),
                          inverse: true,
                          axisLabel: {
                            width: 100,
                            overflow: 'truncate',
                            color: '#64748b',
                            formatter: (value: string) => (value.length > 22 ? `${value.slice(0, 22)}...` : value),
                          },
                        },
                        series: [{
                          type: 'bar',
                          data: offersInsights.cheapestOffers.map((row) => row.price),
                          itemStyle: { color: '#0ea5e9', borderRadius: [0, 6, 6, 0] },
                          barMaxWidth: 20,
                          label: {
                            show: true,
                            position: 'right',
                            color: '#1e293b',
                            fontWeight: 600,
                            formatter: (params: any) => formatCurrency(Number(params.value || 0)),
                          },
                        }],
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-pdf-block>
          <CardContent>
            <CardTitle>{otherSellerOffersTitle}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            {otherSellerOffers.length === 0 ? (
              <div className="muted">—</div>
            ) : (
              <div data-pdf-expand-scroll style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>
                        <button type="button" onClick={() => toggleOffersSort('seller')} style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', color: 'inherit' }}>
                          {t('product.sellerColumn')}{sortIndicator('seller')}
                        </button>
                      </th>
                      <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>
                        <button type="button" onClick={() => toggleOffersSort('price')} style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', color: 'inherit' }}>
                          {t('product.priceColumn')}{sortIndicator('price')}
                        </button>
                      </th>
                      <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>
                        <button type="button" onClick={() => toggleOffersSort('condition')} style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', color: 'inherit' }}>
                          {t('product.conditionColumn')}{sortIndicator('condition')}
                        </button>
                      </th>
                      {hasStockValues ? (
                        <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>
                          <button type="button" onClick={() => toggleOffersSort('stock')} style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', color: 'inherit' }}>
                            {t('product.stockColumn')}{sortIndicator('stock')}
                          </button>
                        </th>
                      ) : null}
                      <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>
                        <button type="button" onClick={() => toggleOffersSort('fba')} style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', color: 'inherit' }}>
                          {t('product.fbaColumn')}{sortIndicator('fba')}
                        </button>
                      </th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>{t('product.scrapedAt')}</th>
                      <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>{t('product.linkColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedOtherSellerOffers.map((offer, idx) => (
                      <tr key={`${offer.sellerName}-${offer.price}-${idx}`}>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', textAlign: 'left' }}>
                          {normalizeSellerDisplayName(offer.sellerName)}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', textAlign: 'center', fontWeight: 700 }}>
                          {formatCurrency(Number(offer.price || 0))}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', textAlign: 'center' }}>
                          {offer.condition || '—'}
                        </td>
                        {hasStockValues ? (
                          <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', textAlign: 'center' }}>
                            {typeof offer.stockCount === 'number' && offer.stockCount > 0 ? offer.stockCount : '—'}
                          </td>
                        ) : null}
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', textAlign: 'center' }}>
                          {offer.isFBA ? t('product.yes') : t('product.no')}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', textAlign: 'right' }}>
                          {formatDisplayDate(product.scrapedAt, i18n.language)}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', textAlign: 'center' }}>
                          <a href={buildOfferLink(offer)} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center' }} title={t('product.openOfferOnAmazon')}>
                            <ExternalLink size={14} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-pdf-block>
          <CardContent>
            <CardTitle>{t('product.rawDates')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              <MetricItem label={t('product.rawObservedAt')} value={rawObservedAtDisplay} />
              <MetricItem label={t('product.rawScrapedAt')} value={rawScrapedAtDisplay} />
            </div>
          </CardContent>
        </Card>

        <Card data-pdf-block>
          <CardContent>
            <CardTitle>{t('product.rawJson')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            <pre
              data-pdf-expand-scroll
              style={{
                margin: 0,
                maxHeight: 320,
                overflow: 'auto',
                padding: 12,
                borderRadius: 8,
                background: '#0b1220',
                fontSize: '0.78rem',
                lineHeight: 1.45,
                whiteSpace: 'pre',
                color: '#e2e8f0',
              }}
            >
              <code dangerouslySetInnerHTML={{ __html: highlightedRawProductJson }} />
            </pre>
          </CardContent>
        </Card>

        <Card data-pdf-block>
          <CardContent>
            <CardTitle>{t('product.priceHistorySummary')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            {historyStats.pointsCount === 0 ? (
              <div className="muted">{t('product.noPriceHistory')}</div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                <MetricItem label={t('product.latestPrice')} value={formatCurrency(historyStats.latest)} />
                <MetricItem label={t('product.minPrice')} value={formatCurrency(historyStats.min)} />
                <MetricItem label={t('product.maxPrice')} value={formatCurrency(historyStats.max)} />
                <MetricItem label={t('product.historyPoints')} value={historyStats.pointsCount} />
                <MetricItem label={t('product.firstObserved')} value={formatDisplayDate(historyStats.firstObserved || undefined, i18n.language)} />
                <MetricItem label={t('product.lastObserved')} value={formatDisplayDate(historyStats.lastObserved || undefined, i18n.language)} />
              </div>
            )}
          </CardContent>
        </Card>

        {m.features?.length ? (
          <Card data-pdf-block>
            <CardContent>
              <CardTitle>{t('product.features')}</CardTitle>
              <Separator style={{ margin: '10px 0 12px' }} />
              <div className="stack-col" style={{ gap: 8 }}>
                {m.features.map((f, i) => (
                  <div key={i} style={{ paddingLeft: 10, borderLeft: '3px solid var(--primary)', color: 'var(--fg-muted)' }}>
                    {f}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
      </div>
    </TooltipProvider>
  );
}
