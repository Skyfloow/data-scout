import React, { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ExternalLink, FileSpreadsheet, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDeleteProductsMutation, useGetProductsQuery } from '../../../store/apiSlice';
import { Product, ScraperType } from '../../../types';
import { downloadCsv } from '../../../utils/export';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Checkbox } from '../../../components/ui/checkbox';
import { Alert } from '../../../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '../../../components/ui/table';

type SortKey = 'date' | 'price' | 'bsr' | 'title';
type SortOrder = 'asc' | 'desc';

function SortButton({ active, order, onClick, children }: { active: boolean; order: SortOrder; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        cursor: 'pointer',
        fontWeight: active ? 800 : 700,
      }}
    >
      {children}
      {active ? order === 'asc' ? <ArrowUpWideNarrow size={13} /> : <ArrowDownWideNarrow size={13} /> : null}
    </button>
  );
}

function ProductTable() {
  const { t } = useTranslation();
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterScraper, setFilterScraper] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params = {
    source: filterSource !== 'all' ? filterSource : undefined,
    scraper: filterScraper !== 'all' ? (filterScraper as ScraperType) : undefined,
  };

  const { data, isLoading, error } = useGetProductsQuery(params);
  const [deleteProducts, { isLoading: isDeleting }] = useDeleteProductsMutation();
  const products: Product[] = data?.data || [];

  const handleSort = (key: SortKey) => {
    const isAsc = sortKey === key && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortKey(key);
  };

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      if (sortKey === 'date') {
        aVal = new Date(a.scrapedAt).getTime();
        bVal = new Date(b.scrapedAt).getTime();
      } else if (sortKey === 'price') {
        aVal = a.metrics.priceUSD || a.metrics.buyBox?.price || a.metrics.itemPrice || a.metrics.price || 0;
        bVal = b.metrics.priceUSD || b.metrics.buyBox?.price || b.metrics.itemPrice || b.metrics.price || 0;
      } else if (sortKey === 'bsr') {
        aVal = a.metrics.bsrCategories?.[0]?.rank || 9999999;
        bVal = b.metrics.bsrCategories?.[0]?.rank || 9999999;
      } else if (sortKey === 'title') {
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [products, sortKey, sortOrder]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelected(new Set(sortedProducts.map((p) => p.id)));
    else setSelected(new Set());
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    await deleteProducts({ ids: Array.from(selected) });
    setSelected(new Set());
  };

  const handleExportCsv = () => {
    const rows: Array<Array<string | number>> = [];
    rows.push(['id', 'title', 'marketplace', 'price', 'currency', 'rating', 'reviews', 'discount', 'bsrRank', 'scrapedAt', 'scrapedBy', 'url']);
    for (const row of sortedProducts) {
      const price = row.metrics.priceUSD || row.metrics.itemPriceUSD || row.metrics.buyBox?.price || row.metrics.itemPrice || row.metrics.price || 0;
      rows.push([
        row.id,
        row.title,
        row.marketplace,
        price,
        row.metrics.currency || 'USD',
        row.metrics.averageRating || '',
        row.metrics.reviewsCount || '',
        row.metrics.discountPercentage || '',
        row.metrics.bsrCategories?.[0]?.rank || '',
        row.scrapedAt,
        row.scrapedBy,
        row.url,
      ]);
    }
    downloadCsv(`products-table-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const allSelected = sortedProducts.length > 0 && selected.size === sortedProducts.length;
  const someSelected = selected.size > 0 && selected.size < sortedProducts.length;

  return (
    <Card>
      <CardContent>
        <div className="stack-col" style={{ gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <CardTitle>{t('table.marketIntelligenceData')}</CardTitle>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} data-pdf-table-controls>
              {selected.size > 0 ? (
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                  <Trash2 size={14} />
                  {t('table.delete')} {selected.size} {selected.size === 1 ? t('table.item') : t('table.items')}
                </Button>
              ) : null}

              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isLoading || sortedProducts.length === 0}>
                <FileSpreadsheet size={14} /> Export CSV
              </Button>

              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger style={{ width: 140 }}>
                  <SelectValue placeholder={t('table.source')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('table.allSources')}</SelectItem>
                  <SelectItem value="amazon">Amazon</SelectItem>
                  <SelectItem value="etsy">Etsy</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterScraper} onValueChange={setFilterScraper}>
                <SelectTrigger style={{ width: 140 }}>
                  <SelectValue placeholder={t('table.scraper')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('table.allEngines')}</SelectItem>
                  <SelectItem value="crawler">Crawler</SelectItem>
                  <SelectItem value="firecrawl">Firecrawl</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2.2rem 0' }}>
              <span className="loader loader-dark" />
            </div>
          ) : error ? (
            <Alert variant="destructive">{t('table.failedLoad')}</Alert>
          ) : products.length === 0 ? (
            <div className="text-center muted" style={{ padding: '2rem 0' }}>
              {t('table.noProducts')}
            </div>
          ) : (
            <TableWrap data-pdf-expand-scroll data-pdf-table style={{ maxHeight: 600 }}>
              <Table style={{ minWidth: 1100 }}>
                <THead>
                  <TR>
                    <TH style={{ width: 42 }} data-pdf-exclude>
                      <Checkbox
                        checked={allSelected || (someSelected ? 'indeterminate' : false)}
                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                        aria-label="Select all"
                      />
                    </TH>
                    <TH style={{ minWidth: 220 }}>
                      <SortButton active={sortKey === 'title'} order={sortOrder} onClick={() => handleSort('title')}>
                        {t('table.product')}
                      </SortButton>
                    </TH>
                    <TH>
                      <SortButton active={sortKey === 'price'} order={sortOrder} onClick={() => handleSort('price')}>
                        {t('table.price')}
                      </SortButton>
                    </TH>
                    <TH>
                      <SortButton active={sortKey === 'bsr'} order={sortOrder} onClick={() => handleSort('bsr')}>
                        {t('table.bsr')}
                      </SortButton>
                    </TH>
                    <TH>{t('table.rating')}</TH>
                    <TH>{t('table.offers')}</TH>
                    <TH>{t('table.tags')}</TH>
                    <TH>
                      <SortButton active={sortKey === 'date'} order={sortOrder} onClick={() => handleSort('date')}>
                        {t('table.scrapedAt')}
                      </SortButton>
                    </TH>
                    <TH style={{ width: 56 }} data-pdf-exclude />
                  </TR>
                </THead>
                <TBody>
                  {sortedProducts.map((row) => (
                    <TR key={row.id}>
                      <TD data-pdf-exclude>
                        <Checkbox checked={selected.has(row.id)} onCheckedChange={(checked) => handleSelectOne(row.id, Boolean(checked))} />
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
                        <div style={{ fontWeight: 800 }}>${(row.metrics.priceUSD || row.metrics.buyBox?.price || row.metrics.itemPrice || row.metrics.price || 0).toFixed(2)}</div>
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
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default React.memo(ProductTable);
