import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetPriceHistoryQuery, useGetProductByIdQuery } from '../store/apiSlice';
import { resolveMetricPrice } from '../utils/metrics';
import { formatCompactNumber, formatCurrency } from '../utils/formatters';
import { exportElementToPdf } from '../utils/export';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';

function MetricItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stack-col" style={{ gap: 4 }}>
      <span className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export default function ProductDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetProductByIdQuery(id || '');
  const product = data?.data;
  const m = product?.metrics;

  const { data: historyData } = useGetPriceHistoryQuery(product?.url || '', { skip: !product?.url });

  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

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
  const buyBox = m.amazonMetrics?.buyBox || m.buyBox;
  const buyBoxType = buyBox?.isAmazon ? 'Amazon' : buyBox?.isFBA ? 'FBA' : buyBox ? 'FBM' : t('product.unknown');
  const rawProductJson = JSON.stringify(product, null, 2);

  const exportProductPdf = async () => {
    if (!pdfRef.current) return;
    setIsExportingPdf(true);
    try {
      await exportElementToPdf(pdfRef.current, `product-${product.id}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>${effectivePrice.toFixed(2)}</div>
                  {m.originalPrice && m.originalPrice > effectivePrice ? (
                    <div style={{ textDecoration: 'line-through', color: 'var(--fg-muted)' }}>${m.originalPrice.toFixed(2)}</div>
                  ) : null}
                  {m.discountPercentage ? <Badge variant="success">-{m.discountPercentage}%</Badge> : null}
                </div>
                <div className="muted" style={{ fontSize: '0.84rem' }}>
                  {t('product.priceObserved')}: {new Date(observedAt).toLocaleString()}
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
              <MetricItem label={t('product.offersCount')} value={m.offers?.length || m.sellerCount || 0} />
              <MetricItem label={t('product.buyBoxType')} value={buyBoxType} />
              <MetricItem label={t('product.scrapedAt')} value={new Date(product.scrapedAt).toLocaleString()} />
            </div>
          </CardContent>
        </Card>

        <Card data-pdf-block>
          <CardContent>
            <CardTitle>{t('product.rawDates')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              <MetricItem label={t('product.rawObservedAt')} value={rawObservedAt} />
              <MetricItem label={t('product.rawScrapedAt')} value={rawScrapedAt} />
            </div>
          </CardContent>
        </Card>

        <Card data-pdf-block>
          <CardContent>
            <CardTitle>{t('product.rawJson')}</CardTitle>
            <Separator style={{ margin: '10px 0 12px' }} />
            <pre
              style={{
                margin: 0,
                maxHeight: 320,
                overflow: 'auto',
                padding: 12,
                borderRadius: 8,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
                fontSize: '0.78rem',
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {rawProductJson}
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
                <MetricItem label={t('product.firstObserved')} value={historyStats.firstObserved?.toLocaleString() || '—'} />
                <MetricItem label={t('product.lastObserved')} value={historyStats.lastObserved?.toLocaleString() || '—'} />
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
  );
}
