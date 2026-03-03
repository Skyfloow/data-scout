import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box, Grid, Skeleton, Tooltip } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import SpeedIcon from '@mui/icons-material/Speed';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StarIcon from '@mui/icons-material/Star';
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ShieldIcon from '@mui/icons-material/Shield';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useGetProductsQuery, useGetMetricsQuery } from '../../../store/apiSlice';
import { Product } from '../../../types';
import { calcValueScore, calcGrossMargin } from '../../../utils/metrics';
import { formatCompactNumber, formatCurrency } from '../../../utils/formatters';
import { useTranslation } from 'react-i18next';
import { getEffectivePrice, getLatestUniqueProducts } from '../../../utils/productAnalytics';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  tooltip: string;
  loading?: boolean;
  accent?: string;
}

function MetricCard({ title, value, subtitle, icon, tooltip, loading, accent }: MetricCardProps) {
  return (
    <Card elevation={2} sx={{ height: '100%' }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header row: info icon + label + spacer + icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, minHeight: 28 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflow: 'hidden', mr: 1 }}>
            <Tooltip title={tooltip} arrow placement="top">
              <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled', cursor: 'help', flexShrink: 0 }} />
            </Tooltip>
            <Typography
              color="text.secondary"
              variant="caption"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="0.8px"
              noWrap
            >
              {title}
            </Typography>
          </Box>
          <Box sx={{ color: accent || 'secondary.main', opacity: 0.85, flexShrink: 0 }}>
            {icon}
          </Box>
        </Box>

        {/* Value */}
        {loading ? (
          <Skeleton variant="text" sx={{ fontSize: '2rem', width: '60%' }} />
        ) : (
          <Typography
            variant="h4"
            fontWeight="700"
            color={accent ? undefined : 'text.primary'}
            sx={{ color: accent, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {value}
          </Typography>
        )}

        {/* Subtitle */}
        {subtitle && (
          loading ? (
            <Skeleton variant="text" sx={{ width: '80%', mt: 0.75 }} />
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
            >
              {subtitle}
            </Typography>
          )
        )}
      </CardContent>
    </Card>
  );
}

function MetricsCards() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetProductsQuery({});
  const { data: metricsData, isLoading: isMetricsLoading } = useGetMetricsQuery();
  
  const metrics = useMemo(() => {
    const rawProducts: Product[] = data?.data || [];
    const products = getLatestUniqueProducts(rawProducts);
    if (products.length === 0) return null;

    let totalPrices = 0, productsWithPrice = 0;
    let totalDiscount = 0, productsWithDiscount = 0;
    let fbaCount = 0;
    let totalTrust = 0;
    let totalValue = 0;
    let totalMargin = 0;
    let bestOpportunity = { score: 0, name: '' };

    products.forEach(p => {
      const price = getEffectivePrice(p);
      if (price && price > 0) { totalPrices += price; productsWithPrice++; }

      if (p.metrics.discountPercentage) {
        totalDiscount += p.metrics.discountPercentage;
        productsWithDiscount++;
      }

      if (p.metrics.buyBox?.isFBA) fbaCount++;

      const rating = p.metrics.averageRating || 0;
      const trust = ((rating / 5) * 0.6 + (p.metrics.isAmazonChoice ? 0.2 : 0) + (p.metrics.isBestSeller ? 0.2 : 0)) * 100;
      totalTrust += trust;

      // Value Score from utility
      totalValue += calcValueScore(p.metrics);
      
      // Global Gross Margin estimation
      const { marginAmount } = calcGrossMargin(p.metrics);
      totalMargin += marginAmount;

      // Opportunity: discount × (reviews/10000) × (1/sellerCount)
      const discount = p.metrics.discountPercentage || 0;
      const reviews = p.metrics.reviewsCount || 0;
      const sellers = p.metrics.sellerCount || 1;
      const opportunity = discount * (reviews / 10000) * (1 / sellers);
      if (opportunity > bestOpportunity.score) {
        bestOpportunity = { score: opportunity, name: p.title.substring(0, 28) + '…' };
      }
    });

    const avgPrice = productsWithPrice > 0 ? (totalPrices / productsWithPrice) : 0;
    const avgDiscount = productsWithDiscount > 0 ? Math.round(totalDiscount / productsWithDiscount) : 0;
    const fbaPercent = Math.round((fbaCount / products.length) * 100);
    const avgTrust = Math.round(totalTrust / products.length);
    const avgValue = Math.round(totalValue / products.length);

    return {
      totalScraped: formatCompactNumber(metricsData?.uniqueProducts || products.length),
      avgPrice: formatCurrency(avgPrice),
      avgDiscount: avgDiscount > 0 ? `${avgDiscount}%` : t('dashboard.noData'),
      fbaPercent: `${fbaPercent}%`,
      trustIndex: `${avgTrust}/100`,
      valueScore: `${avgValue}/100`,
      totalMarginFormatted: formatCurrency(totalMargin, true),
      opportunityScore: bestOpportunity.score > 0 ? bestOpportunity.score.toFixed(1) : '0',
      opportunityName: bestOpportunity.name || t('dashboard.noData'),
    };
  }, [data, metricsData?.uniqueProducts, t]);

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard 
          title={t('dashboard.totalScraped')}
          value={metrics?.totalScraped || 0}
          icon={<ShoppingCartIcon fontSize="small" />}
          tooltip={t('dashboard.totalScrapedTooltip')}
          subtitle={t('dashboard.productsInDb')}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard
          title="Median Price"
          value={formatCurrency(metricsData?.medianPrice || 0)}
          icon={<TrendingUpIcon fontSize="small" />}
          tooltip="Медианная цена по последнему состоянию уникальных товаров."
          subtitle="Устойчива к ценовым выбросам"
          loading={isMetricsLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard 
          title={t('dashboard.estMargin')} 
          value={metrics?.totalMarginFormatted || '$0'} 
          subtitle={t('dashboard.grossProfitForecast')}
          icon={<LocalOfferIcon sx={{ color: 'success.main' }} fontSize="small" /> }
          loading={isLoading}
          tooltip={t('dashboard.estMarginTooltip')}
          accent="success.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard 
          title={t('dashboard.avgPrice')}
          value={metrics?.avgPrice || '$0.00'}
          icon={<TrendingUpIcon fontSize="small" />}
          tooltip={t('dashboard.avgPriceTooltip')}
          subtitle={`${t('dashboard.discount')}: ${metrics?.avgDiscount || '0%'}`}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard 
          title={t('dashboard.avgValue')}
          value={metrics?.valueScore || '0/100'}
          icon={<ThumbUpAltIcon fontSize="small" />}
          tooltip={t('dashboard.avgValueTooltip')}
          subtitle={t('dashboard.priceQualityRatio')}
          loading={isLoading}
          accent="success.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard 
          title={t('dashboard.fbaShare')}
          value={metrics?.fbaPercent || '0%'}
          icon={<SpeedIcon fontSize="small" />}
          tooltip={t('dashboard.fbaShareTooltip')}
          subtitle={t('dashboard.useAmazonWarehouse')}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard 
          title={t('dashboard.marketTrust')}
          value={metrics?.trustIndex || '0/100'}
          icon={<StarIcon fontSize="small" />}
          tooltip={t('dashboard.marketTrustTooltip')}
          subtitle={t('dashboard.trustIndex')}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard 
          title={t('dashboard.bestFind')}
          value={metrics?.opportunityScore || '0'}
          icon={<EmojiObjectsIcon fontSize="small" />}
          tooltip={t('dashboard.bestFindTooltip')}
          subtitle={metrics?.opportunityName || t('dashboard.noData')}
          loading={isLoading}
          accent="warning.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard
          title="BuyBox Coverage"
          value={`${metricsData?.buyBoxCoveragePercent || 0}%`}
          icon={<ShoppingCartIcon fontSize="small" />}
          tooltip="Доля товаров, где удалось извлечь реальную Buy Box цену."
          subtitle={`Avg sellers: ${metricsData?.avgSellerCount || 0}`}
          loading={isMetricsLoading}
          accent="info.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard
          title="Discounted Share"
          value={`${metricsData?.discountedProductsPercent || 0}%`}
          icon={<LocalOfferIcon fontSize="small" />}
          tooltip="Процент товаров с активной скидкой."
          subtitle={`Prime share: ${metricsData?.primeProductsPercent || 0}%`}
          loading={isMetricsLoading}
          accent="warning.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
        <MetricCard 
          title={t('dashboard.coverage')}
          value={`${metricsData?.dataCoveragePercent || 0}%`}
          icon={<FactCheckIcon fontSize="small" />}
          tooltip={t('dashboard.coverageTooltip')}
          subtitle={t('dashboard.parsingQuality')}
          loading={isMetricsLoading}
          accent="primary.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
        <MetricCard 
          title={t('dashboard.priceStability')}
          value={`${metricsData?.stableProductsPercent || 100}%`}
          icon={<ShieldIcon fontSize="small" />}
          tooltip={t('dashboard.priceStabilityTooltip')}
          subtitle={`${t('dashboard.anomaliesDetected')}: ${metricsData?.anomaliesCount || 0}`}
          loading={isMetricsLoading}
          accent="secondary.main"
        />
      </Grid>
    </Grid>
  );
}

export default React.memo(MetricsCards);
