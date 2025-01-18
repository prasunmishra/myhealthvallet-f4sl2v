/**
 * @fileoverview Redux reducer for health analytics state management
 * @version 1.0.0
 * 
 * Handles state management for:
 * - Health metric data with quality metadata
 * - Trend analysis with ML model insights
 * - Visualization configurations
 * - Data quality metrics and anomaly detection
 */

import { AnalyticsActionTypes } from './analytics.types';
import { MetricDataPoint } from '../../types/analytics.types';

/**
 * Interface for analytics state with ML capabilities
 */
interface AnalyticsState {
  metrics: MetricDataPoint[];
  timeRange: {
    type: string;
    startDate: Date;
    endDate?: Date;
  };
  loading: boolean;
  error: string | null;
  trendAnalysis: {
    trends: any[];
    confidence: number;
    lastUpdated: Date;
  } | null;
  insights: string[];
  mlMetadata: {
    modelVersion: string;
    lastUpdated: Date;
    confidenceThreshold: number;
    validationMetrics: {
      accuracy?: number;
      precision?: number;
      recall?: number;
      f1Score?: number;
    };
  };
  predictionIntervals: Array<{
    timestamp: Date;
    value: number;
    upperBound: number;
    lowerBound: number;
    confidence: number;
  }>;
  dataQualityMetrics: {
    completeness: number;
    accuracy: number;
    consistency: number;
  };
  anomalyDetection: {
    enabled: boolean;
    sensitivity: number;
    detectedAnomalies: Array<{
      timestamp: Date;
      metricType: string;
      severity: 'low' | 'medium' | 'high';
      confidence: number;
    }>;
  };
}

/**
 * Initial state with default values
 */
const initialState: AnalyticsState = {
  metrics: [],
  timeRange: {
    type: 'ONE_WEEK',
    startDate: new Date(),
  },
  loading: false,
  error: null,
  trendAnalysis: null,
  insights: [],
  mlMetadata: {
    modelVersion: '1.0.0',
    lastUpdated: new Date(),
    confidenceThreshold: 0.85,
    validationMetrics: {},
  },
  predictionIntervals: [],
  dataQualityMetrics: {
    completeness: 1.0,
    accuracy: 1.0,
    consistency: 1.0,
  },
  anomalyDetection: {
    enabled: true,
    sensitivity: 0.75,
    detectedAnomalies: [],
  },
};

/**
 * Analytics reducer with comprehensive ML and data quality handling
 */
export default function analyticsReducer(
  state: AnalyticsState = initialState,
  action: any
): AnalyticsState {
  switch (action.type) {
    case AnalyticsActionTypes.FETCH_METRICS_REQUEST:
      return {
        ...state,
        loading: true,
        error: null,
      };

    case AnalyticsActionTypes.FETCH_METRICS_SUCCESS:
      return {
        ...state,
        loading: false,
        metrics: action.payload.metrics.map((metric: MetricDataPoint) => ({
          ...metric,
          timestamp: new Date(metric.timestamp),
        })),
        dataQualityMetrics: {
          ...state.dataQualityMetrics,
          ...calculateDataQualityMetrics(action.payload.metrics),
        },
      };

    case AnalyticsActionTypes.FETCH_METRICS_FAILURE:
      return {
        ...state,
        loading: false,
        error: action.payload.error,
      };

    case AnalyticsActionTypes.SET_TIME_RANGE:
      return {
        ...state,
        timeRange: {
          type: action.payload.type,
          startDate: new Date(action.payload.startDate),
          endDate: action.payload.endDate ? new Date(action.payload.endDate) : undefined,
        },
      };

    case AnalyticsActionTypes.ANALYZE_TRENDS_REQUEST:
      return {
        ...state,
        loading: true,
        error: null,
      };

    case AnalyticsActionTypes.ANALYZE_TRENDS_SUCCESS:
      return {
        ...state,
        loading: false,
        trendAnalysis: {
          trends: action.payload.trends,
          confidence: action.payload.confidence,
          lastUpdated: new Date(),
        },
        insights: action.payload.insights,
        anomalyDetection: {
          ...state.anomalyDetection,
          detectedAnomalies: action.payload.anomalies || [],
        },
      };

    case AnalyticsActionTypes.ANALYZE_TRENDS_FAILURE:
      return {
        ...state,
        loading: false,
        error: action.payload.error,
      };

    case AnalyticsActionTypes.UPDATE_ML_METADATA:
      return {
        ...state,
        mlMetadata: {
          ...state.mlMetadata,
          ...action.payload,
          lastUpdated: new Date(),
        },
      };

    case AnalyticsActionTypes.SET_PREDICTION_INTERVALS:
      return {
        ...state,
        predictionIntervals: action.payload.intervals.map((interval: any) => ({
          ...interval,
          timestamp: new Date(interval.timestamp),
        })),
      };

    case AnalyticsActionTypes.UPDATE_DATA_QUALITY:
      return {
        ...state,
        dataQualityMetrics: {
          ...state.dataQualityMetrics,
          ...action.payload.metrics,
        },
      };

    default:
      return state;
  }
}

/**
 * Helper function to calculate data quality metrics
 */
function calculateDataQualityMetrics(metrics: MetricDataPoint[]): {
  completeness: number;
  accuracy: number;
  consistency: number;
} {
  if (!metrics.length) {
    return {
      completeness: 1.0,
      accuracy: 1.0,
      consistency: 1.0,
    };
  }

  const completeness = metrics.filter(m => m.value !== null && m.value !== undefined).length / metrics.length;
  const accuracy = metrics.filter(m => m.validationStatus === 'valid').length / metrics.length;
  const consistency = metrics.filter(m => m.dataQuality.reliability >= 0.8).length / metrics.length;

  return {
    completeness,
    accuracy,
    consistency,
  };
}