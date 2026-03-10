import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useCompare } from '../context/CompareContext';
import { resolveMetricPrice } from '../utils/metrics';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

export default function ComparePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { products, removeProduct, clearCompare } = useCompare();

  if (products.length === 0) {
    return (
      <div className="stack-col" style={{ padding: '40px 20px', alignItems: 'center', textAlign: 'center' }}>
        <h2 className="page-title">{t('compare.title', 'Product Comparison')}</h2>
        <p className="muted" style={{ marginTop: 12 }}>{t('compare.empty', 'No products selected for comparison.')}</p>
        <Button onClick={() => navigate('/')} style={{ marginTop: 24 }}>
          <ArrowLeft size={16} /> {t('compare.backToDashboard', 'Back to Dashboard')}
        </Button>
      </div>
    );
  }

  // Pre-calculate min price and max rating to highlight
  const validPrices = products.map(p => resolveMetricPrice(p.metrics)).filter(p => typeof p === 'number' && p > 0);
  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : Infinity;

  const validRatings = products.map(p => p.metrics.averageRating).filter((r): r is number => typeof r === 'number');
  const maxRating = validRatings.length > 0 ? Math.max(...validRatings) : -Infinity;

  return (
    <div className="stack-col" style={{ padding: '24px 20px', gap: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft size={16} /> {t('compare.back', 'Back')}
          </Button>
          <h1 className="page-title" style={{ fontSize: '1.5rem' }}>{t('compare.title', 'Product Comparison')}</h1>
        </div>
        <Button variant="destructive" size="sm" onClick={clearCompare}>
          <Trash2 size={16} /> {t('compare.clearAll', 'Clear All')}
        </Button>
      </div>

      <div className="table-wrap">
        <table className="table" style={{ minWidth: 800 }}>
          <thead>
                <tr>
                  <th className="table-th" style={{ width: 180, position: 'sticky', left: 0, zIndex: 20, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border)' }}>
                    {t('compare.features', 'Features')}
                  </th>
                  {products.map(p => (
                    <th key={p.id} className="table-th" style={{ minWidth: 240, textAlign: 'center', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 12, paddingTop: 8 }}>
                           {p.metrics.imageUrl && (
                              <img 
                                src={p.metrics.imageUrl} 
                                alt={p.title} 
                                style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1px solid var(--border)' }} 
                              />
                           )}
                           <a 
                             href={p.url} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className="link" 
                             style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                             title={p.title}
                           >
                             {p.title}
                           </a>
                        </div>
                        <button 
                          onClick={() => removeProduct(p.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--fg-muted)',
                            cursor: 'pointer',
                            padding: 4,
                            marginTop: -4,
                            marginRight: -4
                          }}
                          title={t('compare.remove', 'Remove')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Platform Row */}
                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('compare.platform', 'Platform')}
                  </td>
                  {products.map(p => (
                    <td key={`platform-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      <Badge variant="outline">{p.marketplace}</Badge>
                    </td>
                  ))}
                </tr>
                
                {/* Price Row */}
                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('compare.price', 'Price')}
                  </td>
                  {products.map(p => {
                    const price = resolveMetricPrice(p.metrics);
                    const isBest = price > 0 && price === minPrice;
                    return (
                      <td key={`price-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                        <div style={{ 
                          fontWeight: isBest ? 800 : 600, 
                          color: isBest ? 'var(--success, #16a34a)' : 'inherit',
                          fontSize: isBest ? '1.15rem' : '1rem'
                        }}>
                          ${price.toFixed(2)}
                        </div>
                        {isBest && products.length > 1 && (
                          <div style={{ color: 'var(--success, #16a34a)', fontSize: '0.75rem', fontWeight: 600, marginTop: 4 }}>
                            {t('compare.bestPrice', 'Best Price')}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Rating Row */}
                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('compare.rating', 'Rating')}
                  </td>
                  {products.map(p => {
                    const rating = p.metrics.averageRating;
                    const isBest = rating !== undefined && rating === maxRating;
                    return (
                      <td key={`rating-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                        {rating ? (
                          <>
                            <div style={{ 
                              fontWeight: isBest ? 800 : 600, 
                              color: isBest ? 'var(--success, #16a34a)' : 'var(--warning, #eab308)',
                              fontSize: isBest ? '1.15rem' : '1rem'
                            }}>
                              ★ {rating.toFixed(1)}
                            </div>
                            {isBest && products.length > 1 && (
                              <div style={{ color: 'var(--success, #16a34a)', fontSize: '0.75rem', fontWeight: 600, marginTop: 4 }}>
                                {t('compare.highestRating', 'Highest Rating')}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Reviews Count Row */}
                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('compare.reviews', 'Reviews')}
                  </td>
                  {products.map(p => (
                    <td key={`reviews-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {p.metrics.reviewsCount ? p.metrics.reviewsCount.toLocaleString() : <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>

                {/* Seller / Brand Row (Last Row) */}
                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)', borderBottom: 'none' }}>
                    {t('compare.sellerBrand', 'Brand / Seller')}
                  </td>
                  {products.map(p => (
                    <td key={`seller-${p.id}`} className="table-td" style={{ textAlign: 'center', borderBottom: 'none' }}>
                      <div style={{ fontSize: '0.9rem' }}>
                        {p.metrics.brand || p.metrics.buyBox?.sellerName ? (
                          <div className="stack-col" style={{ gap: 4, alignItems: 'center' }}>
                            {p.metrics.brand && <span><strong>Brand:</strong> {p.metrics.brand}</span>}
                            {p.metrics.buyBox?.sellerName && <span><strong>Seller:</strong> {p.metrics.buyBox.sellerName}</span>}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
}
