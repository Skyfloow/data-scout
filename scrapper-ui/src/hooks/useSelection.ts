import { useState, useCallback } from 'react';

export function useSelection<T>(items: T[], keyFn: (item: T) => string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelected(new Set(items.map(keyFn)));
    } else {
      setSelected(new Set());
    }
  }, [items, keyFn]);

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && selected.size < items.length;

  return {
    selected,
    handleSelectAll,
    handleSelectOne,
    clearSelection,
    allSelected,
    someSelected,
  };
}
