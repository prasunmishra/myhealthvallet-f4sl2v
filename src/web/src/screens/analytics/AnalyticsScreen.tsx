import React, { useCallback, useEffect, useState, useMemo } from 'react';
import styled from '@emotion/styled';
import { useVirtualizer } from '@tanstack/react-virtual';

import HealthMetricsChart from '../../components/analytics/HealthMetricsChart';
import InsightCard from '../../components/analytics/InsightCard';
import { useHealth } from '../../hooks/useHealth';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { Card } from '../../components/common/Card';
import { Toast } from '../../components/common/Toast';

import { METRIC_TYPES, TIME_RANGES } from '../../constants/analytics.constants';
import { MetricDataPoint, TrendAnalysis } from '../../types/analytics.types';

const AnalyticsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.LARGE}px;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  min-height: 100vh;
  background-color: ${({ theme }) => theme.colors.background};
  color-scheme: ${({ theme }) => theme.colorScheme};
`;

const ChartSection = styled(Card)`
  height: 400px;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  
  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    height: 300px;
  }
`;

const InsightsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  margin-top: ${({ theme }) => theme.spacing.LARGE}px;
`;

const MetricControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

interface AnalyticsScreenProps {
  navigation: any;
  theme: any;
  websocketConfig: {
    url: string;
    reconnectInterval: number;
    maxRetries: number;
  };
}

const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  navigation,
  theme,
  websocketConfig
}) => {
  // State management
  const [selectedMetrics, setSelectedMetrics] = useState<METRIC_TYPES[]>([
    METRIC_TYPES.HEART_RATE,
    METRIC_TYPES.BLOOD_PRESSURE
  ]);
  const [timeRange, setTimeRange] = useState({
    type: TIME_RANGES.ONE_WEEK,
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date()
  });
  const [error, setError] = useState<string | null>(null);

  // Custom hooks
  const { 
    metrics, 
    loading, 
    error: healthError,
    fetchMetrics,
    subscribeToMetrics
  } = useHealth();

  // Virtual scrolling setup for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: metrics.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5
  });

  // Memoized chart configuration
  const chartConfig = useMemo(() => ({
    selectedMetrics,
    showLegend: true,
    enableZoom: true,
    yAxisScale: 'linear',
    aggregationType: 'none',
    thresholds: []
  }), [selectedMetrics]);

  // Handle metric selection changes
  const handleMetricsChange = useCallback(async (metrics: METRIC_TYPES[]) => {
    try {
      setSelectedMetrics(metrics);
      await fetchMetrics({
        types: metrics,
        startDate: timeRange.startDate,
        endDate: timeRange.endDate
      });
    } catch (err) {
      setError('Failed to update metrics');
      console.error('Metric update error:', err);
    }
  }, [fetchMetrics, timeRange]);

  // Handle time range changes
  const handleTimeRangeChange = useCallback(async (range: typeof timeRange) => {
    try {
      setTimeRange(range);
      await fetchMetrics({
        types: selectedMetrics,
        startDate: range.startDate,
        endDate: range.endDate
      });
    } catch (err) {
      setError('Failed to update time range');
      console.error('Time range update error:', err);
    }
  }, [fetchMetrics, selectedMetrics]);

  // Initialize WebSocket connection for real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToMetrics(websocketConfig);
    return () => unsubscribe();
  }, [subscribeToMetrics, websocketConfig]);

  // Error handling effect
  useEffect(() => {
    if (healthError) {
      setError(healthError.message);
    }
  }, [healthError]);

  return (
    <ErrorBoundary
      fallback={<div>Error loading analytics dashboard</div>}
      onError={(error) => console.error('Analytics Error:', error)}
    >
      <AnalyticsContainer role="main" aria-label="Health Analytics Dashboard">
        <ChartSection elevation={2}>
          <HealthMetricsChart
            config={chartConfig}
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
            accessibilityProps={{
              ariaLabel: 'Health metrics visualization',
              role: 'img'
            }}
          />
        </ChartSection>

        <MetricControls role="group" aria-label="Metric selection controls">
          {/* Metric selection controls would be implemented here */}
        </MetricControls>

        <InsightsGrid
          ref={parentRef}
          role="list"
          aria-label="Health insights and trends"
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const metric = metrics[virtualRow.index] as MetricDataPoint;
            return (
              <InsightCard
                key={virtualRow.key}
                trendAnalysis={metric.trendAnalysis as TrendAnalysis}
                isLoading={loading}
                onActionClick={(type, data) => {
                  console.log('Insight action:', type, data);
                }}
              />
            );
          })}
        </InsightsGrid>

        {error && (
          <Toast
            message={error}
            type="error"
            duration={5000}
            onClose={() => setError(null)}
          />
        )}
      </AnalyticsContainer>
    </ErrorBoundary>
  );
};

export default AnalyticsScreen;