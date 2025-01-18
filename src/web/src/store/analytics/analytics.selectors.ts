/**
 * Analytics Selectors
 * Implements memoized selectors for accessing analytics state with ML metadata support
 * @version 1.0.0
 */

import { createSelector } from 'reselect'; // version: ^4.1.8
import { RootState } from '../rootReducer';
import { MetricDataPoint, MLMetadata } from '../../types/analytics.types';

/**
 * Base selector to access analytics state slice
 */
export const selectAnalyticsState = (state: RootState) => state.analytics;

/**
 * Select all metrics with ML metadata
 */
export const selectMetricsWithML = createSelector(
  [selectAnalyticsState],
  (analyticsState) => {
    return analyticsState.metrics.filter(metric => {
      // Ensure metric has valid ML metadata
      const hasValidMetadata = metric.mlMetadata && 
        metric.mlMetadata.modelVersion &&
        metric.mlMetadata.predictionInterval;
      
      return hasValidMetadata;
    });
  }
);

/**
 * Select metrics filtered by time range and confidence threshold
 */
export const selectFilteredMetricsWithConfidence = createSelector(
  [selectAnalyticsState],
  (analyticsState) => {
    const { metrics, timeRange, mlMetadata } = analyticsState;
    const confidenceThreshold = mlMetadata.confidenceThreshold;

    return metrics.filter(metric => {
      // Apply time range filter
      const metricDate = new Date(metric.timestamp);
      const isInTimeRange = metricDate >= timeRange.startDate && 
        (!timeRange.endDate || metricDate <= timeRange.endDate);

      // Apply confidence threshold
      const hasHighConfidence = metric.confidenceScore >= confidenceThreshold;

      return isInTimeRange && hasHighConfidence;
    });
  }
);

/**
 * Select trend analysis results with prediction intervals
 */
export const selectTrendAnalysis = createSelector(
  [selectAnalyticsState],
  (analyticsState) => {
    const { trendAnalysis } = analyticsState;
    if (!trendAnalysis) return null;

    return {
      ...trendAnalysis,
      trends: trendAnalysis.trends.map(trend => ({
        ...trend,
        lastUpdated: new Date(trend.lastUpdated)
      }))
    };
  }
);

/**
 * Select data quality metrics for analytics
 */
export const selectDataQualityMetrics = createSelector(
  [selectAnalyticsState],
  (analyticsState) => analyticsState.dataQualityMetrics
);

/**
 * Select ML model metadata with validation metrics
 */
export const selectMLMetadata = createSelector(
  [selectAnalyticsState],
  (analyticsState) => {
    const { mlMetadata } = analyticsState;
    return {
      ...mlMetadata,
      lastUpdated: new Date(mlMetadata.lastUpdated)
    };
  }
);

/**
 * Select metrics with anomaly detection results
 */
export const selectMetricsWithAnomalies = createSelector(
  [selectAnalyticsState],
  (analyticsState) => {
    const { metrics, anomalyDetection } = analyticsState;
    if (!anomalyDetection.enabled) return [];

    return metrics.filter(metric => {
      const hasAnomalyFlag = anomalyDetection.detectedAnomalies.some(
        anomaly => anomaly.timestamp === metric.timestamp
      );
      return hasAnomalyFlag;
    });
  }
);

/**
 * Select prediction intervals for metrics
 */
export const selectPredictionIntervals = createSelector(
  [selectAnalyticsState],
  (analyticsState) => analyticsState.predictionIntervals.map(interval => ({
    ...interval,
    timestamp: new Date(interval.timestamp)
  }))
);

/**
 * Select metrics grouped by time interval
 */
export const selectMetricsByInterval = createSelector(
  [selectFilteredMetricsWithConfidence],
  (metrics) => {
    const groupedMetrics: Record<string, MetricDataPoint[]> = {};
    
    metrics.forEach(metric => {
      const date = new Date(metric.timestamp);
      const key = date.toISOString().split('T')[0];
      
      if (!groupedMetrics[key]) {
        groupedMetrics[key] = [];
      }
      groupedMetrics[key].push(metric);
    });

    return groupedMetrics;
  }
);

/**
 * Select validation metrics for ML models
 */
export const selectMLValidationMetrics = createSelector(
  [selectMLMetadata],
  (mlMetadata) => mlMetadata.validationMetrics
);