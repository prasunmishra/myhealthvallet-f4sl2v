import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useWebSocket } from 'react-use-websocket';
import { VirtualList } from 'react-window';

import { HealthMetricsChart } from '../../components/analytics/HealthMetricsChart';
import { TrendAnalysis } from '../../components/analytics/TrendAnalysis';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { useHealth } from '../../hooks/useHealth';
import { METRIC_TYPES, TIME_RANGES } from '../../constants/analytics.constants';
import { WEBSOCKET_ROUTES } from '../../constants/api.constants';
import { createFadeAnimation } from '../../styles/animations';

// Styled Components
const AccessibleContainer = styled.main`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background-color: ${({ theme }) => theme.colors.background};
  min-height: 100vh;
  ${createFadeAnimation()};

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  }
`;

const Header = styled.header`
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.colors.text[900]};
  font-size: ${({ theme }) => theme.typography.fontSizes.h1};
  font-weight: ${({ theme }) => theme.typography.fontWeights.bold};
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
`;

const Description = styled.p`
  color: ${({ theme }) => theme.colors.text[600]};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  line-height: ${({ theme }) => theme.typography.lineHeights.relaxed};
`;

const MLInsightsContainer = styled.section`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  margin-top: ${({ theme }) => theme.spacing.LARGE}px;
  aria-live: polite;
`;

const InsightCard = styled.article`
  background-color: ${({ theme }) => theme.colors.surface[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

interface HealthTrendsScreenProps {
  navigation: any;
  theme: any;
  locale: string;
}

export const HealthTrendsScreen: React.FC<HealthTrendsScreenProps> = ({
  navigation,
  theme,
  locale
}) => {
  // State Management
  const [selectedMetrics, setSelectedMetrics] = useState<METRIC_TYPES[]>([]);
  const [timeRange, setTimeRange] = useState({
    startDate: new Date(),
    endDate: new Date()
  });
  const [mlInsights, setMlInsights] = useState<any[]>([]);

  // Custom Hooks
  const { metrics, loading, error } = useHealth();

  // WebSocket Setup for Real-time Updates
  const { sendMessage, lastMessage } = useWebSocket(WEBSOCKET_ROUTES.ANALYSIS_STATUS, {
    shouldReconnect: true,
    reconnectInterval: 3000,
    reconnectAttempts: 10
  });

  // Handlers
  const handleMetricsChange = useCallback((metrics: METRIC_TYPES[]) => {
    setSelectedMetrics(metrics);
    sendMessage(JSON.stringify({
      type: 'subscribe',
      metrics,
      timeRange
    }));
  }, [sendMessage, timeRange]);

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    try {
      const data = JSON.parse(message.data);
      if (data.type === 'ml_insight') {
        setMlInsights(prev => [...prev, {
          id: data.id,
          type: data.insightType,
          message: data.message,
          confidence: data.confidence,
          timestamp: new Date(data.timestamp)
        }]);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }, []);

  // Effects
  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage, handleWebSocketMessage]);

  return (
    <ErrorBoundary>
      <AccessibleContainer role="main" aria-label="Health Trends Analysis">
        <Header>
          <Title>Health Trends Analysis</Title>
          <Description>
            Analyze your health metrics with AI-powered insights and real-time updates
          </Description>
        </Header>

        <HealthMetricsChart
          config={{
            selectedMetrics,
            timeRange,
            showLegend: true,
            enableZoom: true,
            yAxisScale: 'linear',
            aggregationType: 'none'
          }}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />

        <TrendAnalysis
          selectedMetrics={selectedMetrics}
          timeRange={timeRange}
          onInsightGenerated={(insights) => {
            setMlInsights(prev => [...prev, ...insights]);
          }}
        />

        <MLInsightsContainer aria-label="Machine Learning Insights">
          <VirtualList
            height={400}
            width="100%"
            itemCount={mlInsights.length}
            itemSize={120}
          >
            {({ index, style }) => {
              const insight = mlInsights[index];
              return (
                <InsightCard
                  key={insight.id}
                  style={style}
                  role="article"
                  aria-label={`Health Insight ${index + 1}`}
                >
                  <h3>{insight.type}</h3>
                  <p>{insight.message}</p>
                  <small>
                    Confidence: {(insight.confidence * 100).toFixed(1)}%
                  </small>
                </InsightCard>
              );
            }}
          </VirtualList>
        </MLInsightsContainer>

        {loading && (
          <div role="status" aria-live="polite">
            Analyzing health trends...
          </div>
        )}

        {error && (
          <div role="alert" aria-live="assertive">
            Error analyzing health trends: {error}
          </div>
        )}
      </AccessibleContainer>
    </ErrorBoundary>
  );
};

export default HealthTrendsScreen;