import React, { useEffect, useState } from 'react';
import { 
  Card, CardContent, Typography, Box, Switch, Divider, Stack, Chip,
  FormControl, InputLabel, Select, MenuItem, FormHelperText, CircularProgress, Snackbar, Alert
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useThemeMode } from '../context/ThemeContext';
import { API_BASE_URL } from '../store/apiSlice';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';

export default function SettingsPage() {
  const { mode, toggleTheme } = useThemeMode();
  const { t, i18n } = useTranslation();
  const [strategy, setStrategy] = useState('hybrid');
  const [scraper, setScraper] = useState('crawler');
  const [proxyMode, setProxyMode] = useState('direct');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  useEffect(() => {
    fetch(`${API_BASE_URL}settings/`)
      .then(res => res.json())
      .then(data => {
        if (data.scrapingStrategy) setStrategy(data.scrapingStrategy);
        if (data.defaultScraper) setScraper(data.defaultScraper);
        if (data.proxyMode) setProxyMode(data.proxyMode);
      })
      .catch(err => logger.error('Failed to load settings', err))
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = async (newStrategy: string, newScraper: string, newProxyMode: string) => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}settings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scrapingStrategy: newStrategy,
          defaultScraper: newScraper,
          proxyMode: newProxyMode
        })
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

  const handleStrategyChange = (event: any) => {
    const newVal = event.target.value as string;
    setStrategy(newVal);
    saveSettings(newVal, scraper, proxyMode);
  };

  const handleScraperChange = (event: any) => {
    const newVal = event.target.value as string;
    setScraper(newVal);
    saveSettings(strategy, newVal, proxyMode);
  };

  const handleProxyModeChange = (event: any) => {
    const newVal = event.target.value as string;
    setProxyMode(newVal);
    saveSettings(strategy, scraper, newVal);
  };

  return (
    <Box sx={{ maxWidth: 760, width: '100%' }}>
      <Typography variant="h4" fontWeight="700" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        {t('settings.title')}
        {isSaving && <CircularProgress size={20} sx={{ ml: 2 }} />}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {t('settings.subtitle')}
      </Typography>

      <Card elevation={2} sx={{ mb: 3, overflow: 'hidden' }}>
        <CardContent>
          <Typography variant="h6" fontWeight="600" gutterBottom>
            {t('settings.localization')}
          </Typography>
          <Divider sx={{ mb: 3 }} />
          <FormControl fullWidth>
            <InputLabel id="language-label">{t('settings.language')}</InputLabel>
            <Select
              labelId="language-label"
              value={i18n.language.substring(0, 2)} 
              label={t('settings.language')}
              onChange={(e) => i18n.changeLanguage(e.target.value as string)}
              disabled={isSaving}
            >
              <MenuItem value="en">{t('settings.english')}</MenuItem>
              <MenuItem value="ru">{t('settings.russian')}</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Card elevation={2} sx={{ mb: 3, overflow: 'hidden' }}>
        <CardContent>
          <Typography variant="h6" fontWeight="600" gutterBottom>
            {t('settings.scrapingEngine')}
          </Typography>
          <Divider sx={{ mb: 3 }} />
          
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel id="default-scraper-label">{t('settings.scrapingEngine')}</InputLabel>
                <Select
                  labelId="default-scraper-label"
                  value={scraper}
                  label={t('settings.scrapingEngine')}
                  onChange={handleScraperChange}
                  disabled={isSaving}
                >
                  <MenuItem value="crawler">{t('settings.internalCrawler')}</MenuItem>
                  <MenuItem value="firecrawl">{t('settings.firecrawlService')}</MenuItem>
                </Select>
                <FormHelperText>
                  {t('settings.chooseEngineHelp')}
                </FormHelperText>
              </FormControl>

              {scraper === 'crawler' && (
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel id="scraping-strategy-label">{t('settings.antiBotStrategy')}</InputLabel>
                  <Select
                    labelId="scraping-strategy-label"
                    value={strategy}
                    label={t('settings.antiBotStrategy')}
                    onChange={handleStrategyChange}
                    disabled={isSaving}
                  >
                    <MenuItem value="hybrid">{t('settings.hybrid')}</MenuItem>
                    <MenuItem value="fast">{t('settings.fast')}</MenuItem>
                    <MenuItem value="stealth">{t('settings.stealth')}</MenuItem>
                  </Select>
                  <FormHelperText>
                    {t('settings.hybridHelp')}
                  </FormHelperText>
                </FormControl>
              )}

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="proxy-mode-label">{t('settings.proxyConfig')}</InputLabel>
                <Select
                  labelId="proxy-mode-label"
                  value={proxyMode}
                  label={t('settings.proxyConfig')}
                  onChange={handleProxyModeChange}
                  disabled={isSaving}
                >
                  <MenuItem value="direct">{t('settings.directConnection')}</MenuItem>
                  <MenuItem value="free">{t('settings.freeProxy')}</MenuItem>
                  <MenuItem value="paid" disabled>{t('settings.paidProxy')}</MenuItem>
                </Select>
                <FormHelperText>
                  {t('settings.proxyHelp')}
                </FormHelperText>
              </FormControl>
            </>
          )}
        </CardContent>
      </Card>

      <Card elevation={2} sx={{ overflow: 'hidden' }}>
        <CardContent>
          <Typography variant="h6" fontWeight="600" gutterBottom>
            {t('settings.appearance')}
          </Typography>
          <Divider sx={{ mb: 3 }} />

          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 0, width: '100%' }}>
              {mode === 'dark' ? (
                <DarkModeIcon sx={{ color: 'primary.main', fontSize: 28 }} />
              ) : (
                <LightModeIcon sx={{ color: 'warning.main', fontSize: 28 }} />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight="600">
                  {mode === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                  {mode === 'dark' 
                    ? t('settings.darkModeHelp') 
                    : t('settings.lightModeHelp')}
                </Typography>
              </Box>
            </Stack>
            <Switch 
              checked={mode === 'dark'} 
              onChange={toggleTheme}
              inputProps={{ 'aria-label': 'Toggle dark mode' }}
              sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
            />
          </Stack>

          <Box sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <InfoOutlinedIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary" fontWeight="600">
                {t('settings.preview')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip 
                label={t('settings.background')} 
                size="small" 
                sx={{ bgcolor: 'background.default', color: 'text.primary' }} 
              />
              <Chip 
                label={t('settings.surface')} 
                size="small" 
                sx={{ bgcolor: 'background.paper', color: 'text.primary' }} 
              />
              <Chip 
                label={t('settings.accent')} 
                size="small" 
                color="secondary"
              />
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card elevation={2} sx={{ mt: 3, overflow: 'hidden' }}>
        <CardContent>
          <Typography variant="h6" fontWeight="600" gutterBottom>
            {t('settings.about')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            <strong>{t('settings.versionInfo').split(' — ')[0]}</strong> — {t('settings.versionInfo').split(' — ')[1]}
          </Typography>
        </CardContent>
      </Card>

      <Snackbar 
        open={Boolean(snackbarMessage)} 
        autoHideDuration={3000} 
        onClose={() => setSnackbarMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={snackbarSeverity} variant="filled" onClose={() => setSnackbarMessage('')}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
