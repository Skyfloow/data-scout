import { useState, useMemo } from 'react';
import { Product } from '../types';
import { resolveMetricPrice } from '../utils/metrics';

export type SortKey = 'date' | 'price' | 'bsr' | 'title';
export type SortOrder = 'asc' | 'desc';

export function useSortedProducts(products: Product[]) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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
        aVal = resolveMetricPrice(a.metrics);
        bVal = resolveMetricPrice(b.metrics);
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

  return {
    sortedProducts,
    sortKey,
    sortOrder,
    handleSort,
  };
}
