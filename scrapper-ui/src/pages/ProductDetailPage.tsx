import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, FileDown, Info } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { useGetPriceHistoryQuery, useGetProductByIdQuery } from '../store/apiSlice';
import {
  calcCompetitionOpportunity,
  calcGrossMargin,
  calcListingStrength,
  calcNicheScore,
  calcRevenuePotential,
  calcSalesVolume,
  calcTrustIndex,
  calcValueScore,
  resolveMetricPrice,
} from '../utils/metrics';
import { formatCompactNumber, formatCurrency } from '../utils/formatters';
import { exportElementToPdf } from '../utils/export';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="icon-btn" style={{ width: 20, height: 20, borderRadius: 999 }}>
          <Info size={12} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function StatCard({
  label,
  value,
  tooltip,
  color,
  multilineValue = false,
}: {
  label: string;
  value: string | number;
  tooltip: string;
  color?: string;
  multilineValue?: boolean;
}) {
  return (
    <Card>
      <CardContent>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <InfoTip text={tooltip} />
          <span style={{ fontSize: '0.72rem', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</span>
        </div>
        <div
          style={{
            fontSize: multilineValue ? '1.12rem' : '1.28rem',
            fontWeight: 800,
            color: color || 'var(--fg)',
            whiteSpace: multilineValue ? 'pre-line' : 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetProductByIdQuery(id || '');
  const product = data?.data;
  const m = product?.metrics;

  const { data: historyData } = useGetPriceHistoryQuery(product?.url || '', { skip: !product?.url });

  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const historySeries = useMemo(() => {
    const history = Array.isArray(historyData?.history) ? historyData.history : [];
    return history
      .map((h: any) => {
        const observed = h.priceObservedAt || h.itemPriceObservedAt || h.scrapedAt;
        return { time: new Date(observed), price: Number(h.itemPrice || h.price || 0) };
      })
      .filter((x: any) => x.price > 0 && Number.isFinite(x.time.getTime()))
      .sort((a: any, b: any) => a.time.getTime() - b.time.getTime())
      .slice(-30);
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
        <h2 style={{ color: 'var(--danger)' }}>Product not found (ID: {id})</h2>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const effectivePrice = resolveMetricPrice(m);
  const isAmazon = product.marketplace.toLowerCase().includes('amazon');
  const isEtsy = product.marketplace.toLowerCase().includes('etsy');
  const am = m.amazonMetrics;
  const em = m.etsyMetrics;
  const listingStrength = calcListingStrength(m, product.title);
  const salesVolume = calcSalesVolume(m);
  const revenuePotential = calcRevenuePotential(m);
  const competitionOpp = calcCompetitionOpportunity(m);
  const trustIndex = calcTrustIndex(m);
  const nicheScore = calcNicheScore(m);
  const valueScore = calcValueScore(m);
  const { marginAmount, marginPercent } = calcGrossMargin(m);

  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#0ea5ff';
  const success = getComputedStyle(document.documentElement).getPropertyValue('--success').trim() || '#0cbc78';
  const warning = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#f6b631';
  const info = getComputedStyle(document.documentElement).getPropertyValue('--info').trim() || '#05a5d6';
  const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--fg-muted').trim() || '#66788f';
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#d0dce8';

  const bsrSource = am?.bsrCategories || m.bsrCategories;
  const bsrOpt = bsrSource?.length
    ? {
        tooltip: { trigger: 'axis' as const },
        xAxis: {
          type: 'category' as const,
          data: bsrSource.map((b) => b.category.substring(0, 20)),
          axisLabel: { fontSize: 11, rotate: 15, color: textSecondary },
        },
        yAxis: {
          type: 'value' as const,
          inverse: true,
          axisLabel: { color: textSecondary },
          splitLine: { lineStyle: { color: border } },
        },
        series: [{ type: 'bar', data: bsrSource.map((b) => b.rank), itemStyle: { color: primary, borderRadius: [4, 4, 0, 0] } }],
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      }
    : null;

  const gaugeOpt = {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: 10,
        progress: {
          show: true,
          width: 16,
          itemStyle: {
            color: listingStrength >= 7 ? success : listingStrength >= 4 ? warning : 'var(--danger)',
          },
        },
        pointer: { show: false },
        axisLine: { lineStyle: { width: 16 } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: { valueAnimation: true, fontSize: 30, fontWeight: 'bold', offsetCenter: [0, '0%'], formatter: '{value}/10' },
        data: [{ value: Math.round(listingStrength * 10) / 10 }],
      },
    ],
  };

  const offersSource = am?.offers || m.offers || [];
  const offerBars = offersSource
    .slice()
    .sort((a, b) => a.price - b.price)
    .slice(0, 8);

  const offersOpt = offerBars.length
    ? {
        tooltip: { trigger: 'axis' as const },
        xAxis: { type: 'value' as const, axisLabel: { color: textSecondary }, splitLine: { lineStyle: { color: border } } },
        yAxis: { type: 'category' as const, data: offerBars.map((o) => o.sellerName.substring(0, 18)), axisLabel: { color: textSecondary } },
        series: [{ type: 'bar', data: offerBars.map((o) => Number(o.price.toFixed(2))), itemStyle: { color: info, borderRadius: [0, 4, 4, 0] } }],
        grid: { left: '2%', right: '4%', bottom: '3%', containLabel: true },
      }
    : null;

  const historyOpt = historySeries.length > 1
    ? {
        tooltip: { trigger: 'axis' as const },
        xAxis: {
          type: 'category' as const,
          data: historySeries.map((x) => x.time.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
          axisLabel: { color: textSecondary, rotate: 20, fontSize: 10 },
        },
        yAxis: { type: 'value' as const, axisLabel: { color: textSecondary }, splitLine: { lineStyle: { color: border } } },
        series: [{ type: 'line', data: historySeries.map((x) => Number(x.price.toFixed(2))), smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { width: 3, color: warning }, itemStyle: { color: warning } }],
        grid: { left: '2%', right: '2%', bottom: '8%', containLabel: true },
      }
    : null;

  const observedAt = m.buyBox?.observedAt || m.priceObservedAt || m.itemPriceObservedAt || product.scrapedAt;
  const buyBox = am?.buyBox || m.buyBox;
  const buyBoxType = buyBox?.isAmazon ? 'Amazon' : buyBox?.isFBA ? 'FBA' : buyBox ? 'FBM' : 'Unknown';
  const etsyIsDigital = Boolean(em?.isDigitalDownload ?? m.isDigitalDownload);

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
    <TooltipProvider>
      <div className="stack-col" style={{ gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back to Dashboard
          </Button>
          <Button onClick={exportProductPdf} disabled={isExportingPdf}>
            <FileDown size={16} />
            {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
          </Button>
        </div>

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
                    {am?.asin || m.asin ? <Badge variant="outline">ASIN: {am?.asin || m.asin}</Badge> : null}
                    <Badge variant="secondary">{m.currency || 'USD'}</Badge>
                    {isAmazon && (am?.isAmazonChoice || m.isAmazonChoice) ? <Badge variant="secondary">Amazon's Choice</Badge> : null}
                    {isAmazon && (am?.isBestSeller || m.isBestSeller) ? <Badge variant="warning">Best Seller</Badge> : null}
                    {isAmazon && (am?.isPrime || m.isPrime) ? <Badge variant="default">Prime</Badge> : null}
                    {isEtsy && (em?.isStarSeller || m.isStarSeller) ? <Badge variant="secondary">Star Seller</Badge> : null}
                    {isEtsy && etsyIsDigital ? <Badge variant="success">Digital Download</Badge> : null}
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
                    Price observed: {new Date(observedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }} data-pdf-block>
            {isAmazon ? (
              <>
                <StatCard label="Sales/mo" value={formatCompactNumber(salesVolume)} tooltip="Ожидаемые продажи в месяц (на основе позиции BSR)." color="var(--primary)" />
                <StatCard label="Revenue/mo" value={formatCurrency(revenuePotential, true)} tooltip="Потенциальная выручка в месяц." color="var(--primary)" />
                <StatCard label="Est. Margin" value={`${formatCurrency(marginAmount, true)}\n(${marginPercent}%)`} tooltip="Прогноз gross прибыли по реальной цене." color="var(--success)" multilineValue />
                <StatCard label="BuyBox Type" value={buyBoxType} tooltip="Кто держит Buy Box: Amazon/FBA/FBM." />
                <StatCard label="Trust" value={`${trustIndex}/100`} tooltip="Рейтинг доверия (rating + badges)." />
                <StatCard label="Competition" value={`${competitionOpp}/100`} tooltip="Шанс входа в нишу." />
                <StatCard label="Value Score" value={`${valueScore}/100`} tooltip="Ценность предложения (rating/discount/reviews)." color="var(--success)" />
                <StatCard label="Niche Score" value={`${nicheScore}/100`} tooltip="Сводная привлекательность ниши." />
              </>
            ) : (
              <>
                <StatCard label="Margin" value={`${formatCurrency(marginAmount, true)}\n(${marginPercent}%)`} tooltip="Прогноз gross прибыли." color="var(--success)" multilineValue />
                <StatCard label="Trust" value={`${trustIndex}/100`} tooltip="Индекс доверия." />
                <StatCard label="Value" value={`${valueScore}/100`} tooltip="Ценность предложения." color="var(--success)" />
                <StatCard label="Competition" value={`${competitionOpp}/100`} tooltip="Оценка конкурентности." />
                <StatCard label="Niche" value={`${nicheScore}/100`} tooltip="Привлекательность ниши." />
                <StatCard label="Reviews" value={formatCompactNumber(m.reviewsCount || 0)} tooltip="Количество отзывов." />
              </>
            )}
          </div>

          <div className="grid grid-2" data-pdf-block>
            <Card>
              <CardContent>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CardTitle>Listing Strength</CardTitle>
                  <InfoTip text="Score 0-10: title, rating, reviews, images, features, badges." />
                </div>
                <div style={{ height: 250 }}>
                  <ReactECharts option={gaugeOpt} style={{ height: '100%' }} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <CardTitle>Price History</CardTitle>
                  <InfoTip text="История реальной цены по наблюдениям (buyBox/itemPrice)." />
                </div>
                <div style={{ height: 250 }}>
                  {historyOpt ? (
                    <ReactECharts option={historyOpt} style={{ height: '100%' }} />
                  ) : (
                    <div className="text-center muted" style={{ paddingTop: 90 }} data-pdf-exclude>
                      Недостаточно данных по истории цены
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {isAmazon && offersOpt ? (
              <Card>
                <CardContent>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CardTitle>Offers Price Ladder</CardTitle>
                    <InfoTip text="Топ офферов по цене: сравнение продавцов." />
                  </div>
                  <div style={{ height: 250 }}>
                    <ReactECharts option={offersOpt} style={{ height: '100%' }} />
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {isAmazon && bsrOpt ? (
              <Card>
                <CardContent>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CardTitle>BSR by Category</CardTitle>
                    <InfoTip text="Best Seller Rank по категориям. Ниже = лучше." />
                  </div>
                  <div style={{ height: 250 }}>
                    <ReactECharts option={bsrOpt} style={{ height: '100%' }} />
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {m.features?.length ? (
            <Card data-pdf-block>
              <CardContent>
                <CardTitle>Bullet Points / Features</CardTitle>
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

          {isEtsy && !(em?.isStarSeller || m.isStarSeller || em?.madeToOrder || m.madeToOrder || etsyIsDigital) ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)' }} data-pdf-exclude>
              <AlertCircle size={14} /> No reliable Etsy shop signals extracted.
            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
