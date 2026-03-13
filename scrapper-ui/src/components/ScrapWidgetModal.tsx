import React, { useEffect, useState, useCallback } from 'react';
import { Rocket, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [scraper, setScraper] = useState<ScraperType>('crawler');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'warning'>('success');

  const onJobCompleted = useCallback(() => {
    setToastSeverity('success');
    setToastMessage(t('scrape.jobCompleted'));
  }, [t]);

  const onJobError = useCallback((error: string) => {
    setToastSeverity('error');
    setToastMessage(`${t('scrape.jobErrorPrefix')}: ${error}`);
  }, [t]);

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

    if (!isValidUrl(url) || !url.includes('amazon.')) {
      setErrorMsg(t('scrape.invalidAmazonUrl'));
      return;
    }

    try {
      await startJob(url, scraper);
      setToastSeverity('success');
      setToastMessage(t('scrape.jobStarted'));
      handleModalClose();
    } catch {
      setErrorMsg(t('scrape.startFailed'));
      setToastSeverity('error');
      setToastMessage(t('scrape.startFailed'));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? handleModalClose() : null)}>
        <DialogContent>
          <DialogHeader className="pb-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-[var(--fg)] flex items-center gap-2">
              <Rocket size={18} strokeWidth={2.5} /> {t('scrape.title')}
            </DialogTitle>
            <DialogDescription className="text-sm mt-1 leading-relaxed">
              {t('scrape.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="stack-col gap-4">
            {errorMsg ? <Alert variant="destructive">{errorMsg}</Alert> : null}

            <form id="scrap-form" onSubmit={handleSubmit} className="stack-col gap-3">
              <div className="field">
                <label className="field-label">{t('scrape.productUrlLabel')}</label>
                <Input
                  placeholder={t('scrape.urlPlaceholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isStarting}
                  required
                  autoFocus
                />
                <div className="field-help">{t('scrape.urlHelp')}</div>
              </div>

              <div className="field">
                <label className="field-label">{t('scrape.engineLabel')}</label>
                <Select value={scraper} onValueChange={(value) => setScraper(value as ScraperType)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('scrape.enginePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crawler">{t('scrape.engineCrawler')}</SelectItem>
                    <SelectItem value="firecrawl">Firecrawl (LLM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </form>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={handleModalClose} disabled={isStarting} className="rounded-md h-9 px-4">
              {t('scrape.cancel')}
            </Button>
            <Button htmlType="submit" form="scrap-form" disabled={isStarting || !url} className="rounded-md h-9 px-4 font-medium">
              <Send size={14} className="mr-1.5" />
              {isStarting ? t('scrape.running') : t('scrape.start')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toastMessage ? <div className={`toast ${toastSeverity === 'success' ? 'toast-success' : toastSeverity === 'error' ? 'toast-error' : 'toast-warning'}`}>{toastMessage}</div> : null}
    </>
  );
}
