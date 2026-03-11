import { useState, useMemo, useCallback } from 'react';
import { Product } from '../types';
import { resolveMetricPrice } from '../utils/metrics';

export type SortKey = 'date' | 'price' | 'bsr' | 'title';
export type SortOrder = 'asc' | 'desc';

export function useSortedProducts(products: Product[]) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      setSortOrder((prevOrder) => {
        const isAsc = prevKey === key && prevOrder === 'asc';
        return isAsc ? 'desc' : 'asc';
      });
      return key;
    });
  }, []);

  const sortedProducts = useMemo(() => {
    const mapped = products.map(product => ({
      product,
      date: new Date(product.scrapedAt).getTime(),
      price: resolveMetricPrice(product.metrics),
      bsr: product.metrics.bsrCategories?.[0]?.rank || 9999999,
      title: product.title.toLowerCase()
    }));

    mapped.sort((a, b) => {
      let aVal: string | number = a[sortKey];
      let bVal: string | number = b[sortKey];
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return mapped.map(item => item.product);
  }, [products, sortKey, sortOrder]);

  return useMemo(() => ({
    sortedProducts,
    sortKey,
    sortOrder,
    handleSort,
  }), [sortedProducts, sortKey, sortOrder, handleSort]);
}
