import React from 'react';
import { History, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from './ui/badge';
import { TD, TR } from './ui/table';
import { MonitoredEntity, TrackerLatestData, TrackerResult } from '../types';
import { getMarketplaceDisplayName } from '../utils/marketplace';
import { formatDateTime } from '../utils/locale';

export function hasKeywordLatestData(data: TrackerLatestData): data is { scrapedAt: string; topAsin?: string; topTitle?: string } {
  return Boolean(data && ('topAsin' in data || 'topTitle' in data));
}

export function hasProductLatestData(data: TrackerLatestData): data is { scrapedAt: string; price?: number } {
  return Boolean(data && 'price' in data);
}

export function typeVariant(type: string): 'default' | 'secondary' | 'warning' {
  if (type === 'keyword') return 'secondary';
  if (type === 'product') return 'default';
  return 'warning';
}

interface TrackerResultRowProps {
  item: TrackerResult;
  onViewHistory: (entity: MonitoredEntity) => void;
}

export function TrackerResultRow({ item, onViewHistory }: TrackerResultRowProps) {
  const { t, i18n } = useTranslation();
  const marketplaceLabel = getMarketplaceDisplayName(item.marketplace, item.type === 'product' ? item.value : undefined);
  const keywordLatest = hasKeywordLatestData(item.latestData) ? item.latestData : null;
  const productLatest = hasProductLatestData(item.latestData) ? item.latestData : null;
  const updatedAt = item.latestData?.scrapedAt || item.lastScrapedAt;

  // Re-map TrackerResult back into MonitoredEntity structure just enough for History dialogs
  const handleHistory = () => {
    onViewHistory({
      id: item.id,
      type: item.type as 'product' | 'keyword',
      value: item.value,
      marketplace: item.marketplace,
      intervalHours: 0,
      status: 'active',
      addedAt: '',
    } as any);
  };

  return (
    <TR key={item.id}>
      <TD style={{ maxWidth: 320 }}>
        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
        {keywordLatest?.topTitle ? (
          <div className="muted" style={{ fontSize: '0.74rem', marginTop: 2 }}>
            {t('monitoring.top1')}: {keywordLatest.topTitle}
          </div>
        ) : null}
      </TD>
      <TD>
        <Badge variant={typeVariant(item.type)}>{item.type.toUpperCase()}</Badge>
      </TD>
      <TD className="text-right">
        {!item.latestData && !item.lastScrapedAt ? (
          <span className="muted">{t('monitoring.waitingData')}</span>
        ) : item.type === 'product' ? (
          <span style={{ color: 'var(--success)', fontWeight: 700 }}>
            {productLatest?.price ? `$${productLatest.price}` : t('monitoring.updated')}
          </span>
        ) : item.type === 'keyword' ? (
          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
            {keywordLatest?.topAsin ? `${t('monitoring.topAsin')}: ${keywordLatest.topAsin}` : t('monitoring.updated')}
          </span>
        ) : (
          '-'
        )}
      </TD>
      <TD>
        <Badge variant="outline">{marketplaceLabel}</Badge>
      </TD>
      <TD>{updatedAt ? formatDateTime(updatedAt, i18n.language) : '—'}</TD>
      <TD className="text-right">
        <button className="icon-btn" onClick={handleHistory} title={t('monitoring.history')}>
          {item.type === 'keyword' ? <TrendingUp size={16} /> : <History size={16} />}
        </button>
      </TD>
    </TR>
  );
}
