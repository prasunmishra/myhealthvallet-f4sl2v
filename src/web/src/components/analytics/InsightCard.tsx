import React, { memo, useCallback } from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.0.0
import { useTheme } from '@emotion/react'; // ^11.0.0
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { TrendAnalysis } from '../../types/analytics.types';
import { METRIC_TYPES } from '../../constants/analytics.constants';

interface InsightCardProps {
  trendAnalysis: TrendAnalysis;
  onActionClick?: (type: string, data?: any) => void;
  className?: string;
  isLoading?: boolean;
  errorFallback?: React.ReactNode;
}

const StyledInsightCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  min-width: 300px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  color: ${({ theme }) => theme.colors.text[500]};
  transition: all 0.3s ease;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    min-width: 100%;
  }
`;

const TrendHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: ${({ theme }) => theme.spacing.SMALL}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface[300]};
`;

const TrendInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
`;

const MetricTitle = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizes.h4};
  font-weight: ${({ theme }) => theme.typography.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text[700]};
`;

const TrendValue = styled.span<{ trend: string }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  color: ${({ theme, trend }) => 
    trend === 'increasing' ? theme.colors.success[500] :
    trend === 'decreasing' ? theme.colors.error[500] :
    theme.colors.text[500]};
  font-weight: ${({ theme }) => theme.typography.fontWeights.medium};
`;

const InsightsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
`;

const InsightItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  color: ${({ theme }) => theme.colors.text[600]};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
`;

const ConfidenceIndicator = styled.div<{ confidence: number }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  color: ${({ theme, confidence }) => 
    confidence >= 0.9 ? theme.colors.success[500] :
    confidence >= 0.7 ? theme.colors.warning[500] :
    theme.colors.error[500]};
`;

const RecommendationsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: ${({ theme }) => theme.spacing.MEDIUM}px 0 0;
  border-top: 1px solid ${({ theme }) => theme.colors.surface[300]};
`;

const RecommendationItem = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  padding: ${({ theme }) => theme.spacing.SMALL}px 0;
  color: ${({ theme }) => theme.colors.primary[700]};
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const getTrendIcon = (trend: string): string => {
  switch (trend) {
    case 'increasing':
      return 'trending-up';
    case 'decreasing':
      return 'trending-down';
    case 'fluctuating':
      return 'trending-neutral';
    default:
      return 'remove';
  }
};

const formatMetricName = (metricType: METRIC_TYPES): string => {
  return metricType.toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const InsightCard: React.FC<InsightCardProps> = memo(({
  trendAnalysis,
  onActionClick,
  className,
  isLoading = false,
  errorFallback
}) => {
  const theme = useTheme();

  const handleRecommendationClick = useCallback((recommendation: string) => {
    if (onActionClick) {
      onActionClick('recommendation', { recommendation, metricType: trendAnalysis.metricType });
    }
  }, [onActionClick, trendAnalysis.metricType]);

  if (isLoading) {
    return (
      <StyledInsightCard
        elevation={1}
        className={className}
        aria-busy="true"
        aria-label="Loading health insights"
      >
        {/* Loading state content would be implemented here */}
      </StyledInsightCard>
    );
  }

  return (
    <ErrorBoundary fallback={errorFallback}>
      <StyledInsightCard
        elevation={1}
        className={className}
        role="region"
        aria-label={`Health insights for ${formatMetricName(trendAnalysis.metricType)}`}
      >
        <TrendHeader>
          <TrendInfo>
            <MetricTitle>{formatMetricName(trendAnalysis.metricType)}</MetricTitle>
            <TrendValue trend={trendAnalysis.trend}>
              <Icon
                name={getTrendIcon(trendAnalysis.trend)}
                size="small"
                ariaLabel={`Trend: ${trendAnalysis.trend}`}
              />
              {trendAnalysis.changePercentage > 0 ? '+' : ''}
              {trendAnalysis.changePercentage.toFixed(1)}%
            </TrendValue>
          </TrendInfo>
          <ConfidenceIndicator confidence={trendAnalysis.confidence}>
            <Icon
              name="analytics"
              size="small"
              ariaLabel={`Analysis confidence: ${(trendAnalysis.confidence * 100).toFixed(0)}%`}
            />
            {(trendAnalysis.confidence * 100).toFixed(0)}% confidence
          </ConfidenceIndicator>
        </TrendHeader>

        <InsightsList role="list" aria-label="Health insights">
          {trendAnalysis.insights.map((insight, index) => (
            <InsightItem key={index} role="listitem">
              <Icon name="info" size="small" ariaLabel="Insight" />
              {insight}
            </InsightItem>
          ))}
        </InsightsList>

        {trendAnalysis.recommendations && trendAnalysis.recommendations.length > 0 && (
          <RecommendationsList role="list" aria-label="Recommendations">
            {trendAnalysis.recommendations.map((recommendation, index) => (
              <RecommendationItem
                key={index}
                role="button"
                onClick={() => handleRecommendationClick(recommendation)}
                onKeyPress={(e) => e.key === 'Enter' && handleRecommendationClick(recommendation)}
                tabIndex={0}
              >
                <Icon name="recommendation" size="small" ariaLabel="Recommendation" />
                {recommendation}
              </RecommendationItem>
            ))}
          </RecommendationsList>
        )}
      </StyledInsightCard>
    </ErrorBoundary>
  );
});

InsightCard.displayName = 'InsightCard';

export default InsightCard;