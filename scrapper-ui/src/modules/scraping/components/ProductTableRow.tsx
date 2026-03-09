import React from 'react';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Product } from '../../../types';
import { resolveMetricPrice } from '../../../utils/metrics';
import { Badge } from '../../../components/ui/badge';
import { Checkbox } from '../../../components/ui/checkbox';
import { TR, TD } from '../../../components/ui/table';

interface ProductTableRowProps {
  row: Product;
  isSelected: boolean;
  onSelectChange: (id: string, checked: boolean) => void;
}

export function ProductTableRow({ row, isSelected, onSelectChange }: ProductTableRowProps) {
  const { t } = useTranslation();
  const price = resolveMetricPrice(row.metrics);

  return (
    <TR>
      <TD data-pdf-exclude>
        <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelectChange(row.id, Boolean(checked))} />
      </TD>
      <TD style={{ maxWidth: 300 }}>
        <Link
          to={`/product/${row.id}`}
          className="link"
          style={{
            fontWeight: 700,
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={row.title}
        >
          {row.title}
        </Link>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <Badge variant="outline">{row.marketplace}</Badge>
          <Badge variant={row.scrapedBy === 'firecrawl' ? 'warning' : 'secondary'}>{row.scrapedBy}</Badge>
        </div>
      </TD>
      <TD style={{ minWidth: 120 }}>
        <div style={{ fontWeight: 800 }}>${price.toFixed(2)}</div>
        {row.metrics.discountPercentage ? <div style={{ color: 'var(--success)', fontSize: '0.76rem' }}>-{row.metrics.discountPercentage}%</div> : null}
      </TD>
      <TD>
        {row.metrics.bsrCategories?.[0] ? (
          <>
            <div style={{ fontWeight: 700 }}>#{row.metrics.bsrCategories[0].rank.toLocaleString()}</div>
            <div className="muted" style={{ fontSize: '0.74rem' }} title={row.metrics.bsrCategories[0].category}>
              {row.metrics.bsrCategories[0].category}
            </div>
          </>
        ) : (
          <span className="muted">N/A</span>
        )}
      </TD>
      <TD>
        {row.metrics.averageRating ? (
          <>
            <div>
              <span style={{ color: 'var(--warning)' }}>★</span> {row.metrics.averageRating.toFixed(1)}
            </div>
            <div className="muted" style={{ fontSize: '0.74rem' }}>
              ({row.metrics.reviewsCount?.toLocaleString()})
            </div>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </TD>
      <TD>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {row.metrics.sellerCount ? <Badge variant="outline">{row.metrics.sellerCount} {t('table.sellers')}</Badge> : null}
          {row.metrics.newOffersCount ? <Badge variant="success">{row.metrics.newOffersCount} {t('table.new')}</Badge> : null}
        </div>
      </TD>
      <TD>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {row.metrics.isPrime ? <Badge variant="secondary">{t('table.prime')}</Badge> : null}
          {row.metrics.buyBox?.isFBA ? <Badge variant="default">FBA</Badge> : null}
          {row.metrics.isAmazonChoice ? <Badge variant="warning">Choice</Badge> : null}
        </div>
      </TD>
      <TD>{row.scrapedAt ? format(new Date(row.scrapedAt), 'MMM dd, HH:mm') : '—'}</TD>
      <TD className="text-right" data-pdf-exclude>
        <a className="icon-btn" href={row.url} target="_blank" rel="noopener noreferrer" title={t('table.openMarketplace')}>
          <ExternalLink size={14} />
        </a>
      </TD>
    </TR>
  );
}

export default React.memo(ProductTableRow);
