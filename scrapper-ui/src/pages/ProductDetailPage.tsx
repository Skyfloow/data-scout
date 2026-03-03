import React, { useMemo } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip title={text} arrow placement="top">
      <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help', ml: 0.75 }} />
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
    <Card elevation={2} sx={{ height: '100%' }}>
      <CardContent sx={{ textAlign: 'center', p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.75, gap: 0.5, overflow: 'hidden' }}>
          <Tooltip title={tooltip} arrow placement="top">
            <InfoOutlinedIcon sx={{ fontSize: 13, color: 'text.disabled', cursor: 'help', flexShrink: 0 }} />
          </Tooltip>
          <Typography variant="caption" color="text.secondary" fontWeight="700" textTransform="uppercase" letterSpacing="0.6px" noWrap>
            {label}
          </Typography>
        </Box>
        <Typography
          variant={multilineValue ? 'h6' : 'h5'}
          fontWeight="700"
          color={color || 'text.primary'}
          noWrap={!multilineValue}
          sx={
            multilineValue
              ? {
                  whiteSpace: 'pre-line',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  lineHeight: 1.25,
                }
              : undefined
          }
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { data, isLoading, error } = useGetProductByIdQuery(id || '');
  const product = data?.data;
  const m = product?.metrics;

  const { data: historyData } = useGetPriceHistoryQuery(product?.url || '', {
    skip: !product?.url,
  });

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
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !product || !m) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error" variant="h6">
          Product not found (ID: {id})
        </Typography>
        <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  const effectivePrice = resolveMetricPrice(m);
  const listingStrength = calcListingStrength(m, product.title);
  const salesVolume = calcSalesVolume(m);
  const revenuePotential = calcRevenuePotential(m);
  const competitionOpp = calcCompetitionOpportunity(m);
  const trustIndex = calcTrustIndex(m);
  const nicheScore = calcNicheScore(m);
  const valueScore = calcValueScore(m);
  const { marginAmount, marginPercent } = calcGrossMargin(m);

  const isDark = theme.palette.mode === 'dark';
  const chartTextPrimary = theme.palette.text.primary;
  const chartTextSecondary = theme.palette.text.secondary;
  const axisStroke = alpha(theme.palette.text.secondary, isDark ? 0.35 : 0.25);
  const gridLine = alpha(theme.palette.divider, isDark ? 0.65 : 1);

  const bsrOpt = m.bsrCategories && m.bsrCategories.length > 0 ? {
    backgroundColor: 'transparent',
    textStyle: { color: chartTextSecondary, fontFamily: 'Inter, Helvetica, Arial, sans-serif' },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? alpha('#0B1220', 0.95) : alpha('#FFFFFF', 0.98),
      borderColor: alpha(theme.palette.divider, 0.7),
      textStyle: { color: chartTextPrimary },
    },
    xAxis: {
      type: 'category' as const,
      data: m.bsrCategories.map((b) => b.category.substring(0, 20)),
      axisLabel: { fontSize: 11, rotate: 15, color: chartTextSecondary },
      axisLine: { lineStyle: { color: axisStroke } },
      axisTick: { lineStyle: { color: axisStroke } },
    },
    yAxis: {
      type: 'value' as const,
      name: 'Rank',
      inverse: true,
      nameTextStyle: { color: chartTextSecondary },
      axisLabel: { color: chartTextSecondary },
      splitLine: { lineStyle: { color: gridLine } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: m.bsrCategories.map((b) => b.rank),
      itemStyle: { color: theme.palette.primary.main, borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 60,
    }],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  } : null;

  const gaugeOpt = {
    series: [{
      type: 'gauge',
      min: 0,
      max: 10,
      progress: {
        show: true,
        width: 18,
        itemStyle: {
          color: listingStrength >= 7 ? theme.palette.success.main : listingStrength >= 4 ? theme.palette.warning.main : theme.palette.error.main,
        },
      },
      pointer: { show: false },
      axisLine: { lineStyle: { width: 18, color: [[1, alpha(theme.palette.divider, isDark ? 0.7 : 1)]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        fontSize: 32,
        fontWeight: 'bold',
        color: chartTextPrimary,
        offsetCenter: [0, '0%'],
        formatter: '{value}/10',
      },
      data: [{ value: Math.round(listingStrength * 10) / 10 }],
    }],
  };

  const offerBars = (m.offers || [])
    .slice()
    .sort((a, b) => a.price - b.price)
    .slice(0, 8);

  const offersOpt = offerBars.length > 0 ? {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (p: any) => `<b>${offerBars[p[0].dataIndex]?.sellerName || ''}</b><br/>$${p[0].value}`,
    },
    xAxis: {
      type: 'value' as const,
      axisLabel: { color: chartTextSecondary },
      splitLine: { lineStyle: { color: gridLine } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category' as const,
      data: offerBars.map((o) => o.sellerName.substring(0, 18)),
      axisLabel: { color: chartTextSecondary },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: offerBars.map((o) => Number(o.price.toFixed(2))),
      itemStyle: { color: theme.palette.info.main, borderRadius: [0, 4, 4, 0] },
      barMaxWidth: 20,
    }],
    grid: { left: '2%', right: '4%', bottom: '3%', containLabel: true },
  } : null;

  const historyOpt = historySeries.length > 1 ? {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (p: any) => `Time: <b>${p[0].axisValue}</b><br/>Price: <b>$${p[0].value}</b>`,
    },
    xAxis: {
      type: 'category' as const,
      data: historySeries.map((x) => x.time.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
      axisLabel: { color: chartTextSecondary, rotate: 20, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: chartTextSecondary },
      splitLine: { lineStyle: { color: gridLine } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'line',
      data: historySeries.map((x) => Number(x.price.toFixed(2))),
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 3, color: theme.palette.warning.main },
      itemStyle: { color: theme.palette.warning.main },
      areaStyle: { color: alpha(theme.palette.warning.main, 0.18) },
    }],
    grid: { left: '2%', right: '2%', bottom: '8%', containLabel: true },
  } : null;

  const observedAt = m.buyBox?.observedAt || m.priceObservedAt || m.itemPriceObservedAt || product.scrapedAt;
  const buyBoxType = m.buyBox?.isAmazon ? 'Amazon' : m.buyBox?.isFBA ? 'FBA' : m.buyBox ? 'FBM' : 'Unknown';

  return (
    <Box>
      <Button onClick={() => navigate(-1)} startIcon={<ArrowBackIcon />} sx={{ mb: 3 }}>
        Back to Dashboard
      </Button>

      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 2 }}>
              {m.imageUrl && <Box component="img" src={m.imageUrl} alt={product.title} sx={{ width: '100%', maxWidth: 150, borderRadius: 1, objectFit: 'contain' }} />}
            </Grid>
            <Grid size={{ xs: 12, md: 10 }}>
              <Typography variant="h5" fontWeight="700" gutterBottom>
                {product.title}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {m.asin && <Chip label={`ASIN: ${m.asin}`} size="small" variant="outlined" />}
                <Chip label={`${m.currency || 'USD'}`} size="small" color="secondary" />
                {m.isAmazonChoice && <Chip label="Amazon's Choice" size="small" color="info" />}
                {m.isBestSeller && <Chip label="Best Seller" size="small" color="warning" />}
                {m.isPrime && <Chip label="Prime" size="small" sx={{ bgcolor: 'info.main', color: '#fff' }} />}
                <Chip label={product.scrapedBy} size="small" variant="outlined" />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 1.5 }} alignItems={{ xs: 'flex-start', sm: 'center' }} useFlexGap sx={{ minWidth: 0, maxWidth: '100%' }}>
                <Typography variant="h4" fontWeight="700" color="secondary.main" sx={{ lineHeight: 1.15, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ${effectivePrice.toFixed(2)}
                </Typography>
                {m.originalPrice && m.originalPrice > effectivePrice && (
                  <Typography variant="body1" color="text.secondary" sx={{ textDecoration: 'line-through', flexShrink: 0 }}>
                    ${m.originalPrice.toFixed(2)}
                  </Typography>
                )}
                {m.discountPercentage ? <Chip label={`-${m.discountPercentage}%`} size="small" color="success" sx={{ flexShrink: 0 }} /> : null}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Price observed: {new Date(observedAt).toLocaleString()}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="Sales/mo" value={formatCompactNumber(salesVolume)} tooltip="Ожидаемые продажи в месяц (на основе позиции BSR)." color="secondary.main" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="Revenue/mo" value={formatCurrency(revenuePotential, true)} tooltip="Потенциальная выручка в месяц." color="secondary.main" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard
            label="Est. Margin"
            value={`${formatCurrency(marginAmount, true)}\n(${marginPercent}%)`}
            tooltip="Прогноз gross прибыли по реальной цене."
            color="success.main"
            multilineValue
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="BuyBox Type" value={buyBoxType} tooltip="Кто держит Buy Box: Amazon/FBA/FBM." />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="Sellers" value={m.sellerCount || m.offers?.length || 0} tooltip="Количество продавцов и офферов." />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="Trust" value={`${trustIndex}/100`} tooltip="Рейтинг доверия (rating + badges)." />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="Competition" value={`${competitionOpp}/100`} tooltip="Шанс входа в нишу." />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="Value Score" value={`${valueScore}/100`} tooltip="Ценность предложения (rating/discount/reviews)." color="success.main" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
          <StatCard label="Niche Score" value={`${nicheScore}/100`} tooltip="Сводная привлекательность ниши." />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" fontWeight="600" color="text.primary">
                  Listing Strength
                </Typography>
                <InfoTip text="Score 0-10: title, rating, reviews, images, features, badges." />
              </Box>
              <Box sx={{ height: 250 }}>
                <ReactECharts option={gaugeOpt} style={{ height: '100%' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card elevation={2}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" fontWeight="600" color="text.primary">
                  Price History
                </Typography>
                <InfoTip text="История реальной цены по наблюдениям (buyBox/itemPrice)." />
              </Box>
              <Box sx={{ height: 250 }}>
                {historyOpt ? (
                  <ReactECharts option={historyOpt} style={{ height: '100%' }} />
                ) : (
                  <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography color="text.secondary">Недостаточно данных по истории цены</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {offersOpt && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Card elevation={2}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" fontWeight="600" color="text.primary">
                    Offers Price Ladder
                  </Typography>
                  <InfoTip text="Топ офферов по цене: сравнение продавцов." />
                </Box>
                <Box sx={{ height: 250 }}>
                  <ReactECharts option={offersOpt} style={{ height: '100%' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {bsrOpt && (
          <Grid size={{ xs: 12, md: offersOpt ? 6 : 12 }}>
            <Card elevation={2}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" fontWeight="600" color="text.primary">
                    BSR by Category
                  </Typography>
                  <InfoTip text="Best Seller Rank по категориям. Ниже = лучше." />
                </Box>
                <Box sx={{ height: 250 }}>
                  <ReactECharts option={bsrOpt} style={{ height: '100%' }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {m.features && m.features.length > 0 && (
        <Card elevation={2} sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="600" gutterBottom>
              Bullet Points / Features
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {m.features.map((f, i) => (
              <Typography key={i} variant="body2" color="text.secondary" sx={{ mb: 1, pl: 2, borderLeft: '3px solid', borderColor: 'secondary.main' }}>
                {f}
              </Typography>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
