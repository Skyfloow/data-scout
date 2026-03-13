import React from 'react';
import { AlertCircle, BarChart3, ShoppingBag, Sparkles, Star, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetMetricsQuery } from '../../../store/apiSlice';
import { formatCompactNumber, formatCurrency } from '../../../utils/formatters';
import { Card, CardContent } from '../../../components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';

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
    <Card>
      <CardContent>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="icon-btn" style={{ width: 20, height: 20, borderRadius: 999 }}>
                  <AlertCircle size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
            <div style={{ color: 'var(--fg-muted)', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </div>
          </div>
          <div style={{ color: accent || 'var(--primary)' }}>{icon}</div>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 36, width: '60%' }} />
        ) : (
          <div style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.02em', color: accent || 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value}
          </div>
        )}

        {subtitle ? (
          loading ? (
            <div className="skeleton" style={{ height: 16, width: '76%', marginTop: 8 }} />
          ) : (
            <div className="muted" style={{ marginTop: 8, fontSize: '0.84rem', lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricsCards() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetMetricsQuery();

  return (
    <TooltipProvider>
      <div className="metric-grid">
        <MetricCard
          title={t('dashboard.totalScraped')}
          value={formatCompactNumber(data?.uniqueProducts || 0)}
          icon={<ShoppingBag size={16} />}
          tooltip={t('dashboard.totalScrapedTooltip')}
          subtitle={`${t('dashboard.productsInDb')}: ${formatCompactNumber(data?.totalProducts || 0)}`}
          loading={isLoading}
        />
        <MetricCard
          title={t('dashboard.avgPrice')}
          value={formatCurrency(data?.averagePrice || 0)}
          icon={<TrendingUp size={16} />}
          tooltip={t('dashboard.avgPriceTooltip')}
          subtitle={`${t('dashboard.withPrice')}: ${formatCompactNumber(data?.productsWithPrice || 0)}`}
          loading={isLoading}
        />
        <MetricCard
          title={t('dashboard.medianPrice')}
          value={formatCurrency(data?.medianPrice || 0)}
          icon={<BarChart3 size={16} />}
          tooltip={t('dashboard.medianPriceTooltip')}
          subtitle={t('dashboard.medianPriceSubtitle')}
          loading={isLoading}
        />
        <MetricCard
          title={t('dashboard.amazonProducts')}
          value={formatCompactNumber(data?.amazonProducts || 0)}
          icon={<Sparkles size={16} />}
          tooltip={t('dashboard.amazonProductsTooltip')}
          subtitle={t('dashboard.percentOfBase', { value: data?.marketplaceShare?.amazon || 0 })}
          loading={isLoading}
        />
        <MetricCard
          title={t('dashboard.amazonShare')}
          value={`${data?.marketplaceShare?.amazon || 0}%`}
          icon={<Star size={16} />}
          tooltip={t('dashboard.amazonShareTooltip')}
          subtitle={t('dashboard.fromUniqueProducts', { value: formatCompactNumber(data?.uniqueProducts || 0) })}
          loading={isLoading}
          accent="var(--success)"
        />
        <MetricCard
          title={t('dashboard.withRating')}
          value={formatCompactNumber(data?.productsWithRating || 0)}
          icon={<BarChart3 size={16} />}
          tooltip={t('dashboard.withRatingTooltip')}
          subtitle={`${data?.ratingCoveragePercent || 0}% ${t('dashboard.ratingCoverage')}`}
          loading={isLoading}
          accent="var(--success)"
        />
      </div>
    </TooltipProvider>
  );
}

export default React.memo(MetricsCards);
