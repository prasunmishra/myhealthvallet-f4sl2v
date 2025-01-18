/**
 * @fileoverview Redux store types for analytics state management
 * Defines comprehensive types for health metrics analysis, visualization, and AI-driven insights
 * @version 1.0.0
 */

import { 
  METRIC_TYPES, 
  TIME_RANGES, 
  CHART_TYPES,
  TREND_TYPES,
  ANALYSIS_THRESHOLDS
} from '../../constants/analytics.constants';
import { MetricDataPoint } from '../../types/analytics.types';

/**
 * Redux action types for analytics operations
 */
export enum AnalyticsActionTypes {
  // Metric fetching actions
  FETCH_METRICS_REQUEST = '@analytics/FETCH_METRICS_REQUEST',
  FETCH_METRICS_SUCCESS = '@analytics/FETCH_METRICS_SUCCESS',
  FETCH_METRICS_FAILURE = '@analytics/FETCH_METRICS_FAILURE',

  // Time range actions
  SET_TIME_RANGE = '@analytics/SET_TIME_RANGE',
  SET_CUSTOM_RANGE = '@analytics/SET_CUSTOM_RANGE',

  // Chart configuration actions
  UPDATE_CHART_CONFIG = '@analytics/UPDATE_CHART_CONFIG',
  TOGGLE_METRIC_VISIBILITY = '@analytics/TOGGLE_METRIC_VISIBILITY',
  SET_CHART_TYPE = '@analytics/SET_CHART_TYPE',

  // Analysis actions
  ANALYZE_TRENDS_REQUEST = '@analytics/ANALYZE_TRENDS_REQUEST',
  ANALYZE_TRENDS_SUCCESS = '@analytics/ANALYZE_TRENDS_SUCCESS',
  ANALYZE_TRENDS_FAILURE = '@analytics/ANALYZE_TRENDS_FAILURE',

  // ML configuration actions
  UPDATE_ML_CONFIG = '@analytics/UPDATE_ML_CONFIG',
  SET_CONFIDENCE_THRESHOLD = '@analytics/SET_CONFIDENCE_THRESHOLD',

  // Export actions
  EXPORT_DATA_REQUEST = '@analytics/EXPORT_DATA_REQUEST',
  EXPORT_DATA_SUCCESS = '@analytics/EXPORT_DATA_SUCCESS',
  EXPORT_DATA_FAILURE = '@analytics/EXPORT_DATA_FAILURE'
}

/**
 * Interface for analytics time range configuration
 */
export interface AnalyticsTimeRange {
  type: TIME_RANGES;
  startDate: Date;
  endDate: Date;
  customRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Interface for chart visualization configuration
 */
export interface ChartConfiguration {
  type: CHART_TYPES;
  selectedMetrics: METRIC_TYPES[];
  showLegend: boolean;
  enableZoom: boolean;
  yAxisScale: 'linear' | 'logarithmic';
  aggregationType: 'none' | 'average' | 'sum' | 'min' | 'max';
  intervalSize?: string;
  thresholds: Array<{
    value: number;
    label: string;
    color: string;
  }>;
  annotations: Array<{
    timestamp: Date;
    label: string;
    color: string;
  }>;
}

/**
 * Interface for ML analysis configuration
 */
export interface MLConfiguration {
  confidenceThreshold: number;
  minimumDataPoints: number;
  anomalyDetectionEnabled: boolean;
  seasonalityAnalysisEnabled: boolean;
  correlationAnalysisEnabled: boolean;
  predictionHorizon: number;
  modelParameters: {
    algorithmType: string;
    hyperparameters: Record<string, unknown>;
    featureSelection: string[];
  };
}

/**
 * Interface for trend analysis results
 */
export interface TrendAnalysis {
  metricType: METRIC_TYPES;
  trendType: TREND_TYPES;
  changePercentage: number;
  confidence: number;
  insights: string[];
  predictions: Array<{
    timestamp: Date;
    value: number;
    confidence: number;
  }>;
  anomalies: Array<{
    timestamp: Date;
    value: number;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  seasonality?: {
    period: number;
    strength: number;
    peaks: Date[];
  };
  correlations: Array<{
    metricType: METRIC_TYPES;
    coefficient: number;
    significance: number;
  }>;
}

/**
 * Interface for analytics export configuration
 */
export interface ExportConfiguration {
  format: 'csv' | 'json' | 'pdf';
  timeRange: AnalyticsTimeRange;
  metrics: METRIC_TYPES[];
  includeAnalysis: boolean;
  includePredictions: boolean;
  anonymize: boolean;
}

/**
 * Interface for analytics feature state in Redux store
 */
export interface AnalyticsState {
  // Data
  metrics: MetricDataPoint[];
  trends: TrendAnalysis[];
  
  // Configuration
  timeRange: AnalyticsTimeRange;
  chartConfig: ChartConfiguration;
  mlConfig: MLConfiguration;
  
  // UI State
  loading: boolean;
  error: string | null;
  selectedMetrics: Set<METRIC_TYPES>;
  lastUpdated: Date;
  
  // Export State
  exportConfig?: ExportConfiguration;
  exportStatus?: 'idle' | 'pending' | 'success' | 'error';
  
  // Analysis State
  analysisInProgress: boolean;
  analysisError: string | null;
  
  // Thresholds
  thresholds: {
    [key in METRIC_TYPES]?: {
      min: number;
      max: number;
      warning: number;
      critical: number;
    };
  };
}