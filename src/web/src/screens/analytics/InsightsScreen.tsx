import React, { useState, useCallback, useEffect, useMemo } from 'react';
import styled from '@emotion/styled';
import { useVirtualizer } from '@tanstack/react-virtual';
import InsightCard from '../../components/analytics/InsightCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { TrendAnalysis } from '../../types/analytics.types';
import { METRIC_TYPES } from '../../constants/analytics.constants';
import { API_ROUTES } from '../../constants/api.constants';

// Styled components with WCAG 2.1 AAA compliance
const Container = styled.main`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  min-height: 100vh;
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text[500]};

  @media (max-width: ${({ theme }) => theme.breakpoints.TABLET}px) {
    padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  }
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizes.h2};
  font-weight: ${({ theme }) => theme.typography.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text[700]};
  margin: 0;
`;

const InsightsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  width: 100%;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    grid-template-columns: 1fr;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
`;

const ErrorContainer = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  color: ${({ theme }) => theme.colors.error[500]};
`;

interface InsightsScreenProps {
  className?: string;
  initialFilter?: {
    metricTypes?: METRIC_TYPES[];
    timeRange?: string;
  };
  onInsightAction?: (type: string, id: string) => void;
}

const InsightsScreen: React.FC<InsightsScreenProps> = ({
  className,
  initialFilter,
  onInsightAction
}) => {
  // State management
  const [insights, setInsights] = useState<TrendAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [parentRef, setParentRef] = useState<HTMLDivElement | null>(null);

  // Virtual list configuration for performance
  const rowVirtualizer = useVirtualizer({
    count: insights.length,
    getScrollElement: () => parentRef,
    estimateSize: () => 200,
    overscan: 5
  });

  // Fetch insights with error handling and loading states
  const fetchInsights = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(API_ROUTES.ANALYTICS.INSIGHTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: initialFilter || {},
          pagination: {
            limit: 50,
            offset: 0
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }

      const data = await response.json();
      setInsights(data.insights);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error occurred'));
    } finally {
      setIsLoading(false);
    }
  }, [initialFilter]);

  // Handle insight interactions
  const handleInsightAction = useCallback((type: string, insightId: string) => {
    if (onInsightAction) {
      onInsightAction(type, insightId);
    }
  }, [onInsightAction]);

  // Initialize data fetching
  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Memoized error fallback component
  const errorFallback = useMemo(() => (
    <ErrorContainer role="alert">
      <h2>Unable to load insights</h2>
      <p>Please try again later</p>
    </ErrorContainer>
  ), []);

  if (isLoading) {
    return (
      <LoadingContainer>
        <LoadingSpinner 
          size="large"
          ariaLabel="Loading health insights"
        />
      </LoadingContainer>
    );
  }

  return (
    <ErrorBoundary fallback={errorFallback}>
      <Container className={className}>
        <Header>
          <Title>Health Insights</Title>
        </Header>
        
        <div ref={setParentRef}>
          <InsightsGrid
            role="region"
            aria-label="Health insights grid"
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const insight = insights[virtualRow.index];
              return (
                <InsightCard
                  key={`${insight.metricType}-${virtualRow.index}`}
                  trendAnalysis={insight}
                  onActionClick={handleInsightAction}
                  isLoading={isLoading}
                />
              );
            })}
          </InsightsGrid>
        </div>
      </Container>
    </ErrorBoundary>
  );
};

export default InsightsScreen;