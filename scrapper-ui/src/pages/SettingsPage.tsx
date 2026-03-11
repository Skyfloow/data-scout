import React, { useEffect, useState } from 'react';
import { Info, MoonStar, SunMedium } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../context/ThemeContext';
import { API_BASE_URL } from '../store/apiSlice';
import { logger } from '../utils/logger';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Switch } from '../components/ui/switch';

export default function SettingsPage() {
  const { mode, toggleTheme } = useThemeMode();
  const { t, i18n } = useTranslation();
  const [strategy, setStrategy] = useState('hybrid');
  const [scraper, setScraper] = useState('crawler');
  const [proxyMode, setProxyMode] = useState('direct');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'warning'>('success');

  useEffect(() => {
    fetch(`${API_BASE_URL}settings/`)
      .then((res) => res.json())
      .then((data) => {
        if (data.scrapingStrategy) setStrategy(data.scrapingStrategy);
        if (data.defaultScraper) setScraper(data.defaultScraper);
        if (data.proxyMode) setProxyMode(data.proxyMode);
      })
      .catch((err) => logger.error('Failed to load settings', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!snackbarMessage) return;
    const timeout = window.setTimeout(() => setSnackbarMessage(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [snackbarMessage]);

  const saveSettings = async (newStrategy: string, newScraper: string, newProxyMode: string) => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}settings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scrapingStrategy: newStrategy,
          defaultScraper: newScraper,
          proxyMode: newProxyMode,
        }),
      });
      if (response.ok) {
        setSnackbarSeverity('success');
        setSnackbarMessage(t('settings.saveSuccess'));
      } else {
        setSnackbarSeverity('error');
        setSnackbarMessage(t('settings.serverError'));
      }
    } catch (err) {
      logger.error('Failed to save settings', err);
      setSnackbarSeverity('error');
      setSnackbarMessage(t('settings.networkError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="stack-col" style={{ maxWidth: 900, width: '100%' }}>
      <div className="stack-col" style={{ gap: 6 }}>
        <h1 className="page-title">
          {t('settings.title')} {isSaving ? <span className="loader loader-dark" style={{ verticalAlign: 'middle', marginLeft: 8 }} /> : null}
        </h1>
        <p className="page-subtitle">{t('settings.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.localization')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="field">
            <label className="field-label">{t('settings.language')}</label>
            <Select value={i18n.language.substring(0, 2)} onValueChange={(value) => i18n.changeLanguage(value)}>
              <SelectTrigger style={{ maxWidth: 220 }}>
                <SelectValue placeholder={t('settings.language')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t('settings.english')}</SelectItem>
                <SelectItem value="ru">{t('settings.russian')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.scrapingEngine')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
              <span className="loader loader-dark" />
            </div>
          ) : (
            <div className="stack-col" style={{ gap: 14 }}>
              <div className="field">
                <label className="field-label">{t('settings.scrapingEngine')}</label>
                <Select
                  value={scraper}
                  onValueChange={(newVal) => {
                    setScraper(newVal);
                    saveSettings(strategy, newVal, proxyMode);
                  }}
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.scrapingEngine')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crawler">{t('settings.internalCrawler')}</SelectItem>
                    <SelectItem value="firecrawl">{t('settings.firecrawlService')}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="field-help">{t('settings.chooseEngineHelp')}</div>
              </div>

              {scraper === 'crawler' ? (
                <div className="field">
                  <label className="field-label">{t('settings.antiBotStrategy')}</label>
                  <Select
                    value={strategy}
                    onValueChange={(newVal) => {
                      setStrategy(newVal);
                      saveSettings(newVal, scraper, proxyMode);
                    }}
                    disabled={isSaving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('settings.antiBotStrategy')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hybrid">{t('settings.hybrid')}</SelectItem>
                      <SelectItem value="fast">{t('settings.fast')}</SelectItem>
                      <SelectItem value="stealth">{t('settings.stealth')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="field-help">{t('settings.hybridHelp')}</div>
                </div>
              ) : null}

              <div className="field">
                <label className="field-label">{t('settings.proxyConfig')}</label>
                <Select
                  value={proxyMode}
                  onValueChange={(newVal) => {
                    setProxyMode(newVal);
                    saveSettings(strategy, scraper, newVal);
                  }}
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.proxyConfig')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">{t('settings.directConnection')}</SelectItem>
                    <SelectItem value="free">{t('settings.freeProxy')}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="field-help">{t('settings.proxyHelp')}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {mode === 'dark' ? <MoonStar size={24} color="var(--primary)" /> : <SunMedium size={24} color="var(--warning)" />}
              <div>
                <div style={{ fontWeight: 700 }}>{mode === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}</div>
                <div className="muted" style={{ fontSize: '0.84rem' }}>
                  {mode === 'dark' ? t('settings.darkModeHelp') : t('settings.lightModeHelp')}
                </div>
              </div>
            </div>
            <Switch checked={mode === 'dark'} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
          </div>

          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: '1px dashed var(--border)', background: 'color-mix(in oklab, var(--bg-soft) 65%, transparent)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Info size={14} />
              <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                {t('settings.preview')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge variant="secondary">{t('settings.background')}</Badge>
              <Badge variant="outline">{t('settings.surface')}</Badge>
              <Badge>{t('settings.accent')}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.about')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Separator />
          <p className="muted" style={{ marginTop: 10 }}>
            <strong>{t('settings.versionInfo').split(' — ')[0]}</strong> — {t('settings.versionInfo').split(' — ')[1]}
          </p>
        </CardContent>
      </Card>

      {snackbarMessage ? (
        <div className={`toast ${snackbarSeverity === 'success' ? 'toast-success' : snackbarSeverity === 'error' ? 'toast-error' : 'toast-warning'}`}>
          {snackbarMessage}
        </div>
      ) : null}
    </div>
  );
}
