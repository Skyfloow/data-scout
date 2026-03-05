import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  TextField, 
  Button, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  CircularProgress,
  Alert
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useTriggerScrapeMutation, useGetJobStatusQuery, apiSlice } from '../../../store/apiSlice';
import { ScraperType } from '../../../types';
import { useDispatch } from 'react-redux';

export default function ScrapeForm() {
  const [url, setUrl] = useState('');
  const [scraper, setScraper] = useState<ScraperType>('crawler');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  const [triggerScrape, { isLoading: isStarting }] = useTriggerScrapeMutation();
  const dispatch = useDispatch();

  // Polling via RTK Query if there is an active job ID
  const { data: jobStatus } = useGetJobStatusQuery(currentJobId as string, {
    skip: !currentJobId,
    pollingInterval: 2000,
  });

  // Handle completion or failure based on polling status
  useEffect(() => {
    if (jobStatus) {
      if (jobStatus.status === 'completed') {
        setCurrentJobId(null);
        setErrorMsg(null);
        // Invalidate cache to refetch products & metrics
        dispatch(apiSlice.util.invalidateTags(['Products', 'Metrics']));
      } else if (jobStatus.status === 'failed') {
        setCurrentJobId(null);
        setErrorMsg(jobStatus.error || 'The scraping job failed.');
      }
    }
  }, [jobStatus, dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setCurrentJobId(null);

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setErrorMsg('Please enter a valid URL.');
      return;
    }

    try {
      const response = await triggerScrape({ url, scraper }).unwrap();
      setCurrentJobId(response.jobId);
      setUrl('');
    } catch (err: any) {
      setErrorMsg('Failed to start scraping job. Ensure server is running.');
    }
  };

  const isPolling = currentJobId !== null;

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" gutterBottom fontWeight="600">
          New Scrape Task
        </Typography>
        
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>
        )}
        
        {jobStatus?.status === 'pending' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Job is in progress [{currentJobId}]...
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            fullWidth
            size="small"
            label="Product URL (Amazon, Etsy)"
            variant="outlined"
            placeholder="https://amazon.com/... or https://etsy.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isStarting || isPolling}
            sx={{ flexGrow: 1, minWidth: '250px' }}
            required
          />
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Scraper Engine</InputLabel>
            <Select
              value={scraper}
              label="Scraper Engine"
              onChange={(e) => setScraper(e.target.value as ScraperType)}
              disabled={isStarting || isPolling}
            >
              <MenuItem value="crawler">Native Crawler</MenuItem>
              <MenuItem value="firecrawl">Firecrawl (LLM)</MenuItem>
            </Select>
          </FormControl>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isStarting || isPolling || !url}
            endIcon={isStarting || isPolling ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            sx={{ height: 40, px: 4 }}
          >
            {isStarting || isPolling ? 'Scraping...' : 'Run'}
          </Button>
        </Box>

      </CardContent>
    </Card>
  );
}
