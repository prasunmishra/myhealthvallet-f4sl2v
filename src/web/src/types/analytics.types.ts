/**
 * @fileoverview Analytics TypeScript type definitions for PHRSAT
 * @version 1.0.0
 * 
 * Comprehensive type definitions for health analytics including:
 * - Metric data points with quality metadata
 * - Time range selections
 * - Chart configurations
 * - Trend analysis with ML metadata
 */

import { METRIC_TYPES, TIME_RANGES, CHART_TYPES } from '../constants/analytics.constants';
import { HealthMetric } from './health.types';

/**
 * Interface for data quality metadata
 */
interface DataQualityMetadata {
  accuracy: number;
  precision: number;
  completeness: number;
  reliability: number;
  validationTimestamp: Date;
}

/**
 * Interface for data source metadata
 */
interface DataSourceMetadata {
  deviceId: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  calibrationDate?: Date;
}

/**
 * Enum for data validation status
 */
enum ValidationStatus {
  VALID = 'valid',
  SUSPECT = 'suspect',
  INVALID = 'invalid',
  UNVERIFIED = 'unverified'
}

/**
 * Interface for ML model metadata
 */
interface MLModelMetadata {
  modelId: string;
  modelVersion: string;
  algorithmType: string;
  trainingDate: Date;
  accuracy: number;
  parameters: Record<string, unknown>;
  lastUpdated: Date;
}

/**
 * Interface for prediction intervals
 */
interface PredictionInterval {
  timestamp: Date;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
}

/**
 * Interface for feature importance in ML analysis
 */
interface FeatureImportance {
  featureName: string;
  importance: number;
  correlation: number;
  pValue: number;
}

/**
 * Interface for anomaly detection flags
 */
interface AnomalyFlag {
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
  description: string;
  confidence: number;
  relatedMetrics: METRIC_TYPES[];
}

/**
 * Enhanced interface for individual metric data points
 */
export interface MetricDataPoint extends HealthMetric {
  timestamp: Date;
  value: number;
  metricType: METRIC_TYPES;
  unit: string;
  dataQuality: DataQualityMetadata;
  source: DataSourceMetadata;
  validationStatus: ValidationStatus;
}

/**
 * Interface for analytics time range selection
 */
export interface AnalyticsTimeRange {
  type: TIME_RANGES;
  startDate: Date;
  endDate: Date;
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
  annotations?: Array<{
    timestamp: Date;
    label: string;
    color: string;
  }>;
  thresholds?: Array<{
    value: number;
    label: string;
    color: string;
  }>;
}

/**
 * Interface for trend analysis results
 */
export interface TrendAnalysis {
  metricType: METRIC_TYPES;
  trend: 'increasing' | 'decreasing' | 'stable' | 'fluctuating';
  changePercentage: number;
  insights: string[];
  confidence: number;
  modelMetadata: MLModelMetadata;
  predictionIntervals: PredictionInterval[];
  featureImportance: FeatureImportance[];
  anomalyFlags: AnomalyFlag[];
  seasonality?: {
    period: number;
    strength: number;
    peaks: Date[];
  };
  correlations?: Array<{
    metricType: METRIC_TYPES;
    coefficient: number;
    significance: number;
  }>;
}

/**
 * Interface for analytics feature state
 */
export interface AnalyticsState {
  loading: boolean;
  error: string | null;
  timeRange: AnalyticsTimeRange;
  metrics: MetricDataPoint[];
  chartConfig: ChartConfiguration;
  trends: TrendAnalysis[];
  selectedMetrics: Set<METRIC_TYPES>;
  lastUpdated: Date;
  refreshInterval: number;
  exportFormat?: 'csv' | 'json' | 'pdf';
  filters?: {
    devices?: string[];
    validationStatus?: ValidationStatus[];
    confidenceThreshold?: number;
  };
}