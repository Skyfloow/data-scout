import React, { useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, FileSpreadsheet, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDeleteProductsMutation, useGetProductsQuery } from '../../../store/apiSlice';
import { Product, ScraperType } from '../../../types';
import { exportProductsToCsv } from '../../../utils/export';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Checkbox } from '../../../components/ui/checkbox';
import { Alert } from '../../../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableWrap, TBody, TH, THead, TR } from '../../../components/ui/table';
import { useSelection } from '../../../hooks/useSelection';
import { useSortedProducts, SortOrder } from '../../../hooks/useSortedProducts';
import ProductTableRow from './ProductTableRow';

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

  const params = {
    source: filterSource !== 'all' ? filterSource : undefined,
    scraper: filterScraper !== 'all' ? (filterScraper as ScraperType) : undefined,
  };

  const { data, isLoading, error } = useGetProductsQuery(params);
  const [deleteProducts, { isLoading: isDeleting }] = useDeleteProductsMutation();
  const products: Product[] = data?.data || [];

  const { sortedProducts, sortKey, sortOrder, handleSort } = useSortedProducts(products);
  
  const { selected, handleSelectAll, handleSelectOne, clearSelection, allSelected, someSelected } = useSelection(
    sortedProducts,
    (product) => product.id
  );

  const handleDelete = async () => {
    if (selected.size === 0) return;
    await deleteProducts({ ids: Array.from(selected) });
    clearSelection();
  };

  const handleExportCsv = () => {
    exportProductsToCsv(sortedProducts);
  };

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
                    <ProductTableRow 
                      key={row.id} 
                      row={row} 
                      isSelected={selected.has(row.id)} 
                      onSelectChange={handleSelectOne} 
                    />
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
