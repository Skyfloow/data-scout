import React from 'react';
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetMetricsDefinitionsQuery, useGetMetricsQuery } from '../../../store/apiSlice';
import { formatCompactNumber, formatCurrency } from '../../../utils/formatters';
import { Card, CardContent } from '../../../components/ui/card';
import { Alert } from '../../../components/ui/alert';
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
  const { data: definitions } = useGetMetricsDefinitionsQuery();

  const amazon = data?.segmentMetrics?.amazon;
  const etsy = data?.segmentMetrics?.etsy;
  const metricsVersion = data?.version;
  const definitionsVersion = definitions?.version;
  const hasVersionMismatch = Boolean(metricsVersion) && Boolean(definitionsVersion) && metricsVersion !== definitionsVersion;
  const amazonBestTitle = amazon?.bestOpportunityTitle ? `${amazon.bestOpportunityTitle.substring(0, 28)}…` : t('dashboard.noData');
  const etsyBestTitle = etsy?.bestOpportunityTitle ? `${etsy.bestOpportunityTitle.substring(0, 28)}…` : t('dashboard.noData');

  return (
    <TooltipProvider>
      <div className="stack-col" style={{ gap: 14 }}>
        {hasVersionMismatch ? (
          <Alert variant="warning">
            Metrics contract version mismatch: `/metrics`={metricsVersion} vs `/metrics/definitions`={definitionsVersion}. Dashboard values may be inconsistent.
          </Alert>
        ) : null}

        <div className="metric-grid">
          <MetricCard
            title={t('dashboard.totalScraped')}
            value={formatCompactNumber(data?.uniqueProducts || 0)}
            icon={<ShoppingBag size={16} />}
            tooltip={t('dashboard.totalScrapedTooltip')}
            subtitle={t('dashboard.productsInDb')}
            loading={isLoading}
          />
          <MetricCard
            title="Amazon Count"
            value={amazon?.count || 0}
            icon={<TrendingUp size={16} />}
            tooltip="Количество уникальных Amazon товаров в текущем срезе."
            subtitle={`Avg price: ${formatCurrency(amazon?.avgPrice || 0)}`}
            loading={isLoading}
          />
          <MetricCard
            title="Etsy Count"
            value={etsy?.count || 0}
            subtitle={`Avg price: ${formatCurrency(etsy?.avgPrice || 0)}`}
            icon={<Sparkles size={16} />}
            loading={isLoading}
            tooltip="Количество уникальных Etsy товаров в текущем срезе."
            accent="var(--success)"
          />
          <MetricCard
            title="Amazon Margin"
            value={formatCurrency(amazon?.avgMargin || 0)}
            icon={<TrendingUp size={16} />}
            tooltip="Средний расчетный margin по Amazon товарам."
            subtitle={`Discount avg: ${amazon?.avgDiscount || 0}%`}
            loading={isLoading}
          />
          <MetricCard
            title="Etsy Margin"
            value={formatCurrency(etsy?.avgMargin || 0)}
            icon={<BadgeCheck size={16} />}
            tooltip="Средний расчетный margin по Etsy товарам."
            subtitle={`Discount avg: ${etsy?.avgDiscount || 0}%`}
            loading={isLoading}
            accent="var(--success)"
          />
          <MetricCard
            title="Amazon Prime Share"
            value={`${amazon?.specialSharePercent || 0}%`}
            icon={<BarChart3 size={16} />}
            tooltip="Доля Prime среди Amazon товаров."
            subtitle={`Value: ${amazon?.avgValueScore || 0}/100`}
            loading={isLoading}
          />
          <MetricCard
            title="Etsy Digital Share"
            value={`${etsy?.specialSharePercent || 0}%`}
            icon={<Star size={16} />}
            tooltip="Доля digital-download среди Etsy товаров."
            subtitle={`Value: ${etsy?.avgValueScore || 0}/100`}
            loading={isLoading}
          />
          <MetricCard
            title="Amazon Best Opportunity"
            value={`${amazon?.avgTrust || 0}/100`}
            icon={<Sparkles size={16} />}
            tooltip="Trust индекс Amazon сегмента."
            subtitle={amazonBestTitle}
            loading={isLoading}
            accent="var(--warning)"
          />
          <MetricCard
            title="Etsy Trust"
            value={`${etsy?.avgTrust || 0}/100`}
            icon={<ShoppingBag size={16} />}
            tooltip="Trust индекс Etsy сегмента."
            subtitle={etsyBestTitle}
            loading={isLoading}
            accent="var(--info)"
          />
          <MetricCard
            title="Amazon Value"
            value={`${amazon?.avgValueScore || 0}/100`}
            icon={<BarChart3 size={16} />}
            tooltip="Средний Value score по Amazon."
            subtitle={`Trust: ${amazon?.avgTrust || 0}/100`}
            loading={isLoading}
            accent="var(--warning)"
          />
          <MetricCard
            title="Etsy Value"
            value={`${etsy?.avgValueScore || 0}/100`}
            icon={<ShieldCheck size={16} />}
            tooltip="Средний Value score по Etsy."
            subtitle={`Trust: ${etsy?.avgTrust || 0}/100`}
            loading={isLoading}
            accent="var(--primary)"
          />
          <MetricCard
            title="Marketplace Segregated KPI"
            value="ON"
            icon={<ShieldCheck size={16} />}
            tooltip="KPI считаются отдельно для Amazon и Etsy, без смешения данных."
            subtitle="Amazon/Etsy metrics separated"
            loading={isLoading}
            accent="var(--secondary)"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

export default React.memo(MetricsCards);
