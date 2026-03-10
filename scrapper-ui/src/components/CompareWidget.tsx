import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Scale } from 'lucide-react';
import { useCompare } from '../context/CompareContext';
import { Button } from './ui/button';

export default function CompareWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { products, clearCompare } = useCompare();

  if (products.length === 0 || location.pathname === '/compare') return null;

  const handleCompare = () => {
    navigate('/compare');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        background: 'var(--bg-elevated)',
        padding: '16px 20px',
        borderRadius: 12,
        boxShadow: '0 10px 40px -10px rgba(0,0,0,0.3)',
        border: '1px solid var(--border)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div 
          style={{ 
            background: 'var(--primary)', 
            color: 'var(--bg)', 
            width: 40, 
            height: 40,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Scale size={20} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
            {products.length} / 5 {t('compare.selected', 'Selected')}
          </div>
          <button 
            type="button"
            onClick={clearCompare}
            style={{ 
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--danger, #dc2626)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            {t('compare.clearAll', 'Clear All')}
          </button>
        </div>
      </div>

      <div style={{ width: 1, height: 40, background: 'var(--border)' }} />

      <Button 
        onClick={handleCompare} 
        disabled={products.length < 2}
        style={{ fontWeight: 600 }}
      >
        {t('compare.compareNow', 'Compare Now')}
      </Button>
    </div>
  );
}
