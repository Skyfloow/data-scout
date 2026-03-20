import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetProductsQuery } from '../../../store/apiSlice';
import { Product } from '../../../types';
import { formatCompactNumber } from '../../../utils/formatters';
import { getEffectivePrice, getLatestUniqueProducts } from '../../../utils/productAnalytics';
import { formatChartTime } from '../../../utils/locale';
import { Card, CardContent } from '../../../components/ui/card';
import LazyEChart from '../../../components/charts/LazyEChart';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';

function colorVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function ChartCard({
  title,
  tooltip,
  children,
  height = 300,
  excludeFromPdf = false,
}: {
  title: string;
  tooltip: string;
  children: React.ReactNode;
  height?: number;
  excludeFromPdf?: boolean;
}) {
  return (
    <Card data-pdf-exclude={excludeFromPdf ? 'true' : undefined}>
      <CardContent>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="icon-btn" style={{ width: 20, height: 20, borderRadius: 999 }}>
                <AlertCircle size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
          <h3 className="card-title">{title}</h3>
        </div>
        <div style={{ height, width: '100%', minWidth: 0, position: 'relative' }}>{children}</div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="muted">{label}</div>
    </div>
  );
}

export default function DashboardCharts() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useGetProductsQuery({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const palette = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        text: '#718096',
        border: '#d2deef',
        primary: '#0ea5ff',
        info: '#05a5d6',
        warning: '#f6b631',
        success: '#0cbc78',
        muted: '#64748b',
      };
    }

    return {
      text: colorVar('--fg-muted', '#718096'),
      border: colorVar('--border', '#d2deef'),
      primary: colorVar('--primary', '#0ea5ff'),
      info: colorVar('--info', '#05a5d6'),
      warning: colorVar('--warning', '#f6b631'),
      success: colorVar('--success', '#0cbc78'),
      muted: colorVar('--fg-muted', '#64748b'),
    };
  }, []);

  const chartData = useMemo(() => {
    const rawProducts: Product[] = data?.data || [];
    const products = getLatestUniqueProducts(rawProducts);
    if (products.length === 0) return null;

    let amazonCount = 0;
    let fbaCount = 0;
    let fbmCount = 0;

    const tiers: Record<'under25' | '25to50' | '50to100' | '100to250' | '250plus', number> = {
      under25: 0,
      '25to50': 0,
      '50to100': 0,
      '100to250': 0,
      '250plus': 0,
    };
    const bubbleData: { value: number[]; name: string }[] = [];
    let maxReviews = 0;
    const reviewData: { name: string; reviews: number }[] = [];
    const discountVsRatingData: { value: number[]; name: string }[] = [];

    products.forEach((p) => {
      if (p.metrics.buyBox?.isAmazon) amazonCount++;
      else if (p.metrics.buyBox?.isFBA) fbaCount++;
      else if (p.metrics.buyBox) fbmCount++;

      const price = getEffectivePrice(p);
      if (price <= 25) tiers.under25++;
      else if (price <= 50) tiers['25to50']++;
      else if (price <= 100) tiers['50to100']++;
      else if (price <= 250) tiers['100to250']++;
      else tiers['250plus']++;

      const rating = p.metrics.averageRating || 0;
      const reviews = p.metrics.reviewsCount || 0;
      if (rating > 0) bubbleData.push({ value: [rating, reviews, price], name: p.title.substring(0, 40) });
      if (reviews > maxReviews) maxReviews = reviews;
      if (reviews > 0) reviewData.push({ name: `${p.title.substring(0, 18)}…`, reviews });

      const discount = p.metrics.discountPercentage || 0;
      if (rating > 0) discountVsRatingData.push({ value: [rating, discount, price], name: p.title.substring(0, 40) });
    });

    const velocityData = reviewData
      .map((d) => ({ ...d, score: Math.round((d.reviews / (maxReviews || 1)) * 100) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const priceTrend = rawProducts
      .map((p) => ({ time: new Date(p.scrapedAt), price: getEffectivePrice(p) }))
      .filter((x) => x.price > 0 && Number.isFinite(x.time.getTime()))
      .sort((a, b) => a.time.getTime() - b.time.getTime())
      .slice(-16);

    return {
      dominance: [
        { key: 'amazonDirect', value: amazonCount },
        { key: 'fbaThirdParty', value: fbaCount },
        { key: 'fbmMerchant', value: fbmCount },
      ].filter((d) => d.value > 0),
      tiers,
      bubbleData,
      velocityData,
      discountVsRatingData,
      priceTrend,
    };
  }, [data, i18n.language]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
        <span className="loader loader-dark" />
      </div>
    );
  }
  if (!chartData) return null;

  const textColor = palette.text;
  const borderColor = palette.border;
  const blue = palette.primary;
  const cyan = palette.info;
  const amber = palette.warning;
  const green = palette.success;
  const slate = palette.muted;
  const echartsTooltip = {
    backgroundColor: colorVar('--bg-elevated', '#0f172a'),
    borderColor: borderColor,
    borderWidth: 1,
    textStyle: { color: textColor, fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 20px rgba(0,0,0,0.28);',
  };

  const tierKeys = ['under25', '25to50', '50to100', '100to250', '250plus'] as const;
  const tierLabels: Record<(typeof tierKeys)[number], string> = {
    under25: t('dashboard.charts.tiers.under25'),
    '25to50': t('dashboard.charts.tiers.25to50'),
    '50to100': t('dashboard.charts.tiers.50to100'),
    '100to250': t('dashboard.charts.tiers.100to250'),
    '250plus': t('dashboard.charts.tiers.250plus'),
  };

  const dominanceLabels: Record<string, string> = {
    amazonDirect: t('dashboard.charts.buyBox.amazonDirect'),
    fbaThirdParty: t('dashboard.charts.buyBox.fbaThirdParty'),
    fbmMerchant: t('dashboard.charts.buyBox.fbmMerchant'),
  };

  const dominanceSeriesData = chartData.dominance.map((d: any) => ({
    name: dominanceLabels[d.key] || String(d.key),
    value: d.value,
  }));

  const dominanceOpt = {
    tooltip: {
      ...echartsTooltip,
      trigger: 'item' as const,
      formatter: (p: any) =>
        `<b>${p.name}</b><br/>${t('dashboard.charts.productsLabel')}: <b>${p.value}</b> (${p.percent}%)`,
    },
    legend: { bottom: 0, textStyle: { color: textColor }, itemGap: 12 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '68%'],
        padAngle: 3,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold', color: textColor } },
        data: dominanceSeriesData.map((d: any, i: number) => ({ ...d, itemStyle: { color: [blue, cyan, slate][i] } })),
      },
    ],
  };

  const tierOpt = {
    tooltip: {
      ...echartsTooltip,
      trigger: 'axis' as const,
      formatter: (p: any) =>
        `${t('dashboard.charts.rangeLabel')} <b>${p[0].axisValue}</b><br/><b>${p[0].value}</b> ${t('dashboard.charts.productsLabel').toLowerCase()}`,
    },
    xAxis: {
      type: 'category' as const,
      data: tierKeys.map((k) => tierLabels[k]),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: textColor, fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor },
    },
    series: [
      {
        type: 'bar',
        data: tierKeys.map((k, i) => ({
          value: chartData.tiers[k],
          itemStyle: { color: [green, blue, cyan, amber, slate][i], borderRadius: [4, 4, 0, 0] },
        })),
        barMaxWidth: 52,
        label: { show: true, position: 'top' as const, color: textColor, fontSize: 11 },
      },
    ],
    // Slightly larger left padding prevents y-axis labels from being clipped in some locales/layouts.
    grid: { left: 44, right: 16, top: 16, bottom: 28, containLabel: true },
  };

  const bubbleOpt = {
    tooltip: {
      ...echartsTooltip,
      formatter: (p: any) =>
        `<b>${p.data.name}</b><br/>⭐ ${p.data.value[0]}<br/>${t('dashboard.charts.reviewsLabel')}: ${formatCompactNumber(p.data.value[1])}<br/>💰 $${p.data.value[2]}`,
    },
    xAxis: {
      name: `⭐ ${t('dashboard.charts.avgRatingAxis')}`,
      min: 0,
      max: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor },
    },
    yAxis: {
      name: `📝 ${t('dashboard.charts.reviewsAxis')}`,
      type: 'value' as const,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor },
    },
    series: [
      {
        type: 'scatter',
        data: chartData.bubbleData,
        symbolSize: (d: number[]) => Math.max(10, Math.min(50, (d[2] || 0) / 12)),
        itemStyle: { color: cyan, opacity: 0.75, borderColor: blue, borderWidth: 1.5 },
      },
    ],
    grid: { left: '2%', right: '4%', bottom: '3%', containLabel: true },
  };

  const velocityOpt = {
    tooltip: {
      ...echartsTooltip,
      trigger: 'axis' as const,
      formatter: (p: any) =>
        `<b>${p[0].name}</b><br/>${t('dashboard.charts.scoreLabel')}: <b>${p[0].value}/100</b><br/>${t('dashboard.charts.reviewsLabel')}: <b>${formatCompactNumber(
          chartData.velocityData[p[0].dataIndex]?.reviews || 0
        )}</b>`,
    },
    xAxis: {
      type: 'value' as const,
      max: 100,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor },
    },
    yAxis: {
      type: 'category' as const,
      data: chartData.velocityData.map((d) => d.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: textColor, fontSize: 11, width: 120, overflow: 'truncate' as const },
    },
    series: [
      {
        type: 'bar',
        data: chartData.velocityData.map((d, i) => ({
          value: d.score,
          itemStyle: { color: i === 0 ? amber : blue, borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 22,
        label: { show: true, position: 'right' as const, formatter: '{c}', color: textColor, fontSize: 11 },
      },
    ],
    grid: { left: '2%', right: '10%', bottom: '3%', containLabel: true },
  };

  const discountOpt = {
    tooltip: {
      ...echartsTooltip,
      formatter: (p: any) =>
        `<b>${p.data.name}</b><br/>⭐ ${p.data.value[0]}<br/>🏷️ ${p.data.value[1]}%<br/>💰 $${p.data.value[2]}`,
    },
    xAxis: {
      name: `⭐ ${t('dashboard.charts.ratingAxis')}`,
      min: 0,
      max: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor },
    },
    yAxis: {
      name: `🏷️ ${t('dashboard.charts.discountAxis')}`,
      type: 'value' as const,
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor, formatter: '{value}%' },
    },
    series: [
      {
        type: 'scatter',
        data: chartData.discountVsRatingData,
        symbolSize: (d: number[]) => Math.max(8, Math.min(40, (d[2] || 0) / 10)),
        itemStyle: { color: green, opacity: 0.8, borderColor: '#a4f0d0', borderWidth: 1.5 },
      },
    ],
    grid: { left: '2%', right: '4%', bottom: '3%', containLabel: true },
  };

  const trendOpt = {
    tooltip: {
      ...echartsTooltip,
      trigger: 'axis' as const,
      formatter: (p: any) =>
        `${t('dashboard.charts.timeLabel')}: <b>${p[0].axisValue}</b><br/>${t('dashboard.charts.priceLabel')}: <b>$${p[0].value}</b>`,
    },
    xAxis: {
      type: 'category' as const,
      data: chartData.priceTrend.map((x) =>
        formatChartTime(x.time, i18n.language)
      ),
      axisLabel: { color: textColor, rotate: isMobile ? 38 : 20, fontSize: isMobile ? 9 : 10 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: textColor },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'line',
        data: chartData.priceTrend.map((x) => Number(x.price.toFixed(2))),
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3, color: amber },
        itemStyle: { color: amber },
      },
    ],
    grid: { left: isMobile ? 8 : '2%', right: isMobile ? 12 : '2%', bottom: isMobile ? '14%' : '8%', containLabel: true },
  };

  const hasBuyBox = chartData.dominance.length > 0;
  const hasBubble = chartData.bubbleData.length > 0;
  const hasVelocity = chartData.velocityData.length > 0;
  const hasDiscount = chartData.discountVsRatingData.length > 0;
  const hasTrend = chartData.priceTrend.length > 1;

  return (
    <TooltipProvider>
      <div className="stack-col" style={{ gap: 18, width: '100%', minWidth: 0 }}>
        <div data-pdf-block className="grid grid-3" style={{ minWidth: 0 }}>
          <ChartCard title={t('dashboard.charts.buyBox.title')} tooltip={t('dashboard.charts.buyBox.tooltip')} height={isMobile ? 270 : 300} excludeFromPdf={!hasBuyBox}>
            {hasBuyBox ? <LazyEChart option={dominanceOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label={t('dashboard.charts.buyBox.empty')} />}
          </ChartCard>
          <ChartCard title={t('dashboard.charts.tiers.title')} tooltip={t('dashboard.charts.tiers.tooltip')} height={isMobile ? 270 : 300}>
            <LazyEChart option={tierOpt} style={{ height: '100%', width: '100%' }} />
          </ChartCard>
          <ChartCard title={t('dashboard.charts.ratingReviews.title')} tooltip={t('dashboard.charts.ratingReviews.tooltip')} height={isMobile ? 280 : 300} excludeFromPdf={!hasBubble}>
            {hasBubble ? <LazyEChart option={bubbleOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label={t('dashboard.charts.ratingReviews.empty')} />}
          </ChartCard>
        </div>

        <div data-pdf-block className="grid grid-2" style={{ minWidth: 0 }}>
          <ChartCard title={t('dashboard.charts.reviewVelocity.title')} tooltip={t('dashboard.charts.reviewVelocity.tooltip')} height={isMobile ? 300 : 340} excludeFromPdf={!hasVelocity}>
            {hasVelocity ? <LazyEChart option={velocityOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label={t('dashboard.charts.reviewVelocity.empty')} />}
          </ChartCard>
          <ChartCard title={t('dashboard.charts.discountVsRating.title')} tooltip={t('dashboard.charts.discountVsRating.tooltip')} height={isMobile ? 300 : 340} excludeFromPdf={!hasDiscount}>
            {hasDiscount ? <LazyEChart option={discountOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label={t('dashboard.charts.discountVsRating.empty')} />}
          </ChartCard>
        </div>

        <div data-pdf-block style={{ minWidth: 0 }}>
          <ChartCard title={t('dashboard.charts.priceTrend.title')} tooltip={t('dashboard.charts.priceTrend.tooltip')} height={isMobile ? 300 : 320} excludeFromPdf={!hasTrend}>
            {hasTrend ? <LazyEChart option={trendOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label={t('dashboard.charts.priceTrend.empty')} />}
          </ChartCard>
        </div>
      </div>
    </TooltipProvider>
  );
}
