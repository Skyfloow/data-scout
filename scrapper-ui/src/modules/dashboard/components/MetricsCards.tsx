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
import { useGetProductsQuery } from '../../../store/apiSlice';
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
  
  const metrics = useMemo(() => {
    const rawProducts: Product[] = data?.data || [];
    const products = getLatestUniqueProducts(rawProducts);
    const amazonProducts = products.filter((p) => p.marketplace.toLowerCase().includes('amazon'));
    const etsyProducts = products.filter((p) => p.marketplace.toLowerCase().includes('etsy'));

    const buildSegment = (segment: Product[], mode: 'amazon' | 'etsy') => {
      if (segment.length === 0) {
        return {
          count: 0,
          avgPrice: '$0.00',
          avgValue: '0/100',
          avgMargin: '$0.00',
          avgTrust: '0/100',
          avgDiscount: '0%',
          specialShare: '0%',
          bestTitle: t('dashboard.noData'),
        };
      }

      let totalPrices = 0;
      let productsWithPrice = 0;
      let totalValue = 0;
      let totalMargin = 0;
      let totalTrust = 0;
      let totalDiscount = 0;
      let productsWithDiscount = 0;
      let specialCount = 0;
      let best = { score: 0, title: '' };

      segment.forEach((p) => {
        const price = getEffectivePrice(p);
        if (price > 0) {
          totalPrices += price;
          productsWithPrice++;
        }

        totalValue += calcValueScore(p.metrics);
        totalMargin += calcGrossMargin(p.metrics).marginAmount;

        const rating = p.metrics.averageRating || 0;
        const trust = mode === 'amazon'
          ? ((rating / 5) * 0.6 + (p.metrics.isAmazonChoice ? 0.2 : 0) + (p.metrics.isBestSeller ? 0.2 : 0)) * 100
          : ((rating / 5) * 0.75 + ((p.metrics.etsyMetrics?.isStarSeller || p.metrics.isStarSeller) ? 0.25 : 0)) * 100;
        totalTrust += trust;

        if (p.metrics.discountPercentage) {
          totalDiscount += p.metrics.discountPercentage;
          productsWithDiscount++;
        }

        if (mode === 'amazon' && (p.metrics.amazonMetrics?.isPrime || p.metrics.isPrime)) specialCount++;
        if (mode === 'etsy' && (p.metrics.etsyMetrics?.isDigitalDownload || p.metrics.isDigitalDownload)) specialCount++;

        const opportunity = (p.metrics.discountPercentage || 0) * ((p.metrics.reviewsCount || 0) / 10000) * (1 / Math.max(1, p.metrics.sellerCount || 1));
        if (opportunity > best.score) {
          best = { score: opportunity, title: `${p.title.substring(0, 28)}…` };
        }
      });

      const avgPrice = productsWithPrice ? totalPrices / productsWithPrice : 0;
      const avgValue = Math.round(totalValue / segment.length);
      const avgTrust = Math.round(totalTrust / segment.length);
      const avgDiscount = productsWithDiscount ? Math.round(totalDiscount / productsWithDiscount) : 0;
      const specialShare = Math.round((specialCount / segment.length) * 100);

      return {
        count: segment.length,
        avgPrice: formatCurrency(avgPrice),
        avgValue: `${avgValue}/100`,
        avgMargin: formatCurrency(totalMargin, true),
        avgTrust: `${avgTrust}/100`,
        avgDiscount: `${avgDiscount}%`,
        specialShare: `${specialShare}%`,
        bestTitle: best.title || t('dashboard.noData'),
      };
    };

    return {
      totalScraped: formatCompactNumber(products.length),
      amazon: buildSegment(amazonProducts, 'amazon'),
      etsy: buildSegment(etsyProducts, 'etsy'),
    };
  }, [data, t]);

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
          title="Amazon Count"
          value={metrics?.amazon.count || 0}
          icon={<TrendingUpIcon fontSize="small" />}
          tooltip="Количество уникальных Amazon товаров в текущем срезе."
          subtitle={`Avg price: ${metrics?.amazon.avgPrice || '$0.00'}`}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard 
          title="Etsy Count" 
          value={metrics?.etsy.count || 0} 
          subtitle={`Avg price: ${metrics?.etsy.avgPrice || '$0.00'}`}
          icon={<LocalOfferIcon sx={{ color: 'success.main' }} fontSize="small" /> }
          loading={isLoading}
          tooltip="Количество уникальных Etsy товаров в текущем срезе."
          accent="success.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard 
          title="Amazon Margin"
          value={metrics?.amazon.avgMargin || '$0.00'}
          icon={<TrendingUpIcon fontSize="small" />}
          tooltip="Суммарный расчетный margin по Amazon товарам."
          subtitle={`Discount avg: ${metrics?.amazon.avgDiscount || '0%'}`}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <MetricCard 
          title="Etsy Margin"
          value={metrics?.etsy.avgMargin || '$0.00'}
          icon={<ThumbUpAltIcon fontSize="small" />}
          tooltip="Суммарный расчетный margin по Etsy товарам."
          subtitle={`Discount avg: ${metrics?.etsy.avgDiscount || '0%'}`}
          loading={isLoading}
          accent="success.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard 
          title="Amazon Prime Share"
          value={metrics?.amazon.specialShare || '0%'}
          icon={<SpeedIcon fontSize="small" />}
          tooltip="Доля Prime среди Amazon товаров."
          subtitle={`Value: ${metrics?.amazon.avgValue || '0/100'}`}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard 
          title="Etsy Digital Share"
          value={metrics?.etsy.specialShare || '0%'}
          icon={<StarIcon fontSize="small" />}
          tooltip="Доля digital-download среди Etsy товаров."
          subtitle={`Value: ${metrics?.etsy.avgValue || '0/100'}`}
          loading={isLoading}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard 
          title="Amazon Best Opportunity"
          value={metrics?.amazon.avgTrust || '0/100'}
          icon={<EmojiObjectsIcon fontSize="small" />}
          tooltip="Trust индекс Amazon сегмента."
          subtitle={metrics?.amazon.bestTitle || t('dashboard.noData')}
          loading={isLoading}
          accent="warning.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard
          title="Etsy Trust"
          value={metrics?.etsy.avgTrust || '0/100'}
          icon={<ShoppingCartIcon fontSize="small" />}
          tooltip="Trust индекс Etsy сегмента."
          subtitle={metrics?.etsy.bestTitle || t('dashboard.noData')}
          loading={isLoading}
          accent="info.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 4 }}>
        <MetricCard
          title="Amazon Value"
          value={metrics?.amazon.avgValue || '0/100'}
          icon={<LocalOfferIcon fontSize="small" />}
          tooltip="Средний Value score по Amazon."
          subtitle={`Trust: ${metrics?.amazon.avgTrust || '0/100'}`}
          loading={isLoading}
          accent="warning.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
        <MetricCard 
          title="Etsy Value"
          value={metrics?.etsy.avgValue || '0/100'}
          icon={<FactCheckIcon fontSize="small" />}
          tooltip="Средний Value score по Etsy."
          subtitle={`Trust: ${metrics?.etsy.avgTrust || '0/100'}`}
          loading={isLoading}
          accent="primary.main"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
        <MetricCard 
          title="Marketplace Segregated KPI"
          value="ON"
          icon={<ShieldIcon fontSize="small" />}
          tooltip="KPI считаются отдельно для Amazon и Etsy, без смешения данных."
          subtitle="Amazon/Etsy metrics separated"
          loading={isLoading}
          accent="secondary.main"
        />
      </Grid>
    </Grid>
  );
}

export default React.memo(MetricsCards);
