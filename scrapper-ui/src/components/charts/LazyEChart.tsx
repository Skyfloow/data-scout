import React, { Suspense } from 'react';

const EChart = React.lazy(() => import('echarts-for-react'));

interface LazyEChartProps {
  style?: React.CSSProperties;
  option: Record<string, unknown>;
}

export default function LazyEChart({ style, option }: LazyEChartProps) {
  return (
    <Suspense fallback={<div style={{ ...style, minHeight: style?.height || 240 }} />}>
      <EChart style={style} option={option} />
    </Suspense>
  );
}
