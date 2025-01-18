/**
 * @fileoverview Redux action creators for health analytics state management
 * @version 1.0.0
 * 
 * Implements comprehensive action creators for:
 * - Health metric data fetching with caching
 * - ML-powered trend analysis
 * - Real-time metric updates
 * - Advanced visualization configurations
 */

import { ThunkAction } from 'redux-thunk';
import { Dispatch } from 'redux';
import { debounce } from 'lodash';
import CircuitBreaker from 'opossum';

import { 
  AnalyticsActionTypes,
} from './analytics.types';
import { AnalyticsService } from '../../services/analytics.service';
import { MetricDataPoint } from '../../types/analytics.types';

// Circuit breaker configuration for API calls
const circuitBreaker = new CircuitBreaker(async (fn: Function) => await fn(), {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});

/**
 * Enhanced action creator for fetching health metrics with caching
 */
export const fetchMetrics = (
  metricTypes: string[],
  timeRange: { startDate: Date; endDate: Date },
  cacheConfig = { bypassCache: false }
): ThunkAction<Promise<void>, any, null, any> => {
  return async (dispatch: Dispatch) => {
    try {
      dispatch({ type: AnalyticsActionTypes.FETCH_METRICS_REQUEST });

      // Validate metric types
      const analyticsService = new AnalyticsService();
      const validatedTypes = await analyticsService.validateMetricTypes(metricTypes);

      // Fetch metrics with circuit breaker pattern
      const metricsData = await circuitBreaker.fire(async () => {
        const promises = validatedTypes.map(type => 
          analyticsService.getMetricData(type, timeRange)
        );
        return Promise.all(promises);
      });

      // Subscribe to real-time updates if enabled
      const realTimeUpdates = validatedTypes.map(type =>
        analyticsService.subscribeToUpdates(type)
      );

      dispatch({
        type: AnalyticsActionTypes.FETCH_METRICS_SUCCESS,
        payload: {
          metrics: metricsData.flat(),
          timeRange,
          realTimeUpdates
        }
      });
    } catch (error) {
      dispatch({
        type: AnalyticsActionTypes.FETCH_METRICS_FAILURE,
        payload: {
          error: error instanceof Error ? error.message : 'Failed to fetch metrics',
          timeRange
        }
      });
    }
  };
};

/**
 * Enhanced action creator for ML-powered trend analysis
 */
export const analyzeTrends = (
  metricData: MetricDataPoint[],
  mlConfig = {
    confidenceThreshold: 0.95,
    anomalyDetection: true,
    predictionHorizon: 7
  }
): ThunkAction<Promise<void>, any, null, any> => {
  return async (dispatch: Dispatch) => {
    try {
      dispatch({ type: AnalyticsActionTypes.ANALYZE_TRENDS_REQUEST });

      const analyticsService = new AnalyticsService();
      
      // Perform trend analysis with circuit breaker pattern
      const analysisResult = await circuitBreaker.fire(async () => {
        return analyticsService.analyzeTrends(metricData);
      });

      // Generate insights from analysis
      const insights = await analyticsService.getInsights(analysisResult);

      dispatch({
        type: AnalyticsActionTypes.ANALYZE_TRENDS_SUCCESS,
        payload: {
          trends: analysisResult,
          insights,
          metadata: {
            confidenceScore: analysisResult.confidence,
            modelId: analysisResult.modelMetadata.modelId,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      dispatch({
        type: AnalyticsActionTypes.ANALYZE_TRENDS_FAILURE,
        payload: {
          error: error instanceof Error ? error.message : 'Failed to analyze trends',
          metricTypes: [...new Set(metricData.map(m => m.metricType))]
        }
      });
    }
  };
};

/**
 * Enhanced action creator for updating time range with validation
 */
export const setTimeRange = debounce((
  timeRange: { startDate: Date; endDate: Date },
  tzConfig = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
) => {
  // Validate time range
  const isValid = timeRange.startDate < timeRange.endDate && 
                 timeRange.endDate <= new Date();

  if (!isValid) {
    throw new Error('Invalid time range selection');
  }

  return {
    type: AnalyticsActionTypes.SET_TIME_RANGE,
    payload: {
      timeRange,
      timezone: tzConfig.timezone,
      validation: {
        isValid,
        timestamp: new Date().toISOString()
      }
    }
  };
}, 300);