import React from 'react';
import { ExternalLink, Scale } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Product } from '../../../types';
import { resolveMetricPrice } from '../../../utils/metrics';
import { Badge } from '../../../components/ui/badge';
import { Checkbox } from '../../../components/ui/checkbox';
import { TR, TD } from '../../../components/ui/table';
import { useCompare } from '../../../context/CompareContext';

interface ProductTableRowProps {
  row: Product;
  isSelected: boolean;
  onSelectChange: (id: string, checked: boolean) => void;
}

export function ProductTableRow({ row, isSelected, onSelectChange }: ProductTableRowProps) {
  const { t } = useTranslation();
  const price = resolveMetricPrice(row.metrics);
  const { products: compareProducts, addProduct, removeProduct } = useCompare();

  const isCompared = compareProducts.some(p => p.id === row.id);
  const compareDisabled = !isCompared && compareProducts.length >= 5;

  const asin = row.metrics.asin || row.id; 
  const buyBox = row.metrics.amazonMetrics?.buyBox || row.metrics.buyBox;
  const selectedOffer = row.metrics.selectedOffer;
  const buyBoxSellerName = String(buyBox?.sellerName || '').toLowerCase();
  const isAmazonByName = buyBoxSellerName.includes('amazon');
  const offers = row.metrics.amazonMetrics?.offers || row.metrics.offers || [];
  const hasAnyOffer = offers.length > 0 || Number(row.metrics.sellerCount || 0) > 0;
  const hasFbaOffer = offers.some((offer) => Boolean(offer.isFBA));
  const sellerType = buyBox?.isAmazon || selectedOffer?.isAmazon || isAmazonByName
    ? 'Amazon'
    : buyBox?.isFBA || selectedOffer?.isFBA
      ? 'FBA'
      : buyBox || selectedOffer
        ? 'FBM'
        : hasAnyOffer
          ? hasFbaOffer
            ? 'FBA'
            : 'FBM'
          : t('product.unknown');
  const resolvedStockCount = (() => {
    if (typeof row.metrics.stockCount === 'number' && row.metrics.stockCount > 0) return row.metrics.stockCount;
    const fromOffers = (row.metrics.amazonMetrics?.offers || row.metrics.offers || [])
      .map((offer) => (typeof offer.stockCount === 'number' && offer.stockCount > 0 ? offer.stockCount : 0))
      .filter((value) => value > 0);
    if (fromOffers.length > 0) return Math.max(...fromOffers);
    return null;
  })();

  return (
    <TR>
      <TD data-pdf-exclude>
        <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelectChange(row.id, Boolean(checked))} />
      </TD>
      <TD style={{ minWidth: 240, maxWidth: 360 }}>
        <div data-pdf-exclude-text style={{ 
          fontSize: '0.9rem', 
          fontWeight: 600, 
          lineHeight: 1.4,
          marginBottom: 6,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
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
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge variant="outline" style={{ fontSize: '0.65rem' }}>{row.marketplace.toUpperCase()}</Badge>
          <span style={{ fontSize: '0.65rem', color: 'var(--fg-muted)', fontWeight: 500 }}>
            {t('table.id')}: {asin || t('product.unknown')}
          </span>
        </div>
      </TD>
      <TD>
        <Badge variant={row.scrapedBy === 'firecrawl' ? 'warning' : 'secondary'} style={{ fontSize: '0.65rem' }}>
          {row.scrapedBy}
        </Badge>
      </TD>
      <TD>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--fg)' }}>
            ${price.toFixed(2)}
          </div>
          {row.metrics.discountPercentage ? (
            <div style={{ 
              color: 'var(--success)', 
              fontSize: '0.7rem', 
              fontWeight: 700,
              background: 'color-mix(in oklab, var(--success) 12%, transparent)',
              padding: '0 4px',
              borderRadius: 4,
              width: 'fit-content'
            }}>
              -{row.metrics.discountPercentage}% OFF
            </div>
          ) : (
            <div style={{ fontSize: '0.7rem', color: 'var(--fg-muted)' }}>{t('table.regularPrice')}</div>
          )}
        </div>
      </TD>
      <TD>
        {row.metrics.averageRating ? (
          <div style={{ width: '100%', maxWidth: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: 'var(--warning)', fontSize: '0.9rem' }}>★</span>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{row.metrics.averageRating.toFixed(1)}</span>
              </div>
              <span className="muted" style={{ fontSize: '0.65rem' }}>
                {(row.metrics.reviewsCount || 0).toLocaleString()} {t('table.reviewsShort')}
              </span>
            </div>
            <div className="sentiment-bar" style={{ 
              height: 6, 
              background: 'var(--bg-soft)', 
              borderRadius: 3, 
              overflow: 'hidden' 
            }}>
              <div 
                className="sentiment-fill" 
                style={{ 
                  height: '100%',
                  width: `${(row.metrics.averageRating / 5) * 100}%`,
                  background: row.metrics.averageRating >= 4.5 ? 'var(--primary)' : 
                              row.metrics.averageRating >= 4 ? 'var(--success)' : 'var(--warning)'
                }} 
              />
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>{t('table.noSentimentData')}</div>
        )}
      </TD>
      <TD>
        <Badge
          variant={sellerType === 'Amazon' ? 'success' : sellerType === 'FBA' ? 'secondary' : sellerType === 'FBM' ? 'warning' : 'outline'}
          style={{ fontSize: '0.68rem' }}
        >
          {sellerType}
        </Badge>
      </TD>
      <TD>{resolvedStockCount ?? '—'}</TD>
      <TD>{row.scrapedAt ? format(new Date(row.scrapedAt), 'MMM dd, HH:mm') : '—'}</TD>
      <TD className="text-right" data-pdf-exclude>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button 
            type="button"
            className="icon-btn" 
            onClick={() => isCompared ? removeProduct(row.id) : addProduct(row)}
            disabled={compareDisabled}
            title={isCompared ? t('compare.removeFromCompare', 'Remove from Compare') : t('compare.addToCompare', 'Add to Compare')}
            style={{ 
              color: isCompared ? 'var(--primary)' : undefined, 
              borderColor: isCompared ? 'var(--primary)' : undefined,
              opacity: compareDisabled ? 0.5 : 1,
              cursor: compareDisabled ? 'not-allowed' : 'pointer'
            }}
          >
            <Scale size={14} />
          </button>
          <a className="icon-btn" href={row.url} target="_blank" rel="noopener noreferrer" title={t('table.openMarketplace')}>
            <ExternalLink size={14} />
          </a>
        </div>
      </TD>
    </TR>
  );
}

export default React.memo(ProductTableRow);
