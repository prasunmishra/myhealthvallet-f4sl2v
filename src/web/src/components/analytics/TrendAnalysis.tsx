import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useWebSocket } from 'react-use-websocket'; // ^4.3.1
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.11

import HealthMetricsChart from './HealthMetricsChart';
import MetricSelector from './MetricSelector';
import { useHealth } from '../../hooks/useHealth';
import { METRIC_TYPES, TIME_RANGES } from '../../constants/analytics.constants';
import { WEBSOCKET_ROUTES } from '../../constants/api.constants';
import { createFadeAnimation } from '../../styles/animations';

// Styled Components
const TrendAnalysisContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  ${createFadeAnimation()};

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    padding: ${({ theme }) => theme.spacing.SMALL}px;
  }
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
  flex-wrap: wrap;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    flex-direction: column;
  }
`;

const InsightsContainer = styled.div`
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  background-color: ${({ theme }) => theme.colors.surface[200]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  border-left: 4px solid ${({ theme }) => theme.colors.primary[500]};
  aria-live: polite;
`;

const TimeRangeSelector = styled.select`
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  border: 1px solid ${({ theme }) => theme.colors.surface[300]};
  background-color: ${({ theme }) => theme.colors.surface[100]};
  min-width: 150px;
`;

// Component Props Interface
interface TrendAnalysisProps {
  onInsightGenerated?: (insights: string[]) => void;
  className?: string;
}

const TrendAnalysis: React.FC<TrendAnalysisProps> = ({
  onInsightGenerated,
  className
}) => {
  // State Management
  const [selectedMetrics, setSelectedMetrics] = useState<METRIC_TYPES[]>([]);
  const [timeRange, setTimeRange] = useState<TIME_RANGES>(TIME_RANGES.ONE_WEEK);
  const [insights, setInsights] = useState<string[]>([]);
  const { metrics, loading, error } = useHealth();

  // WebSocket Setup for Real-time Updates
  const { sendMessage, lastMessage } = useWebSocket(WEBSOCKET_ROUTES.ANALYSIS_STATUS, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    reconnectAttempts: 10
  });

  // Chart Configuration
  const chartConfig = {
    type: 'line',
    selectedMetrics,
    showLegend: true,
    enableZoom: true,
    yAxisScale: 'linear',
    aggregationType: 'none'
  };

  // Handlers
  const handleMetricsChange = useCallback((newMetrics: METRIC_TYPES[]) => {
    setSelectedMetrics(newMetrics);
    // Subscribe to real-time updates for selected metrics
    sendMessage(JSON.stringify({
      type: 'subscribe',
      metrics: newMetrics
    }));
  }, [sendMessage]);

  const handleTimeRangeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeRange(event.target.value as TIME_RANGES);
  }, []);

  // Process real-time updates
  useEffect(() => {
    if (lastMessage) {
      try {
        const update = JSON.parse(lastMessage.data);
        if (update.type === 'insight') {
          setInsights(prev => [...prev, update.message]);
          onInsightGenerated?.([...insights, update.message]);
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    }
  }, [lastMessage, insights, onInsightGenerated]);

  // Error handling component
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div role="alert">
      <h3>Error analyzing trends</h3>
      <pre>{error.message}</pre>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <TrendAnalysisContainer className={className}>
        <ControlsContainer>
          <MetricSelector
            selectedMetrics={selectedMetrics}
            onMetricsChange={handleMetricsChange}
            isMulti
            maxSelections={5}
          />
          <TimeRangeSelector
            value={timeRange}
            onChange={handleTimeRangeChange}
            aria-label="Select time range"
          >
            {Object.entries(TIME_RANGES).map(([key, value]) => (
              <option key={key} value={value}>
                {key.replace('_', ' ')}
              </option>
            ))}
          </TimeRangeSelector>
        </ControlsContainer>

        <HealthMetricsChart
          config={chartConfig}
          timeRange={{
            startDate: new Date(),
            endDate: new Date()
          }}
          onTimeRangeChange={() => {}}
        />

        {insights.length > 0 && (
          <InsightsContainer>
            <h3>Analysis Insights</h3>
            <ul>
              {insights.map((insight, index) => (
                <li key={index}>{insight}</li>
              ))}
            </ul>
          </InsightsContainer>
        )}

        {loading && (
          <div role="status" aria-live="polite">
            Analyzing health trends...
          </div>
        )}

        {error && (
          <div role="alert" aria-live="assertive">
            Error: {error}
          </div>
        )}
      </TrendAnalysisContainer>
    </ErrorBoundary>
  );
};

export default TrendAnalysis;