import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { useGetJobStatusQuery, useTriggerScrapeMutation, apiSlice } from '../../../store/apiSlice';
import { ScraperType } from '../../../types';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

export default function ScrapeForm() {
  const [url, setUrl] = useState('');
  const [scraper, setScraper] = useState<ScraperType>('firecrawl');
  const isProduction = import.meta.env.PROD;
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [triggerScrape, { isLoading: isStarting }] = useTriggerScrapeMutation();
  const dispatch = useDispatch();

  const { data: jobStatus } = useGetJobStatusQuery(currentJobId as string, {
    skip: !currentJobId,
    pollingInterval: 2000,
  });

  useEffect(() => {
    if (!jobStatus) return;
    if (jobStatus.status === 'completed') {
      setCurrentJobId(null);
      setErrorMsg(null);
      dispatch(apiSlice.util.invalidateTags(['Products', 'Metrics']));
    } else if (jobStatus.status === 'failed') {
      setCurrentJobId(null);
      setErrorMsg(jobStatus.error || 'The scraping job failed.');
    }
  }, [jobStatus, dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setCurrentJobId(null);

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
    } catch {
      setErrorMsg('Failed to start scraping job. Ensure server is running.');
    }
  };

  const isPolling = currentJobId !== null;

  return (
    <Card>
      <CardContent>
        <CardTitle>New Scrape Task</CardTitle>

        <div className="stack-col" style={{ gap: 12, marginTop: 12 }}>
          {errorMsg ? <Alert variant="destructive">{errorMsg}</Alert> : null}
          {jobStatus?.status === 'pending' ? <Alert variant="info">Job is in progress [{currentJobId}]...</Alert> : null}

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              placeholder="https://amazon.com/... or https://etsy.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isStarting || isPolling}
              style={{ flexGrow: 1, minWidth: 250 }}
              required
            />

            {!isProduction ? (
              <Select value={scraper} onValueChange={(value) => setScraper(value as ScraperType)}>
                <SelectTrigger style={{ width: 172 }}>
                  <SelectValue placeholder="Scraper Engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crawler">Native Crawler</SelectItem>
                  <SelectItem value="firecrawl">Firecrawl (LLM)</SelectItem>
                </SelectContent>
              </Select>
            ) : null}

            <Button htmlType="submit" disabled={isStarting || isPolling || !url}>
              <Send size={15} />
              {isStarting || isPolling ? 'Scraping...' : 'Run'}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
