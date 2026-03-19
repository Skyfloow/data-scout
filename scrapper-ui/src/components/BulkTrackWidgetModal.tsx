import React, { useEffect, useState } from 'react';
import { ListPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAddBulkTrackersMutation } from '../store/apiSlice';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';

interface BulkTrackWidgetModalProps {
  open: boolean;
  onClose: () => void;
}

type TabType = 'product' | 'keyword' | 'category';

export default function BulkTrackWidgetModal({ open, onClose }: BulkTrackWidgetModalProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabType>('product');
  const [values, setValues] = useState('');
  const [marketplace, setMarketplace] = useState('amazon.com');
  const [intervalHours, setIntervalHours] = useState<number>(24);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'warning'>('success');

  const [addBulkTrackers, { isLoading: isSubmitting }] = useAddBulkTrackersMutation();

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const items = values
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean);
    if (items.length === 0) {
      setMessage({ type: 'error', text: t('bulkTrack.emptyValuesError') });
      return;
    }

    try {
      const data = await addBulkTrackers({
        type: tab,
        values: items,
        marketplace,
        intervalHours,
      }).unwrap();

      setToastSeverity('success');
      setToastMessage(t('bulkTrack.successAdded', { count: data.count }));
      setValues('');
      onClose();
    } catch (err: any) {
      const errorText = err?.data?.error || err?.message || t('bulkTrack.saveErrorFallback');
      setMessage({ type: 'error', text: errorText });
      setToastSeverity('error');
      setToastMessage(errorText);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen && !isSubmitting ? onClose() : null)}>
        <DialogContent>
          <DialogHeader style={{ paddingBottom: 16 }}>
            <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ListPlus size={18} strokeWidth={2.5} /> {t('layout.bulkAddTrackers')}
            </DialogTitle>
            <DialogDescription style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
              {t('bulkTrack.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="stack-col" style={{ gap: 16 }}>
            <Tabs value={tab} onValueChange={(value) => {
              setTab(value as TabType);
              setValues('');
            }}>
              <TabsList>
                <TabsTrigger value="product">{t('bulkTrack.tabs.product')}</TabsTrigger>
                <TabsTrigger value="keyword">{t('bulkTrack.tabs.keyword')}</TabsTrigger>
                <TabsTrigger value="category">{t('bulkTrack.tabs.category')}</TabsTrigger>
              </TabsList>
            </Tabs>

            <form id="bulk-track-form" onSubmit={handleSubmit} className="stack-col" style={{ gap: 12 }}>
              {message ? <Alert variant={message.type === 'error' ? 'destructive' : 'success'}>{message.text}</Alert> : null}

              <div className="field-help">
                {tab === 'product' && t('bulkTrack.help.product')}
                {tab === 'keyword' && t('bulkTrack.help.keyword')}
                {tab === 'category' && t('bulkTrack.help.category')}
              </div>

              <Textarea
                rows={6}
                placeholder={
                  tab === 'product'
                    ? 'B0FFTV1LXZ\nB08N5WRWNW'
                    : tab === 'keyword'
                      ? 'iphone 15 case\nwireless earbuds'
                      : '123456789\n987654321'
                }
                value={values}
                onChange={(e) => setValues(e.target.value)}
                disabled={isSubmitting}
                required
              />

              <div className="grid grid-2">
                <div className="field">
                  <label className="field-label">{t('bulkTrack.marketplaceLabel')}</label>
                  <Select value={marketplace} onValueChange={setMarketplace}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('bulkTrack.marketplacePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amazon.com">{t('bulkTrack.marketplaceOptions.amazonCom')}</SelectItem>
                      <SelectItem value="amazon.co.uk">{t('bulkTrack.marketplaceOptions.amazonCoUk')}</SelectItem>
                      <SelectItem value="amazon.de">{t('bulkTrack.marketplaceOptions.amazonDe')}</SelectItem>
                      <SelectItem value="etsy.com">{t('bulkTrack.marketplaceOptions.etsyCom')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="field">
                  <label className="field-label">{t('bulkTrack.frequencyLabel')}</label>
                  <Select value={String(intervalHours)} onValueChange={(value) => setIntervalHours(Number(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('bulkTrack.frequencyPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(10 / 60)}>{t('bulkTrack.intervalOptions.every10min')}</SelectItem>
                      <SelectItem value={String(30 / 60)}>{t('bulkTrack.intervalOptions.every30min')}</SelectItem>
                      <SelectItem value="1">{t('bulkTrack.intervalOptions.every1h')}</SelectItem>
                      <SelectItem value="3">{t('bulkTrack.intervalOptions.every3h')}</SelectItem>
                      <SelectItem value="6">{t('bulkTrack.intervalOptions.every6h')}</SelectItem>
                      <SelectItem value="12">{t('bulkTrack.intervalOptions.every12h')}</SelectItem>
                      <SelectItem value="24">{t('bulkTrack.intervalOptions.every24h')}</SelectItem>
                      <SelectItem value="48">{t('bulkTrack.intervalOptions.every48h')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </form>
          </div>

          <DialogFooter style={{ marginTop: 24 }}>
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting} style={{ borderRadius: 6, height: 36, padding: '0 16px' }}>
              {t('bulkTrack.cancel')}
            </Button>
            <Button htmlType="submit" form="bulk-track-form" disabled={isSubmitting || !values.trim()} style={{ borderRadius: 6, height: 36, padding: '0 16px', fontWeight: 500 }} {...({} as any)}>
              {isSubmitting ? t('bulkTrack.saving') : t('bulkTrack.track')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toastMessage ? <div className={`toast ${toastSeverity === 'success' ? 'toast-success' : toastSeverity === 'error' ? 'toast-error' : 'toast-warning'}`}>{toastMessage}</div> : null}
    </>
  );
}
