import React, { Suspense, lazy, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import ProductTable from '../modules/scraping/components/ProductTable';
import MetricsCards from '../modules/dashboard/components/MetricsCards';
import { useGetMetricsQuery, useGetProductsQuery } from '../store/apiSlice';
import { exportElementToPdf } from '../utils/export';
import { Button } from '../components/ui/button';

const DashboardCharts = lazy(() => import('../modules/dashboard/components/DashboardCharts'));

export default function DashboardPage() {
  const { isLoading: productsLoading } = useGetProductsQuery({});
  const { isLoading: metricsLoading } = useGetMetricsQuery();
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const exportMarketPdf = async () => {
    if (!pdfRef.current) return;
    setIsExportingPdf(true);
    try {
      await exportElementToPdf(pdfRef.current, `market-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="stack-col" style={{ gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={exportMarketPdf} disabled={productsLoading || metricsLoading || isExportingPdf}>
          <FileDown size={16} />
          {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
        </Button>
      </div>

      <div ref={pdfRef} className="stack-col" style={{ gap: 18 }}>
        <div data-pdf-block>
          <MetricsCards />
        </div>

        <Suspense
          fallback={
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem 0' }}>
              <span className="loader loader-dark" />
            </div>
          }
        >
          <DashboardCharts />
        </Suspense>

        <ProductTable />
      </div>
    </div>
  );
}
