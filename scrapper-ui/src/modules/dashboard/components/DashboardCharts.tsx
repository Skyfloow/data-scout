import React, { useMemo } from 'react';
import { Box, Card, CardContent, CircularProgress, Grid, Tooltip, Typography, useTheme } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReactECharts from 'echarts-for-react';
import { useGetProductsQuery } from '../../../store/apiSlice';
import { Product } from '../../../types';
import { formatCompactNumber } from '../../../utils/formatters';
import { getEffectivePrice, getLatestUniqueProducts } from '../../../utils/productAnalytics';

function ChartCard({ title, tooltip, children, height = 300 }: { title: string; tooltip: string; children: React.ReactNode; height?: number }) {
  return (
    <Card elevation={2} sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
          <Tooltip title={tooltip} arrow placement="top">
            <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled', cursor: 'help', flexShrink: 0 }} />
          </Tooltip>
          <Typography variant="subtitle1" fontWeight="700" noWrap>
            {title}
          </Typography>
        </Box>
        <Box sx={{ height }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export default function DashboardCharts() {
  const { data, isLoading } = useGetProductsQuery({});
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const textColor = theme.palette.text.secondary;
  const borderColor = theme.palette.divider;
  const blue = theme.palette.primary.main;
  const cyan = theme.palette.info.main;
  const amber = theme.palette.warning.main;
  const green = theme.palette.success.main;
  const slate = isDark ? '#9ab0d8' : '#64748b';

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
      if (rating > 0) {
        bubbleData.push({ value: [rating, reviews, price], name: p.title.substring(0, 40) });
      }
      if (reviews > maxReviews) maxReviews = reviews;
      if (reviews > 0) reviewData.push({ name: `${p.title.substring(0, 18)}…`, reviews });

      const discount = p.metrics.discountPercentage || 0;
      if (rating > 0) {
        discountVsRatingData.push({ value: [rating, discount, price], name: p.title.substring(0, 40) });
      }
    });

    const velocityData = reviewData
      .map((d) => ({ ...d, score: Math.round((d.reviews / (maxReviews || 1)) * 100) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const priceTrend = rawProducts
      .map((p) => ({
        time: new Date(p.scrapedAt),
        price: getEffectivePrice(p),
      }))
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
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!chartData) return null;

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
        `<b>${p[0].name}</b><br/>Балл: <b>${p[0].value}/100</b><br/>Отзывы: <b>${formatCompactNumber(chartData.velocityData[p[0].dataIndex]?.reviews || 0)}</b>`,
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
        itemStyle: { color: green, opacity: 0.8, borderColor: isDark ? '#134e4a' : '#c7f9e6', borderWidth: 1.5 },
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

  return (
    <Grid container spacing={3} sx={{ mt: 1 }}>
      <Grid size={{ xs: 12, md: 4 }}>
        <ChartCard title="Выигрыш Buy Box" tooltip="Кто чаще держит Buy Box по последнему срезу уникальных товаров.">
          {chartData.dominance.length > 0 ? <ReactECharts option={dominanceOpt} style={{ height: '100%' }} /> : <EmptyChart label="Нет данных Buy Box" />}
        </ChartCard>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <ChartCard title="Ценовые уровни" tooltip="Распределение уникальных товаров по ценовым диапазонам.">
          <ReactECharts option={tierOpt} style={{ height: '100%' }} />
        </ChartCard>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <ChartCard title="Рейтинг × Отзывы" tooltip="Размер пузыря = цена, оси = рейтинг и отзывы.">
          {chartData.bubbleData.length > 0 ? <ReactECharts option={bubbleOpt} style={{ height: '100%' }} /> : <EmptyChart label="Недостаточно данных рейтинга" />}
        </ChartCard>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard title="Динамика отзывов (Топ-10)" tooltip="Нормализованный score по количеству отзывов." height={340}>
          {chartData.velocityData.length > 0 ? <ReactECharts option={velocityOpt} style={{ height: '100%' }} /> : <EmptyChart label="Нет данных по отзывам" />}
        </ChartCard>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ChartCard title="Скидка vs. Рейтинг" tooltip="Товары с высоким рейтингом и большой скидкой." height={340}>
          {chartData.discountVsRatingData.length > 0 ? <ReactECharts option={discountOpt} style={{ height: '100%' }} /> : <EmptyChart label="Нет данных по скидкам" />}
        </ChartCard>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <ChartCard title="Тренд цены (последние сканы)" tooltip="Последние наблюдения реальной цены (Buy Box приоритет)." height={320}>
          {chartData.priceTrend.length > 1 ? <ReactECharts option={trendOpt} style={{ height: '100%' }} /> : <EmptyChart label="Недостаточно точек для тренда" />}
        </ChartCard>
      </Grid>
    </Grid>
  );
}
