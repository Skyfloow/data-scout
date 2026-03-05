import React, { useState } from 'react';
import { 
  Box, Typography, TextField, Button, FormControl, InputLabel, 
  Select, MenuItem, CircularProgress, Alert, Dialog, DialogTitle, 
  DialogContent, DialogActions, IconButton, Tabs, Tab, Snackbar
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import AddTaskIcon from '@mui/icons-material/AddTask';
import { useAddBulkTrackersMutation } from '../store/apiSlice';

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
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

  const [addBulkTrackers, { isLoading: isSubmitting }] = useAddBulkTrackersMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const items = values.split('\n').map(v => v.trim()).filter(Boolean);
    if (items.length === 0) {
      setMessage({ type: 'error', text: 'Пожалуйста, введите хотя бы одно значение.' });
      return;
    }

    try {
      const data = await addBulkTrackers({
        type: tab,
        values: items,
        marketplace,
        intervalHours
      }).unwrap();

      setToastSeverity('success');
      setToastMessage(`Успешно добавлено ${data.count} элементов в мониторинг.`);
      setValues('');
      onClose();
      
    } catch (err: any) {
      setMessage({ type: 'error', text: err.data?.error || err.message || 'Ошибка сохранения' });
      setToastSeverity('error');
      setToastMessage(err.data?.error || err.message || 'Ошибка сохранения');
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={isSubmitting ? undefined : onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: (currentTheme) =>
              currentTheme.palette.mode === 'dark'
                ? `0 24px 52px ${alpha('#000', 0.52)}`
                : `0 24px 52px ${alpha(currentTheme.palette.primary.main, 0.22)}`,
          },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: (currentTheme) => alpha(currentTheme.palette.primary.main, currentTheme.palette.mode === 'dark' ? 0.12 : 0.07), borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" fontWeight="600">
            Добавить в мониторинг
          </Typography>
          <IconButton aria-label="close" onClick={onClose} disabled={isSubmitting} sx={{ color: 'grey.500' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: 0, bgcolor: 'background.paper' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={tab} 
              onChange={(e, v) => {
                setTab(v);
                setValues('');
              }} 
              variant="fullWidth"
            >
              <Tab label="Товары (ASIN/URL)" value="product" />
              <Tab label="Ключевые слова" value="keyword" />
              <Tab label="Категории" value="category" />
            </Tabs>
          </Box>

          <Box component="form" id="bulk-track-form" onSubmit={handleSubmit} sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {message && (
              <Alert severity={message.type}>{message.text}</Alert>
            )}

            <Typography variant="body2" color="text.secondary">
              {tab === 'product' && "Вставьте список URL или ASIN (каждый с новой строки)"}
              {tab === 'keyword' && "Вставьте список поисковых запросов для отслеживания позиций (каждый с новой строки)"}
              {tab === 'category' && "Вставьте Node ID или URL категорий (каждый с новой строки)"}
            </Typography>

            <TextField
              fullWidth
              multiline
              rows={5}
              placeholder={
                tab === 'product' ? "B0FFTV1LXZ\nB08N5WRWNW" : 
                tab === 'keyword' ? "iphone 15 case\nwireless earbuds" : 
                "123456789\n987654321"
              }
              value={values}
              onChange={(e) => setValues(e.target.value)}
              disabled={isSubmitting}
              required
              sx={{ '& .MuiInputBase-root': { bgcolor: 'background.paper' } }}
            />
            
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" sx={{ flexGrow: 1 }}>
                <InputLabel>Marketplace</InputLabel>
                <Select
                  value={marketplace}
                  label="Marketplace"
                  onChange={(e) => setMarketplace(e.target.value)}
                  disabled={isSubmitting}
                >
                  <MenuItem value="amazon.com">Amazon US (.com)</MenuItem>
                  <MenuItem value="amazon.co.uk">Amazon UK (.co.uk)</MenuItem>
                  <MenuItem value="amazon.de">Amazon DE (.de)</MenuItem>
                  <MenuItem value="etsy.com">Etsy (.com)</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ flexGrow: 1 }}>
                <InputLabel>Частота</InputLabel>
                <Select
                  value={intervalHours}
                  label="Частота"
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                  disabled={isSubmitting}
                >
                  <MenuItem value={10 / 60}>Каждые 10 минут</MenuItem>
                  <MenuItem value={30 / 60}>Каждые 30 минут</MenuItem>
                  <MenuItem value={1}>Каждый 1 час</MenuItem>
                  <MenuItem value={3}>Каждые 3 часа</MenuItem>
                  <MenuItem value={6}>Каждые 6 часов</MenuItem>
                  <MenuItem value={12}>Каждые 12 часов</MenuItem>
                  <MenuItem value={24}>Каждые 24 часа</MenuItem>
                  <MenuItem value={48}>Каждые 48 часов</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 2, px: 3, bgcolor: (currentTheme) => alpha(currentTheme.palette.primary.main, currentTheme.palette.mode === 'dark' ? 0.1 : 0.06), borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={onClose} disabled={isSubmitting} sx={{ mr: 1 }} color="inherit">
            Отмена
          </Button>
          <Button
            type="submit"
            form="bulk-track-form"
            variant="contained"
            disabled={isSubmitting || !values.trim()}
            endIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <AddTaskIcon />}
            sx={{ px: 4, py: 1 }}
          >
            {isSubmitting ? 'Сохранение...' : 'Отслеживать'}
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
