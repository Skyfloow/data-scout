import React, { Suspense, lazy } from 'react';
import { Box, CircularProgress } from '@mui/material';
import ProductTable from '../modules/scraping/components/ProductTable';
import MetricsCards from '../modules/dashboard/components/MetricsCards';

const DashboardCharts = lazy(() => import('../modules/dashboard/components/DashboardCharts'));

export default function DashboardPage() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Top Row: Metrics (full width) */}
      <Box sx={{ mb: 3 }}>
        <MetricsCards />
      </Box>

      {/* Middle Row: Charts spanning full width */}
      <Box sx={{ mb: 3 }}>
        <Suspense
          fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={26} />
            </Box>
          }
        >
          <DashboardCharts />
        </Suspense>
      </Box>

      {/* Bottom Row: Detailed market table */}
      <Box>
        <ProductTable />
      </Box>
    </Box>
  );
}
