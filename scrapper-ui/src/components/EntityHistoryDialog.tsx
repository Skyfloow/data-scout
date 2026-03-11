import React from 'react';
import { useTranslation } from 'react-i18next';
import { MonitoredEntity } from '../types';
import { KeywordRankingsDialog } from './KeywordRankingsDialog';
import { ProductHistoryDialog } from './ProductHistoryDialog';

interface EntityHistoryDialogProps {
  entity: MonitoredEntity | null;
  onClose: () => void;
}

export function EntityHistoryDialog({ entity, onClose }: EntityHistoryDialogProps) {
  if (!entity) return null;

  if (entity.type === 'product') {
    return <ProductHistoryDialog url={entity.value} onClose={onClose} />;
  }

  if (entity.type === 'keyword') {
    return (
      <KeywordRankingsDialog
        keyword={entity.value}
        marketplace={entity.marketplace}
        onClose={onClose}
      />
    );
  }

  return null;
}
