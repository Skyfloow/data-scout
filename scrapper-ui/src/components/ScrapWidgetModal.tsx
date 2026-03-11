import React, { useEffect, useState, useCallback } from 'react';
import { Rocket, Send } from 'lucide-react';
import { useGetSettingsQuery } from '../store/apiSlice';
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
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'warning'>('success');

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

  const { data: settingsData } = useGetSettingsQuery();

  useEffect(() => {
    if (settingsData?.defaultScraper) {
      setScraper(settingsData.defaultScraper);
    }
  }, [settingsData]);

  useEffect(() => {
    if (!open) return;
    setUrl('');
    setErrorMsg(null);
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
          <DialogHeader className="pb-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-[var(--fg)] flex items-center gap-2">
              <Rocket size={18} strokeWidth={2.5} /> Новая задача сбора
            </DialogTitle>
            <DialogDescription className="text-sm mt-1 leading-relaxed">
              Запустите быстрый скан товара (Amazon или Etsy) и обновите метрики сразу в дашборде.
            </DialogDescription>
          </DialogHeader>

          <div className="stack-col gap-4">
            {errorMsg ? <Alert variant="destructive">{errorMsg}</Alert> : null}

            <form id="scrap-form" onSubmit={handleSubmit} className="stack-col gap-3">
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

          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={handleModalClose} disabled={isStarting} className="rounded-md h-9 px-4">
              Отмена
            </Button>
            <Button htmlType="submit" form="scrap-form" disabled={isStarting || !url} className="rounded-md h-9 px-4 font-medium">
              <Send size={14} className="mr-1.5" />
              {isStarting ? 'Сбор...' : 'Запустить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toastMessage ? <div className={`toast ${toastSeverity === 'success' ? 'toast-success' : toastSeverity === 'error' ? 'toast-error' : 'toast-warning'}`}>{toastMessage}</div> : null}
    </>
  );
}
