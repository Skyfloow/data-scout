import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product } from '../types';

interface CompareContextType {
  products: Product[];
  addProduct: (product: Product) => void;
  removeProduct: (productId: string) => void;
  clearCompare: () => void;
}

const CompareContext = createContext<CompareContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'data-scout-compare';
const MAX_COMPARE_ITEMS = 5;

export const CompareProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setProducts(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load compare products from localStorage', err);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when products change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
      } catch (err) {
        console.error('Failed to save compare products to localStorage', err);
      }
    }
  }, [products, isLoaded]);

  const addProduct = (product: Product) => {
    setProducts((prev) => {
      // Don't add if already exists
      if (prev.some((p) => p.id === product.id)) return prev;
      if (prev.length >= MAX_COMPARE_ITEMS) return prev;
      return [...prev, product];
    });
  };

  const removeProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const clearCompare = () => {
    setProducts([]);
  };

  return (
    <CompareContext.Provider value={{ products, addProduct, removeProduct, clearCompare }}>
      {children}
    </CompareContext.Provider>
  );
};

export const useCompare = () => {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
};
