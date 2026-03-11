import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetPriceHistoryQuery } from '../store/apiSlice';
import { PriceHistoryPoint } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from './ui/table';

interface ProductHistoryDialogProps {
  url: string;
  onClose: () => void;
}

export function ProductHistoryDialog({ url, onClose }: ProductHistoryDialogProps) {
  const { t } = useTranslation();
  const { data: historyData, isFetching } = useGetPriceHistoryQuery(url);
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // no-op
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent width={920}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span>{t('monitoring.priceHistory')}</span>
            <button className="icon-btn" onClick={handleCopyUrl} title={copied ? t('monitoring.copied') : t('monitoring.copyUrl')}>
              <Copy size={15} />
            </button>
          </DialogTitle>
          <div className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={url}>
            {url}
          </div>
        </DialogHeader>

        <div className="modal-scroll-area">
          {isFetching ? (
            <div className="text-center" style={{ padding: '2rem 0' }}>
              <span className="loader loader-dark" />
            </div>
          ) : (
            <TableWrap style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
              <Table style={{ minWidth: 400 }}>
                <THead>
                  <TR>
                    <TH>{t('monitoring.date')}</TH>
                    <TH>{t('monitoring.price')}</TH>
                    <TH>{t('monitoring.currency')}</TH>
                    <TH>{t('monitoring.eqUsd')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {(historyData?.history ?? []).map((h: PriceHistoryPoint, i: number) => (
                    <TR key={`${h.scrapedAt}-${i}`}>
                      <TD>{new Date(h.scrapedAt).toLocaleString()}</TD>
                      <TD>{h.price}</TD>
                      <TD>{h.currency}</TD>
                      <TD>${h.priceUSD || h.price}</TD>
                    </TR>
                  ))}
                  {(!historyData?.history || historyData.history.length === 0) ? (
                    <TR>
                      <TD colSpan={4} className="text-center">
                        {t('monitoring.noPriceHistory')}
                      </TD>
                    </TR>
                  ) : null}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('monitoring.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
