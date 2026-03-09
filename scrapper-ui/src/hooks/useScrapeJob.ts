import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useTriggerScrapeMutation, useGetJobStatusQuery, apiSlice } from '../store/apiSlice';
import { ScraperType } from '../types';

interface UseScrapeJobProps {
  onCompleted: () => void;
  onError: (errorMsg: string) => void;
}

export function useScrapeJob({ onCompleted, onError }: UseScrapeJobProps) {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
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
      dispatch(apiSlice.util.invalidateTags(['Products', 'Metrics']));
      onCompleted();
    } else if (jobStatus.status === 'failed') {
      setCurrentJobId(null);
      onError(jobStatus.error || 'Unknown error');
    }
  }, [jobStatus, dispatch, onCompleted, onError]);

  const startJob = async (url: string, scraper: ScraperType) => {
    const response = await triggerScrape({ url, scraper }).unwrap();
    setCurrentJobId(response.jobId);
    return response;
  };

  return {
    startJob,
    isStarting,
  };
}
