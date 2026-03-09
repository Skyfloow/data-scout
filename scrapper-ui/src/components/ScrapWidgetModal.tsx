import React, { useEffect, useState, useCallback } from 'react';
import { Rocket, Send } from 'lucide-react';
import { API_BASE_URL } from '../store/apiSlice';
import { ScraperType } from '../types';
import { logger } from '../utils/logger';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useScrapeJob } from '../hooks/useScrapeJob';
import { isValidUrl } from '../utils/validators';

interface ScrapWidgetModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ScrapWidgetModal({ open, onClose }: ScrapWidgetModalProps) {
  const [url, setUrl] = useState('');
  const [scraper, setScraper] = useState<ScraperType>('crawler');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

  const onJobCompleted = useCallback(() => {
    setToastSeverity('success');
    setToastMessage('Сбор успешно завершен! Данные обновлены.');
  }, []);

  const onJobError = useCallback((error: string) => {
    setToastSeverity('error');
    setToastMessage(`Ошибка сбора: ${error}`);
  }, []);

  const { startJob, isStarting } = useScrapeJob({
    onCompleted: onJobCompleted,
    onError: onJobError,
  });

  useEffect(() => {
    if (!open) return;
    setUrl('');
    setErrorMsg(null);
    fetch(`${API_BASE_URL}settings/`)
      .then((res) => res.json())
      .then((data) => {
        if (data.defaultScraper) setScraper(data.defaultScraper);
      })
      .catch((err) => logger.error('Failed to load scraper default', err));
  }, [open]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const handleModalClose = () => {
    if (isStarting) return;
    setUrl('');
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isValidUrl(url)) {
      setErrorMsg('Пожалуйста, введите корректный URL.');
      return;
    }

    try {
      await startJob(url, scraper);
      setToastSeverity('success');
      setToastMessage('Задача запущена в фоне. Пожалуйста, подождите...');
      handleModalClose();
    } catch {
      setErrorMsg('Не удалось запустить сбор. Проверьте, работает ли сервер.');
      setToastSeverity('error');
      setToastMessage('Не удалось запустить сбор. Проверьте, работает ли сервер.');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? handleModalClose() : null)}>
        <DialogContent>
          <DialogHeader style={{ paddingBottom: 16 }}>
            <DialogTitle style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Rocket size={18} strokeWidth={2.5} /> Новая задача сбора
            </DialogTitle>
            <DialogDescription style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
              Запустите быстрый скан товара (Amazon или Etsy) и обновите метрики сразу в дашборде.
            </DialogDescription>
          </DialogHeader>

          <div className="stack-col" style={{ gap: 16 }}>
            {errorMsg ? <Alert variant="destructive">{errorMsg}</Alert> : null}

            <form id="scrap-form" onSubmit={handleSubmit} className="stack-col" style={{ gap: 12 }}>
              <div className="field">
                <label className="field-label">URL товара (Amazon, Etsy)</label>
                <Input
                  placeholder="https://amazon.com/dp/... или https://etsy.com/listing/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isStarting}
                  required
                  autoFocus
                />
                <div className="field-help">Поддерживаются прямые product URL (Amazon, Etsy).</div>
              </div>

              <div className="field">
                <label className="field-label">Движок скрапинга</label>
                <Select value={scraper} onValueChange={(value) => setScraper(value as ScraperType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите движок" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crawler">Встроенный Crawler</SelectItem>
                    <SelectItem value="firecrawl">Firecrawl (LLM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </form>
          </div>

          <DialogFooter style={{ marginTop: 24 }}>
            <Button variant="ghost" onClick={handleModalClose} disabled={isStarting} style={{ borderRadius: 6, height: 36, padding: '0 16px' }}>
              Отмена
            </Button>
            <Button htmlType="submit" form="scrap-form" disabled={isStarting || !url} style={{ borderRadius: 6, height: 36, padding: '0 16px', fontWeight: 500 }} {...({} as any)}>
              <Send size={14} style={{ marginRight: 6 }} />
              {isStarting ? 'Сбор...' : 'Запустить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toastMessage ? <div className={`toast ${toastSeverity === 'success' ? 'toast-success' : 'toast-error'}`}>{toastMessage}</div> : null}
    </>
  );
}
