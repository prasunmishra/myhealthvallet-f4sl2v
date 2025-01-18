/**
 * Analytics Constants for PHRSAT Application
 * Defines comprehensive constant values and enums for analytics features
 * Version: 1.0.0
 */

/**
 * Enum defining supported health metric types with healthcare standard compliance
 */
export enum METRIC_TYPES {
  HEART_RATE = 'heart_rate',
  BLOOD_PRESSURE_SYSTOLIC = 'blood_pressure_systolic',
  BLOOD_PRESSURE_DIASTOLIC = 'blood_pressure_diastolic',
  STEPS = 'steps',
  SLEEP_DURATION = 'sleep_duration',
  SLEEP_QUALITY = 'sleep_quality',
  ACTIVITY_INTENSITY = 'activity_intensity',
  CALORIES_BURNED = 'calories_burned',
  BLOOD_OXYGEN = 'blood_oxygen',
  BODY_TEMPERATURE = 'body_temperature'
}

/**
 * Enum defining available time range options for analytics filtering
 */
export enum TIME_RANGES {
  ONE_DAY = '1d',
  ONE_WEEK = '1w',
  ONE_MONTH = '1m',
  THREE_MONTHS = '3m',
  SIX_MONTHS = '6m',
  ONE_YEAR = '1y',
  CUSTOM = 'custom'
}

/**
 * Enum defining supported chart visualization types
 */
export enum CHART_TYPES {
  LINE = 'line',
  BAR = 'bar',
  SCATTER = 'scatter',
  AREA = 'area',
  BUBBLE = 'bubble',
  CANDLESTICK = 'candlestick'
}

/**
 * Constant defining standardized measurement units for health metrics
 */
export const METRIC_UNITS = {
  HEART_RATE: 'bpm',
  BLOOD_PRESSURE: 'mmHg',
  STEPS: 'steps',
  SLEEP_DURATION: 'hours',
  ACTIVITY_INTENSITY: 'level',
  BLOOD_OXYGEN: '%',
  BODY_TEMPERATURE: '°C'
} as const;

/**
 * Enum defining trend classification types for health metrics analysis
 */
export enum TREND_TYPES {
  SIGNIFICANT_INCREASE = 'significant_increase',
  MODERATE_INCREASE = 'moderate_increase',
  STABLE = 'stable',
  MODERATE_DECREASE = 'moderate_decrease',
  SIGNIFICANT_DECREASE = 'significant_decrease',
  CYCLICAL = 'cyclical',
  IRREGULAR = 'irregular'
}

/**
 * Constant defining threshold values for analytics calculations
 */
export const ANALYSIS_THRESHOLDS = {
  SIGNIFICANT_CHANGE_PERCENTAGE: 20,
  MINIMUM_DATA_POINTS: 3,
  TREND_CONFIDENCE_THRESHOLD: 0.95,
  ANOMALY_DETECTION_THRESHOLD: 2.5,
  CORRELATION_THRESHOLD: 0.7
} as const;

// Global constants for analytics configuration
export const DEFAULT_TIME_RANGE = TIME_RANGES.ONE_WEEK;
export const DEFAULT_CHART_TYPE = CHART_TYPES.LINE;
export const MAX_METRICS_PER_CHART = 5;
export const MIN_DATA_POINTS_REQUIRED = 3;
export const DEFAULT_CONFIDENCE_LEVEL = 0.95;
export const MAX_TREND_ANALYSIS_PERIOD_DAYS = 365;
export const CHART_UPDATE_INTERVAL_MS = 5000;