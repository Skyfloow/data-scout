import React, { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { useGetProductsQuery } from '../../../store/apiSlice';
import { Product } from '../../../types';
import { formatCompactNumber } from '../../../utils/formatters';
import { getEffectivePrice, getLatestUniqueProducts } from '../../../utils/productAnalytics';
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
  const { data, isLoading } = useGetProductsQuery({});

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

    const tiers: Record<string, number> = { 'Under $25': 0, '$25-50': 0, '$50-100': 0, '$100-250': 0, '$250+': 0 };
    const bubbleData: { value: number[]; name: string }[] = [];
    let maxReviews = 0;
    const reviewData: { name: string; reviews: number }[] = [];
    const discountVsRatingData: { value: number[]; name: string }[] = [];

    products.forEach((p) => {
      if (p.metrics.buyBox?.isAmazon) amazonCount++;
      else if (p.metrics.buyBox?.isFBA) fbaCount++;
      else if (p.metrics.buyBox) fbmCount++;

      const price = getEffectivePrice(p);
      if (price <= 25) tiers['Under $25']++;
      else if (price <= 50) tiers['$25-50']++;
      else if (price <= 100) tiers['$50-100']++;
      else if (price <= 250) tiers['$100-250']++;
      else tiers['$250+']++;

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
        { name: 'Amazon Direct', value: amazonCount },
        { name: 'FBA (3rd party)', value: fbaCount },
        { name: 'FBM (Merchant)', value: fbmCount },
      ].filter((d) => d.value > 0),
      tiers,
      bubbleData,
      velocityData,
      discountVsRatingData,
      priceTrend,
    };
  }, [data]);

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

  const dominanceOpt = {
    tooltip: {
      trigger: 'item' as const,
      formatter: (p: any) => `<b>${p.name}</b><br/>Товаров: <b>${p.value}</b> (${p.percent}%)`,
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
        data: chartData.dominance.map((d, i) => ({ ...d, itemStyle: { color: [blue, cyan, slate][i] } })),
      },
    ],
  };

  const tierOpt = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (p: any) => `Диапазон <b>${p[0].axisValue}</b><br/><b>${p[0].value}</b> товаров`,
    },
    xAxis: {
      type: 'category' as const,
      data: Object.keys(chartData.tiers),
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
        data: Object.values(chartData.tiers).map((v, i) => ({
          value: v,
          itemStyle: { color: [green, blue, cyan, amber, slate][i], borderRadius: [4, 4, 0, 0] },
        })),
        barMaxWidth: 52,
        label: { show: true, position: 'top' as const, color: textColor, fontSize: 11 },
      },
    ],
    grid: { left: '2%', right: '2%', bottom: '3%', containLabel: true },
  };

  const bubbleOpt = {
    tooltip: {
      formatter: (p: any) =>
        `<b>${p.data.name}</b><br/>⭐ ${p.data.value[0]}<br/>📝 ${formatCompactNumber(p.data.value[1])}<br/>💰 $${p.data.value[2]}`,
    },
    xAxis: {
      name: '⭐ Avg Rating',
      min: 0,
      max: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor },
    },
    yAxis: {
      name: '📝 Reviews',
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
      trigger: 'axis' as const,
      formatter: (p: any) =>
        `<b>${p[0].name}</b><br/>Балл: <b>${p[0].value}/100</b><br/>Отзывы: <b>${formatCompactNumber(
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
      formatter: (p: any) =>
        `<b>${p.data.name}</b><br/>⭐ ${p.data.value[0]}<br/>🏷️ ${p.data.value[1]}%<br/>💰 $${p.data.value[2]}`,
    },
    xAxis: {
      name: '⭐ Rating',
      min: 0,
      max: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      axisLabel: { color: textColor },
    },
    yAxis: {
      name: '🏷️ Discount %',
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
      trigger: 'axis' as const,
      formatter: (p: any) => `Время: <b>${p[0].axisValue}</b><br/>Цена: <b>$${p[0].value}</b>`,
    },
    xAxis: {
      type: 'category' as const,
      data: chartData.priceTrend.map((x) =>
        x.time.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      ),
      axisLabel: { color: textColor, rotate: 20, fontSize: 10 },
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
    grid: { left: '2%', right: '2%', bottom: '8%', containLabel: true },
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
          <ChartCard title="Выигрыш Buy Box" tooltip="Кто чаще держит Buy Box по последнему срезу уникальных товаров." excludeFromPdf={!hasBuyBox}>
            {hasBuyBox ? <LazyEChart option={dominanceOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label="Нет данных Buy Box" />}
          </ChartCard>
          <ChartCard title="Ценовые уровни" tooltip="Распределение уникальных товаров по ценовым диапазонам.">
            <LazyEChart option={tierOpt} style={{ height: '100%', width: '100%' }} />
          </ChartCard>
          <ChartCard title="Рейтинг × Отзывы" tooltip="Размер пузыря = цена, оси = рейтинг и отзывы." excludeFromPdf={!hasBubble}>
            {hasBubble ? <LazyEChart option={bubbleOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label="Недостаточно данных рейтинга" />}
          </ChartCard>
        </div>

        <div data-pdf-block className="grid grid-2" style={{ minWidth: 0 }}>
          <ChartCard title="Динамика отзывов (Топ-10)" tooltip="Нормализованный score по количеству отзывов." height={340} excludeFromPdf={!hasVelocity}>
            {hasVelocity ? <LazyEChart option={velocityOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label="Нет данных по отзывам" />}
          </ChartCard>
          <ChartCard title="Скидка vs. Рейтинг" tooltip="Товары с высоким рейтингом и большой скидкой." height={340} excludeFromPdf={!hasDiscount}>
            {hasDiscount ? <LazyEChart option={discountOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label="Нет данных по скидкам" />}
          </ChartCard>
        </div>

        <div data-pdf-block style={{ minWidth: 0 }}>
          <ChartCard title="Тренд цены (последние сканы)" tooltip="Последние наблюдения реальной цены (Buy Box приоритет)." height={320} excludeFromPdf={!hasTrend}>
            {hasTrend ? <LazyEChart option={trendOpt} style={{ height: '100%', width: '100%' }} /> : <EmptyChart label="Недостаточно точек для тренда" />}
          </ChartCard>
        </div>
      </div>
    </TooltipProvider>
  );
}
