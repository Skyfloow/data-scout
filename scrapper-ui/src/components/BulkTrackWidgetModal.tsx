import React, { useEffect, useState } from 'react';
import { ListPlus } from 'lucide-react';
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
  const [tab, setTab] = useState<TabType>('product');
  const [values, setValues] = useState('');
  const [marketplace, setMarketplace] = useState('amazon.com');
  const [intervalHours, setIntervalHours] = useState<number>(24);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

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
      setMessage({ type: 'error', text: 'Пожалуйста, введите хотя бы одно значение.' });
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
      setToastMessage(`Успешно добавлено ${data.count} элементов в мониторинг.`);
      setValues('');
      onClose();
    } catch (err: any) {
      const errorText = err?.data?.error || err?.message || 'Ошибка сохранения';
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
              <ListPlus size={18} strokeWidth={2.5} /> Добавить в мониторинг
            </DialogTitle>
            <DialogDescription style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
              Пакетно добавьте товары, ключи или категории для фонового трекинга и регулярных обновлений.
            </DialogDescription>
          </DialogHeader>

          <div className="stack-col" style={{ gap: 16 }}>
            <Tabs value={tab} onValueChange={(value) => {
              setTab(value as TabType);
              setValues('');
            }}>
              <TabsList>
                <TabsTrigger value="product">Товары</TabsTrigger>
                <TabsTrigger value="keyword">Ключевые слова</TabsTrigger>
                <TabsTrigger value="category">Категории</TabsTrigger>
              </TabsList>
            </Tabs>

            <form id="bulk-track-form" onSubmit={handleSubmit} className="stack-col" style={{ gap: 12 }}>
              {message ? <Alert variant={message.type === 'error' ? 'destructive' : 'success'}>{message.text}</Alert> : null}

              <div className="field-help">
                {tab === 'product' && 'Вставьте список URL или ASIN (каждый с новой строки)'}
                {tab === 'keyword' && 'Вставьте список поисковых запросов для отслеживания позиций (каждый с новой строки)'}
                {tab === 'category' && 'Вставьте Node ID или URL категорий (каждый с новой строки)'}
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
                  <label className="field-label">Marketplace</label>
                  <Select value={marketplace} onValueChange={setMarketplace}>
                    <SelectTrigger>
                      <SelectValue placeholder="Marketplace" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amazon.com">Amazon US (.com)</SelectItem>
                      <SelectItem value="amazon.co.uk">Amazon UK (.co.uk)</SelectItem>
                      <SelectItem value="amazon.de">Amazon DE (.de)</SelectItem>
                      <SelectItem value="etsy.com">Etsy (.com)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="field">
                  <label className="field-label">Частота</label>
                  <Select value={String(intervalHours)} onValueChange={(value) => setIntervalHours(Number(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Частота" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(10 / 60)}>Каждые 10 минут</SelectItem>
                      <SelectItem value={String(30 / 60)}>Каждые 30 минут</SelectItem>
                      <SelectItem value="1">Каждый 1 час</SelectItem>
                      <SelectItem value="3">Каждые 3 часа</SelectItem>
                      <SelectItem value="6">Каждые 6 часов</SelectItem>
                      <SelectItem value="12">Каждые 12 часов</SelectItem>
                      <SelectItem value="24">Каждые 24 часа</SelectItem>
                      <SelectItem value="48">Каждые 48 часов</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </form>
          </div>

          <DialogFooter style={{ marginTop: 24 }}>
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting} style={{ borderRadius: 6, height: 36, padding: '0 16px' }}>
              Отмена
            </Button>
            <Button htmlType="submit" form="bulk-track-form" disabled={isSubmitting || !values.trim()} style={{ borderRadius: 6, height: 36, padding: '0 16px', fontWeight: 500 }} {...({} as any)}>
              {isSubmitting ? 'Сохранение...' : 'Отслеживать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toastMessage ? <div className={`toast ${toastSeverity === 'success' ? 'toast-success' : 'toast-error'}`}>{toastMessage}</div> : null}
    </>
  );
}
