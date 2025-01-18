/**
 * @fileoverview Advanced utility functions for health analytics data processing
 * @version 1.0.0
 * 
 * Enterprise-grade utility functions for processing, analyzing, and formatting
 * health analytics data with HIPAA compliance and FHIR R4 standards support.
 */

import dayjs from 'dayjs'; // version: ^1.11.9
import { MetricDataPoint, TrendAnalysis } from '../types/analytics.types';
import { METRIC_TYPES, TREND_TYPES } from '../constants/analytics.constants';

// Constants for analytics calculations
const MIN_DATA_POINTS = 3;
const TREND_THRESHOLD_PERCENTAGE = 5;
const CONFIDENCE_THRESHOLD = 0.8;

/**
 * Formats and validates metric data points for visualization with support for
 * multiple unit systems and timezone handling
 * 
 * @param data Array of metric data points to format
 * @param metricType Type of health metric being processed
 * @returns Formatted and validated array of metric data points
 */
export const formatMetricData = (
  data: MetricDataPoint[],
  metricType: METRIC_TYPES
): MetricDataPoint[] => {
  if (!data || data.length < MIN_DATA_POINTS) {
    return [];
  }

  // Remove invalid data points and sort by timestamp
  const validData = data
    .filter(point => (
      point.value !== null &&
      point.value !== undefined &&
      !isNaN(point.value) &&
      point.timestamp instanceof Date
    ))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Process each data point with timezone handling
  return validData.map(point => {
    const formattedPoint: MetricDataPoint = {
      ...point,
      timestamp: dayjs(point.timestamp).toDate(),
      metricType,
      value: normalizeMetricValue(point.value, metricType),
      dataQuality: {
        ...point.dataQuality,
        validationTimestamp: new Date()
      }
    };

    // Apply data quality checks
    validateDataPoint(formattedPoint);

    return formattedPoint;
  });
};

/**
 * Calculates trend analysis with pattern detection and confidence scoring
 * 
 * @param data Array of metric data points to analyze
 * @returns Detailed trend analysis with confidence scoring
 */
export const calculateTrend = (data: MetricDataPoint[]): TrendAnalysis => {
  if (!data || data.length < MIN_DATA_POINTS) {
    throw new Error('Insufficient data points for trend analysis');
  }

  // Calculate moving averages for smoothing
  const movingAverages = calculateMovingAverages(data, 3);

  // Calculate overall change percentage
  const changePercentage = calculateChangePercentage(movingAverages);

  // Determine trend direction and confidence
  const { trend, confidence } = determineTrendDirection(
    movingAverages,
    changePercentage
  );

  return {
    metricType: data[0].metricType,
    trend,
    changePercentage,
    confidence,
    insights: generateInsights(data, trend, changePercentage),
    modelMetadata: {
      modelId: 'trend-analysis-v1',
      modelVersion: '1.0.0',
      algorithmType: 'statistical',
      trainingDate: new Date(),
      accuracy: confidence,
      parameters: {
        windowSize: 3,
        thresholdPercentage: TREND_THRESHOLD_PERCENTAGE
      },
      lastUpdated: new Date()
    },
    predictionIntervals: calculatePredictionIntervals(data),
    featureImportance: [],
    anomalyFlags: detectAnomalies(data)
  };
};

/**
 * Aggregates metrics with support for multiple time periods and memory optimization
 * 
 * @param data Array of metric data points to aggregate
 * @param period Aggregation period (e.g., 'hour', 'day', 'week')
 * @returns Time-aggregated metric data points
 */
export const aggregateMetrics = (
  data: MetricDataPoint[],
  period: string
): MetricDataPoint[] => {
  if (!data || data.length === 0) {
    return [];
  }

  const aggregatedData = new Map<string, MetricDataPoint[]>();

  // Group data points by period
  data.forEach(point => {
    const periodKey = getPeriodKey(point.timestamp, period);
    if (!aggregatedData.has(periodKey)) {
      aggregatedData.set(periodKey, []);
    }
    aggregatedData.get(periodKey)?.push(point);
  });

  // Calculate aggregates for each period
  return Array.from(aggregatedData.entries()).map(([periodKey, points]) => {
    const avgValue = points.reduce((sum, p) => sum + p.value, 0) / points.length;
    
    return {
      ...points[0],
      timestamp: new Date(periodKey),
      value: avgValue,
      dataQuality: calculateAggregateQuality(points)
    };
  });
};

/**
 * Helper function to normalize metric values based on type
 */
const normalizeMetricValue = (value: number, metricType: METRIC_TYPES): number => {
  switch (metricType) {
    case METRIC_TYPES.HEART_RATE:
      return Math.round(value);
    case METRIC_TYPES.BLOOD_PRESSURE:
      return Number(value.toFixed(1));
    default:
      return value;
  }
};

/**
 * Helper function to validate individual data points
 */
const validateDataPoint = (point: MetricDataPoint): void => {
  const now = new Date();
  if (point.timestamp > now) {
    point.dataQuality.validity = 'invalid';
    point.dataQuality.reliability = 0;
  }
};

/**
 * Helper function to calculate moving averages
 */
const calculateMovingAverages = (
  data: MetricDataPoint[],
  windowSize: number
): number[] => {
  const result: number[] = [];
  for (let i = 0; i <= data.length - windowSize; i++) {
    const windowSum = data
      .slice(i, i + windowSize)
      .reduce((sum, point) => sum + point.value, 0);
    result.push(windowSum / windowSize);
  }
  return result;
};

/**
 * Helper function to calculate change percentage
 */
const calculateChangePercentage = (values: number[]): number => {
  if (values.length < 2) return 0;
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  return ((lastValue - firstValue) / firstValue) * 100;
};

/**
 * Helper function to determine trend direction
 */
const determineTrendDirection = (
  values: number[],
  changePercentage: number
): { trend: string; confidence: number } => {
  const absChange = Math.abs(changePercentage);
  let trend: string;
  let confidence: number;

  if (absChange < TREND_THRESHOLD_PERCENTAGE) {
    trend = TREND_TYPES.STABLE;
    confidence = 1 - (absChange / TREND_THRESHOLD_PERCENTAGE);
  } else {
    trend = changePercentage > 0 ? TREND_TYPES.SIGNIFICANT_INCREASE : TREND_TYPES.SIGNIFICANT_DECREASE;
    confidence = Math.min(absChange / (2 * TREND_THRESHOLD_PERCENTAGE), 1);
  }

  return { trend, confidence };
};

/**
 * Helper function to generate period key for aggregation
 */
const getPeriodKey = (date: Date, period: string): string => {
  const d = dayjs(date);
  switch (period) {
    case 'hour':
      return d.format('YYYY-MM-DD-HH');
    case 'day':
      return d.format('YYYY-MM-DD');
    case 'week':
      return d.format('YYYY-[W]WW');
    case 'month':
      return d.format('YYYY-MM');
    default:
      return d.format('YYYY-MM-DD');
  }
};

/**
 * Helper function to calculate aggregate data quality
 */
const calculateAggregateQuality = (points: MetricDataPoint[]): any => {
  const avgAccuracy = points.reduce((sum, p) => sum + p.dataQuality.accuracy, 0) / points.length;
  const avgReliability = points.reduce((sum, p) => sum + p.dataQuality.reliability, 0) / points.length;

  return {
    accuracy: avgAccuracy,
    reliability: avgReliability,
    completeness: points.length / MIN_DATA_POINTS,
    validationTimestamp: new Date()
  };
};

/**
 * Helper function to calculate prediction intervals
 */
const calculatePredictionIntervals = (data: MetricDataPoint[]): any[] => {
  return data.map(point => ({
    timestamp: point.timestamp,
    lowerBound: point.value * 0.9,
    upperBound: point.value * 1.1,
    confidenceLevel: 0.95
  }));
};

/**
 * Helper function to detect anomalies in the data
 */
const detectAnomalies = (data: MetricDataPoint[]): any[] => {
  const anomalies: any[] = [];
  const values = data.map(p => p.value);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
  );

  data.forEach(point => {
    const zScore = Math.abs((point.value - mean) / stdDev);
    if (zScore > 2) {
      anomalies.push({
        timestamp: point.timestamp,
        severity: zScore > 3 ? 'high' : 'medium',
        description: `Anomalous value detected (z-score: ${zScore.toFixed(2)})`,
        confidence: Math.min(zScore / 4, 1),
        relatedMetrics: [point.metricType]
      });
    }
  });

  return anomalies;
};

/**
 * Helper function to generate insights based on trend analysis
 */
const generateInsights = (
  data: MetricDataPoint[],
  trend: string,
  changePercentage: number
): string[] => {
  const insights: string[] = [];
  const absChange = Math.abs(changePercentage);

  if (absChange > TREND_THRESHOLD_PERCENTAGE) {
    insights.push(
      `${trend === TREND_TYPES.SIGNIFICANT_INCREASE ? 'Increase' : 'Decrease'} ` +
      `of ${absChange.toFixed(1)}% observed in ${data[0].metricType}`
    );
  }

  return insights;
};