import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  CircularProgress,
  Alert,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import { useTriggerScrapeMutation, useGetJobStatusQuery, apiSlice, API_BASE_URL } from '../store/apiSlice';
import { ScraperType } from '../types';
import { useDispatch } from 'react-redux';
import { logger } from '../utils/logger';

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
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const [triggerScrape, { isLoading: isStarting }] = useTriggerScrapeMutation();
  const dispatch = useDispatch();

  const { data: jobStatus } = useGetJobStatusQuery(currentJobId as string, {
    skip: !currentJobId,
    pollingInterval: 2000,
  });

  useEffect(() => {
    if (jobStatus) {
      if (jobStatus.status === 'completed') {
        setCurrentJobId(null);
        dispatch(apiSlice.util.invalidateTags(['Products', 'Metrics']));
        setToastSeverity('success');
        setToastMessage('Сбор успешно завершен! Данные обновлены.');
      } else if (jobStatus.status === 'failed') {
        setCurrentJobId(null);
        setToastSeverity('error');
        setToastMessage(`Ошибка сбора: ${jobStatus.error || 'Неизвестная ошибка'}`);
      }
    }
  }, [jobStatus, dispatch]);

  useEffect(() => {
    if (open) {
      setUrl('');
      setErrorMsg(null);
      fetch(`${API_BASE_URL}settings/`)
        .then(res => res.json())
        .then(data => {
          if (data.defaultScraper) setScraper(data.defaultScraper);
        })
        .catch(err => logger.error('Failed to load scraper default', err));
    }
  }, [open]);

  const handleModalClose = () => {
    if (isStarting) return;
    setUrl('');
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      new URL(url);
    } catch {
      setErrorMsg('Пожалуйста, введите корректный URL.');
      return;
    }

    try {
      const response = await triggerScrape({ url, scraper }).unwrap();
      setCurrentJobId(response.jobId);
      setToastSeverity('success');
      setToastMessage('Задача запущена в фоне. Пожалуйста, подождите...');
      handleModalClose();
    } catch (err: any) {
      setErrorMsg('Не удалось запустить сбор. Проверьте, работает ли сервер.');
      setToastSeverity('error');
      setToastMessage('Не удалось запустить сбор. Проверьте, работает ли сервер.');
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleModalClose}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={isStarting}
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: (currentTheme) =>
              currentTheme.palette.mode === 'dark'
                ? `0 24px 52px ${alpha('#000', 0.52)}`
                : `0 24px 52px ${alpha(currentTheme.palette.primary.main, 0.22)}`,
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle
          sx={{
            m: 0,
            p: 2.25,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            bgcolor: (currentTheme) => alpha(currentTheme.palette.primary.main, currentTheme.palette.mode === 'dark' ? 0.14 : 0.08),
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.2 }}>
            <Box
              sx={{
                mt: 0.2,
                p: 0.8,
                borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.14),
                color: 'primary.main',
                display: 'inline-flex',
              }}
            >
              <RocketLaunchOutlinedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight="700" sx={{ lineHeight: 1.2 }}>
                Новая задача сбора
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Запустите быстрый скан товара и обновите метрики в дашборде.
              </Typography>
            </Box>
          </Box>
          <IconButton
            aria-label="close"
            onClick={handleModalClose}
            disabled={isStarting}
            sx={{ color: (theme) => theme.palette.grey[500] }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ bgcolor: 'background.paper', p: 2.25 }}>
          <Box
            sx={{
              mb: 2,
              p: 1.5,
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.07 : 0.035),
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
              Вставьте ссылку товара и выберите движок. После запуска данные автоматически подтянутся в таблицу и метрики.
            </Typography>
          </Box>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>
          )}

          <Box component="form" id="scrap-form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.25, pt: 0.5 }}>
            <TextField
              fullWidth
              size="medium"
              label="URL товара (Amazon, Etsy)"
              variant="outlined"
              placeholder="https://amazon.com/dp/... или https://etsy.com/listing/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isStarting}
              required
              autoFocus
              helperText="Поддерживаются прямые product URL (Amazon, Etsy)."
              sx={{
                '& .MuiInputBase-root': { bgcolor: 'background.paper' },
                '& .MuiInputLabel-root': {
                  px: 0.5,
                  borderRadius: 0.75,
                },
                '& .MuiInputLabel-shrink': {
                  bgcolor: 'background.paper',
                },
              }}
            />
            
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl
                size="medium"
                sx={{
                  minWidth: 200,
                  flexGrow: 1,
                  '& .MuiInputLabel-root': {
                    px: 0.5,
                    borderRadius: 0.75,
                  },
                  '& .MuiInputLabel-shrink': {
                    bgcolor: 'background.paper',
                  },
                }}
              >
                <InputLabel>Движок скрапинга</InputLabel>
                <Select
                  value={scraper}
                  label="Движок скрапинга"
                  onChange={(e) => setScraper(e.target.value as ScraperType)}
                  disabled={isStarting}
                >
                  <MenuItem value="crawler">Встроенный Crawler</MenuItem>
                  <MenuItem value="firecrawl">Firecrawl (LLM)</MenuItem>
                </Select>
              </FormControl>

            </Box>
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 2, px: 2.25, bgcolor: (currentTheme) => alpha(currentTheme.palette.primary.main, currentTheme.palette.mode === 'dark' ? 0.12 : 0.06), borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={handleModalClose} disabled={isStarting} sx={{ mr: 1 }} color="inherit">
            Отмена
          </Button>
          <Button
            type="submit"
            form="scrap-form"
            variant="contained"
            color="primary"
            disabled={isStarting || !url}
            endIcon={isStarting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            sx={{ px: 4, py: 1, color: '#fff !important' }}
          >
            {isStarting ? 'Сбор...' : 'Запустить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toastMessage)}
        autoHideDuration={2800}
        onClose={() => setToastMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={toastSeverity} onClose={() => setToastMessage('')} variant="filled">
          {toastMessage}
        </Alert>
      </Snackbar>
    </>
  );
}
