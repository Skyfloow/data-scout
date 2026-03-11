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
  platform: 'all' | 'amazon' | 'etsy';
}

export function ProductTableRow({ row, isSelected, onSelectChange, platform }: ProductTableRowProps) {
  const { t } = useTranslation();
  const price = resolveMetricPrice(row.metrics);
  const { products: compareProducts, addProduct, removeProduct } = useCompare();

  const isCompared = compareProducts.some(p => p.id === row.id);
  const compareDisabled = !isCompared && compareProducts.length >= 5;

  const qualityScore = row.metrics.dataQualityScore || 0;
  const asin = row.metrics.asin || row.id; 

  return (
    <TR>
      <TD data-pdf-exclude>
        <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelectChange(row.id, Boolean(checked))} />
      </TD>
      <TD style={{ minWidth: 280, maxWidth: 400 }}>
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
          <span style={{ fontSize: '0.65rem', color: 'var(--fg-muted)', fontWeight: 500 }}>ID: {asin || 'Unknown'}</span>
          {qualityScore > 0 && (
            <div className="data-quality-pill" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 4, 
              fontSize: '0.7rem', 
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--bg-soft)',
              border: '1px solid var(--border)'
            }}>
              <div style={{ 
                width: 5, height: 5, borderRadius: '50%',
                background: qualityScore > 85 ? 'var(--success)' : 'var(--warning)'
              }} />
              DQ {qualityScore}%
            </div>
          )}
        </div>
      </TD>
      {platform === 'all' && (
        <TD>
          <Badge variant={row.scrapedBy === 'firecrawl' ? 'warning' : 'secondary'} style={{ fontSize: '0.65rem' }}>
            {row.scrapedBy}
          </Badge>
        </TD>
      )}
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
            <div style={{ fontSize: '0.7rem', color: 'var(--fg-muted)' }}>MSRP Price</div>
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
              <span className="muted" style={{ fontSize: '0.65rem' }}>{row.metrics.reviewsCount?.toLocaleString()} revs</span>
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
          <div className="muted" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>No sentiment data</div>
        )}
      </TD>
      <TD>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {row.metrics.isPrime && (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.65rem', color: '#00A8E1', fontWeight: 700 }}>
              <span style={{ marginRight: 4 }}>✓</span> PRIME
            </div>
          )}
          {row.metrics.isBestSeller && (
            <Badge variant="success" style={{ fontSize: '0.6rem', padding: '0 4px' }}>BESTSELLER</Badge>
          )}
          {(!row.metrics.isPrime && !row.metrics.isBestSeller) && (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.65rem', color: 'var(--fg-muted)' }}>
              <span className="listing-health-dot" style={{ 
                display: 'inline-block', 
                width: 6, 
                height: 6, 
                borderRadius: '50%', 
                background: '#ccc', 
                marginRight: 4 
              }} /> Standard
            </div>
          )}
          {row.metrics.viewsCount ? (
            <div style={{ fontSize: '0.65rem', color: 'var(--fg-muted)', fontWeight: 500 }}>
              👀 {row.metrics.viewsCount.toLocaleString()} views
            </div>
          ) : null}
        </div>
      </TD>
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
