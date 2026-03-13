import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  Product,
  ScraperType,
  JobStatus,
  DashboardMetrics,
  MonitoredEntity,
  TrackerResult,
  PriceHistoryPoint,
  SerpResult,
  TrackingType,
} from '../types';

interface ScrapeRequest {
  url: string;
  scraper: ScraperType;
}

interface ScrapeResponse {
  jobId: string;
  status: JobStatus;
}

interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  resultId?: string;
  error?: string;
}

interface GetProductsParams {
  source?: string;
  scraper?: ScraperType;
}

interface ProductsResponse {
  data: Product[];
}

interface TrackerStatusUpdateBody {
  status: 'active' | 'paused';
}

interface ApiListResponse<T> {
  data: T[];
}

interface TrackerMutationResponse {
  message: string;
  id?: string;
  data?: MonitoredEntity;
}

interface AddBulkTrackersRequest {
  type: TrackingType;
  values: string[];
  marketplace: string;
  intervalHours: number;
}

interface AddBulkTrackersResponse {
  message: string;
  count: number;
  entries?: MonitoredEntity[];
}

interface PriceHistoryResponse {
  url: string;
  history: PriceHistoryPoint[];
}

interface AppSettings {
  defaultScraper?: ScraperType;
  [key: string]: any;
}

const envApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
const normalizedApiUrl = envApiUrl
  ? envApiUrl.endsWith('/') ? envApiUrl : `${envApiUrl}/`
  : '/api/';

export const API_BASE_URL = normalizedApiUrl;

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: API_BASE_URL }),
  tagTypes: ['Products', 'Metrics', 'Trackers'],
  endpoints: (builder) => ({
    triggerScrape: builder.mutation<ScrapeResponse, ScrapeRequest>({
      query: (body) => ({
        url: 'scrape',
        method: 'POST',
        body,
      }),
    }),
    
    getJobStatus: builder.query<JobStatusResponse, string>({
      query: (id) => `jobs/${id}`,
      // When the component uses this query, we can instruct it to poll until status is 'completed' or 'failed'
    }),

    getProducts: builder.query<ProductsResponse, GetProductsParams | void>({
      query: (params) => {
        if (!params) return 'products';
        const queryParams = new URLSearchParams();
        if (params.source) queryParams.append('source', params.source);
        if (params.scraper) queryParams.append('scraper', params.scraper);
        return `products?${queryParams.toString()}`;
      },
      providesTags: ['Products'],
      keepUnusedDataFor: 120,
    }),

    getMetrics: builder.query<DashboardMetrics, void>({
      query: () => 'metrics',
      providesTags: ['Metrics'],
      keepUnusedDataFor: 120,
    }),

    getSettings: builder.query<AppSettings, void>({
      query: () => 'settings/',
      keepUnusedDataFor: 300,
    }),

    getTrackers: builder.query<ApiListResponse<MonitoredEntity>, void>({
      query: () => 'trackers',
      providesTags: ['Trackers'],
    }),

    getTrackersLatestResults: builder.query<ApiListResponse<TrackerResult>, void>({
      query: () => 'trackers/results/latest',
      providesTags: ['Trackers'],
      keepUnusedDataFor: 120,
    }),

    getTrackersResults: builder.query<ApiListResponse<TrackerResult>, void>({
      query: () => 'trackers/results',
      providesTags: ['Trackers'],
      keepUnusedDataFor: 120,
    }),

    removeTracker: builder.mutation<TrackerMutationResponse, string>({
      query: (id) => ({
        url: `trackers/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Trackers'],
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        // Optimistic remove from monitoring tables
        const applyRemoval = (draft: ApiListResponse<{ id: string }>) => {
          draft.data = draft.data.filter((item) => item.id !== id);
        };

        const patchTrackers = dispatch(
          apiSlice.util.updateQueryData('getTrackers', undefined, applyRemoval)
        );
        const patchLatest = dispatch(
          apiSlice.util.updateQueryData('getTrackersLatestResults', undefined, applyRemoval)
        );
        const patchResults = dispatch(
          apiSlice.util.updateQueryData('getTrackersResults', undefined, applyRemoval)
        );
        try {
          await queryFulfilled;
        } catch {
          patchTrackers.undo();
          patchLatest.undo();
          patchResults.undo();
        }
      },
    }),

    updateTrackerStatus: builder.mutation<TrackerMutationResponse, { id: string; status: 'active' | 'paused' }>({
      query: ({ id, status }) => ({
        url: `trackers/${id}/status`,
        method: 'PATCH',
        body: { status } as TrackerStatusUpdateBody,
      }),
      invalidatesTags: ['Trackers'],
      async onQueryStarted({ id, status }, { dispatch, queryFulfilled }) {
        const applyStatusPatch = (draft: ApiListResponse<{ id: string; status: MonitoredEntity['status'] }>) => {
          const target = draft.data.find((item) => item.id === id);
          if (target) target.status = status;
        };

        const patchTrackers = dispatch(
          apiSlice.util.updateQueryData('getTrackers', undefined, applyStatusPatch)
        );
        const patchLatest = dispatch(
          apiSlice.util.updateQueryData('getTrackersLatestResults', undefined, applyStatusPatch)
        );
        const patchResults = dispatch(
          apiSlice.util.updateQueryData('getTrackersResults', undefined, applyStatusPatch)
        );

        try {
          await queryFulfilled;
        } catch {
          patchTrackers.undo();
          patchLatest.undo();
          patchResults.undo();
        }
      },
    }),

    addBulkTrackers: builder.mutation<AddBulkTrackersResponse, AddBulkTrackersRequest>({
      query: (body) => ({
        url: 'trackers/bulk',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Trackers'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const entries = Array.isArray(data?.entries) ? data.entries : [];
          if (entries.length === 0) return;

          // Insert newly created trackers immediately into settings table cache
          dispatch(
            apiSlice.util.updateQueryData('getTrackers', undefined, (draft) => {
              const existing = new Set(draft.data.map((i) => i.id));
              for (const entry of entries) {
                if (!existing.has(entry.id)) draft.data.unshift(entry);
              }
            })
          );

          // Insert placeholders into latest results cache so user sees new rows instantly
          dispatch(
            apiSlice.util.updateQueryData('getTrackersLatestResults', undefined, (draft) => {
              const existing = new Set(draft.data.map((i) => i.id));
              for (const entry of entries) {
                if (!existing.has(entry.id)) {
                  draft.data.unshift({
                    ...entry,
                    latestData: null,
                  });
                }
              }
            })
          );

          dispatch(
            apiSlice.util.updateQueryData('getTrackersResults', undefined, (draft) => {
              const existing = new Set(draft.data.map((i) => i.id));
              for (const entry of entries) {
                if (!existing.has(entry.id)) {
                  draft.data.unshift({
                    ...entry,
                    latestData: null,
                  });
                }
              }
            })
          );
        } catch {
          // Fallback to tag invalidation-driven refetch
        }
      },
    }),

    getKeywordRankings: builder.query<ApiListResponse<SerpResult>, { keyword: string, marketplace: string }>({
      query: ({ keyword, marketplace }) => `rankings?keyword=${encodeURIComponent(keyword)}&marketplace=${encodeURIComponent(marketplace)}`,
    }),

    getPriceHistory: builder.query<PriceHistoryResponse, string>({
      query: (url) => `monitor/history?url=${encodeURIComponent(url)}`,
      transformResponse: (response: { url?: string; data?: PriceHistoryPoint[]; history?: PriceHistoryPoint[] }, _meta, arg) => {
        // Server returns { data: [...] }, while UI consumes { history: [...] }.
        const history = Array.isArray(response.history)
          ? response.history
          : Array.isArray(response.data)
            ? response.data
            : [];
        return {
          url: response.url || arg,
          history,
        };
      },
    }),

    getProductById: builder.query<{ data: Product }, string>({
      query: (id) => `products/by-id/${id}`,
    }),

    deleteProducts: builder.mutation<{ deleted: number }, { ids: string[] }>({
      query: (body) => ({
        url: 'products',
        method: 'DELETE',
        body,
      }),
      invalidatesTags: ['Products', 'Metrics'],
    }),
  }),
});

export const {
  useTriggerScrapeMutation,
  useGetJobStatusQuery,
  useGetProductsQuery,
  useGetMetricsQuery,
  useGetTrackersQuery,
  useGetTrackersLatestResultsQuery,
  useGetTrackersResultsQuery,
  useRemoveTrackerMutation,
  useUpdateTrackerStatusMutation,
  useGetKeywordRankingsQuery,
  useGetPriceHistoryQuery,
  useGetProductByIdQuery,
  useDeleteProductsMutation,
  useAddBulkTrackersMutation,
  useGetSettingsQuery,
} = apiSlice;
