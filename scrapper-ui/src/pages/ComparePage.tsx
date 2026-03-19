import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useCompare } from '../context/CompareContext';
import { resolveMetricPrice } from '../utils/metrics';
import { getMarketplaceDisplayName } from '../utils/marketplace';
import { formatNumber } from '../utils/locale';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

export default function ComparePage() {
  const { t, i18n } = useTranslation();
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
  const validReviews = products
    .map((p) => Number(p.metrics.reviewsCount || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxReviews = validReviews.length > 0 ? Math.max(...validReviews) : 0;
  const normalizeSeller = (name?: string) => {
    if (!name) return '';
    const cleaned = name.replace(/^sold by\s+/i, '').trim();
    return /amazon(\.[a-z.]+)?/i.test(cleaned) ? 'Amazon' : cleaned;
  };
  const getBuyBox = (product: (typeof products)[number]) => product.metrics.amazonMetrics?.buyBox || product.metrics.buyBox;
  const getBuyBoxType = (product: (typeof products)[number]) => {
    const buyBox = getBuyBox(product);
    if (!buyBox) return t('product.unknown', 'Unknown');
    if (buyBox.isAmazon) return t('product.buyBoxAmazon', 'Amazon');
    if (buyBox.isFBA) return t('product.buyBoxFba', 'FBA');
    return t('product.buyBoxFbm', 'FBM');
  };
  const getStockCount = (product: (typeof products)[number]) => {
    if (typeof product.metrics.stockCount === 'number' && product.metrics.stockCount > 0) return product.metrics.stockCount;
    const offers = product.metrics.amazonMetrics?.offers || product.metrics.offers || [];
    const offerStocks = offers
      .map((offer) => (typeof offer.stockCount === 'number' && offer.stockCount > 0 ? offer.stockCount : 0))
      .filter((value) => value > 0);
    return offerStocks.length > 0 ? Math.max(...offerStocks) : null;
  };
  const getOfferCount = (product: (typeof products)[number]) => {
    const offers = product.metrics.amazonMetrics?.offers || product.metrics.offers || [];
    return product.metrics.sellerCount || offers.length || null;
  };
  const validStockCounts = products
    .map((product) => getStockCount(product))
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const maxStockCount = validStockCounts.length > 0 ? Math.max(...validStockCounts) : 0;
  const validOfferCounts = products
    .map((product) => getOfferCount(product))
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const maxOfferCount = validOfferCounts.length > 0 ? Math.max(...validOfferCounts) : 0;

  const bestValuePillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'color-mix(in oklab, var(--success) 18%, transparent)',
    border: '1px solid color-mix(in oklab, var(--success) 40%, transparent)',
    color: 'var(--success)',
    fontWeight: 800,
    boxShadow: '0 0 0 2px color-mix(in oklab, var(--success) 12%, transparent)',
  };

  return (
    <div className="stack-col compare-page" style={{ padding: '24px 20px', gap: 24, maxWidth: 1400, margin: '0 auto' }}>
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
                                className="compare-product-image"
                                src={p.metrics.imageUrl} 
                                alt={p.title} 
                                style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1px solid var(--border)' }} 
                              />
                           )}
                           <a 
                             href={p.url} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className="link compare-product-title" 
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
                      <Badge variant="outline">{getMarketplaceDisplayName(p.marketplace, p.url)}</Badge>
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
                          {isBest && products.length > 1 ? (
                            <span style={bestValuePillStyle}>${price.toFixed(2)}</span>
                          ) : (
                            `$${price.toFixed(2)}`
                          )}
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
                              {isBest && products.length > 1 ? (
                                <span style={bestValuePillStyle}>★ {rating.toFixed(1)}</span>
                              ) : (
                                `★ ${rating.toFixed(1)}`
                              )}
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
                  {products.map(p => {
                    const reviewsCount = Number(p.metrics.reviewsCount || 0);
                    const isBest = reviewsCount > 0 && reviewsCount === maxReviews && products.length > 1;
                    return (
                    <td key={`reviews-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {reviewsCount > 0 ? (
                        isBest ? (
                          <span style={bestValuePillStyle}>{formatNumber(reviewsCount, i18n.language)}</span>
                        ) : (
                          formatNumber(reviewsCount, i18n.language)
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )})}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    ASIN
                  </td>
                  {products.map(p => (
                    <td key={`asin-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {p.metrics.asin || <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('product.buyBoxType', 'Buy Box Type')}
                  </td>
                  {products.map(p => (
                    <td key={`buybox-type-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {getBuyBoxType(p)}
                    </td>
                  ))}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('product.buyBoxSeller', 'Buy Box Seller')}
                  </td>
                  {products.map(p => {
                    const seller = normalizeSeller(getBuyBox(p)?.sellerName);
                    return (
                      <td key={`buybox-seller-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                        {seller || <span className="muted">—</span>}
                      </td>
                    );
                  })}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('table.stock', 'Stock')}
                  </td>
                  {products.map(p => {
                    const stockCount = getStockCount(p);
                    const isBest = typeof stockCount === 'number' && stockCount > 0 && stockCount === maxStockCount && products.length > 1;
                    return (
                    <td key={`stock-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {stockCount != null ? (
                        isBest ? (
                          <span style={bestValuePillStyle}>{stockCount}</span>
                        ) : (
                          stockCount
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )})}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('product.offersCount', 'Offers / Sellers')}
                  </td>
                  {products.map(p => {
                    const offerCount = getOfferCount(p);
                    const isBest = typeof offerCount === 'number' && offerCount > 0 && offerCount === maxOfferCount && products.length > 1;
                    return (
                    <td key={`offers-count-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {offerCount != null ? (
                        isBest ? (
                          <span style={bestValuePillStyle}>{offerCount}</span>
                        ) : (
                          offerCount
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )})}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    Prime
                  </td>
                  {products.map(p => (
                    <td key={`prime-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {p.metrics.isPrime ? 'Yes' : '—'}
                    </td>
                  ))}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    Amazon Choice
                  </td>
                  {products.map(p => (
                    <td key={`amazon-choice-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {p.metrics.isAmazonChoice ? 'Yes' : '—'}
                    </td>
                  ))}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    Best Seller
                  </td>
                  {products.map(p => (
                    <td key={`best-seller-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {p.metrics.isBestSeller ? 'Yes' : '—'}
                    </td>
                  ))}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    {t('table.availability', 'Availability')}
                  </td>
                  {products.map(p => (
                    <td key={`availability-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {p.metrics.availability || <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>

                <tr className="table-row">
                  <td className="table-td" style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-elevated)', fontWeight: 600, borderRight: '1px solid var(--border)' }}>
                    BSR
                  </td>
                  {products.map(p => (
                    <td key={`bsr-${p.id}`} className="table-td" style={{ textAlign: 'center' }}>
                      {p.metrics.bestSellerRank || (p.metrics.bsrCategories?.[0] ? `#${p.metrics.bsrCategories[0].rank}` : <span className="muted">—</span>)}
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
                            {p.metrics.buyBox?.sellerName && <span><strong>Seller:</strong> {normalizeSeller(p.metrics.buyBox.sellerName)}</span>}
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
