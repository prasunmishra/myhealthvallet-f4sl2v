/**
 * @fileoverview Health data utility functions for PHRSAT web application
 * @version 1.0.0
 * 
 * Comprehensive utility functions for health data processing, validation, and transformation
 * with FHIR R4 compliance and support for multiple health platforms.
 */

import { isValid, format } from 'date-fns'; // version: ^2.30.0
import { 
  HealthMetric,
  HealthMetricType,
  HealthPlatform
} from '../types/health.types';
import { formatDate } from './date.utils';
import { 
  HEALTH_METRIC_RANGES,
  HEALTH_UNITS,
  HEALTH_METRIC_TYPES,
  HEALTH_PLATFORMS
} from '../constants/health.constants';

/**
 * Interface for validation options
 */
interface ValidationOptions {
  age?: number;
  activityType?: 'resting' | 'light_exercise' | 'moderate_exercise' | 'intense_exercise';
  condition?: string;
  strict?: boolean;
}

/**
 * Interface for validation result
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a health metric based on type-specific rules and ranges
 * @param metric Health metric to validate
 * @param options Validation options including age and activity context
 * @returns Validation result with detailed feedback
 */
export const validateHealthMetric = (
  metric: HealthMetric,
  options: ValidationOptions = {}
): ValidationResult => {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  try {
    // Validate required fields
    if (!metric.metricType || !metric.value || !metric.unit) {
      result.isValid = false;
      result.errors.push('Missing required metric fields');
      return result;
    }

    // Validate metric type
    if (!Object.values(HEALTH_METRIC_TYPES).includes(metric.metricType)) {
      result.isValid = false;
      result.errors.push(`Unsupported metric type: ${metric.metricType}`);
      return result;
    }

    // Validate unit
    const unitConfig = HEALTH_UNITS[metric.metricType];
    if (!unitConfig) {
      result.isValid = false;
      result.errors.push(`No unit configuration for metric type: ${metric.metricType}`);
      return result;
    }

    const validUnits = [unitConfig.standard, ...unitConfig.alternate];
    if (!validUnits.includes(metric.unit)) {
      result.isValid = false;
      result.errors.push(`Invalid unit ${metric.unit} for metric type ${metric.metricType}`);
      return result;
    }

    // Validate value ranges
    const ranges = HEALTH_METRIC_RANGES[metric.metricType];
    if (ranges) {
      // Age-specific validation
      if (options.age && ranges.age_specific) {
        const ageRange = getAgeSpecificRange(options.age, ranges.age_specific);
        if (metric.value < ageRange.min || metric.value > ageRange.max) {
          result.warnings.push(
            `Value ${metric.value} is outside age-specific range (${ageRange.min}-${ageRange.max})`
          );
        }
      }

      // Activity-specific validation for heart rate
      if (metric.metricType === HEALTH_METRIC_TYPES.HEART_RATE && 
          options.activityType && 
          ranges.activity_specific) {
        const activityRange = ranges.activity_specific[options.activityType];
        if (activityRange && (metric.value < activityRange.min || metric.value > activityRange.max)) {
          result.warnings.push(
            `Heart rate ${metric.value} is outside ${options.activityType} range (${activityRange.min}-${activityRange.max})`
          );
        }
      }

      // General range validation
      if (metric.value < ranges.min || metric.value > ranges.max) {
        if (options.strict) {
          result.isValid = false;
          result.errors.push(
            `Value ${metric.value} is outside allowed range (${ranges.min}-${ranges.max})`
          );
        } else {
          result.warnings.push(
            `Value ${metric.value} is outside typical range (${ranges.min}-${ranges.max})`
          );
        }
      }
    }

    // Validate timestamp
    if (!isValid(metric.effectivePeriod.start)) {
      result.isValid = false;
      result.errors.push('Invalid timestamp');
    }

    // Validate source platform
    if (metric.source && !Object.values(HEALTH_PLATFORMS).includes(metric.source)) {
      result.warnings.push(`Unknown data source platform: ${metric.source}`);
    }

    return result;
  } catch (error) {
    console.error('Error validating health metric:', error);
    result.isValid = false;
    result.errors.push('Validation error occurred');
    return result;
  }
};

/**
 * Formats a health metric for display with localization support
 * @param metric Health metric to format
 * @param locale Locale string for formatting
 * @returns Formatted metric string
 */
export const formatHealthMetric = (
  metric: HealthMetric,
  locale: string = 'en-US'
): string => {
  try {
    const value = new Intl.NumberFormat(locale, {
      maximumFractionDigits: getMetricPrecision(metric.metricType)
    }).format(metric.value);

    const timestamp = formatDate(
      metric.effectivePeriod.start,
      'PPpp',
      locale
    );

    // Special handling for blood pressure
    if (metric.metricType === HEALTH_METRIC_TYPES.BLOOD_PRESSURE) {
      const [systolic, diastolic] = Array.isArray(metric.value) 
        ? metric.value 
        : [metric.value, null];
      return diastolic 
        ? `${systolic}/${diastolic} ${metric.unit} (${timestamp})`
        : `${systolic} ${metric.unit} (${timestamp})`;
    }

    return `${value} ${metric.unit} (${timestamp})`;
  } catch (error) {
    console.error('Error formatting health metric:', error);
    return 'Error formatting metric';
  }
};

/**
 * Converts a health metric to a different unit
 * @param metric Health metric to convert
 * @param targetUnit Target unit for conversion
 * @returns Converted health metric
 */
export const convertHealthMetric = (
  metric: HealthMetric,
  targetUnit: string
): HealthMetric => {
  try {
    const unitConfig = HEALTH_UNITS[metric.metricType];
    if (!unitConfig) {
      throw new Error(`No unit configuration for metric type: ${metric.metricType}`);
    }

    if (metric.unit === targetUnit) {
      return { ...metric };
    }

    if (!unitConfig.conversion) {
      throw new Error(`No conversion factors defined for ${metric.metricType}`);
    }

    let convertedValue: number;
    const sourceUnit = metric.unit;

    // Convert to standard unit first if necessary
    if (sourceUnit !== unitConfig.standard) {
      convertedValue = metric.value / unitConfig.conversion[sourceUnit];
    } else {
      convertedValue = metric.value;
    }

    // Convert to target unit if not standard
    if (targetUnit !== unitConfig.standard) {
      convertedValue *= unitConfig.conversion[targetUnit];
    }

    return {
      ...metric,
      value: Number(convertedValue.toFixed(getMetricPrecision(metric.metricType))),
      unit: targetUnit
    };
  } catch (error) {
    console.error('Error converting health metric:', error);
    return metric;
  }
};

/**
 * Helper function to get metric-specific precision
 */
const getMetricPrecision = (metricType: HealthMetricType): number => {
  const precisionMap: { [key in HealthMetricType]?: number } = {
    [HEALTH_METRIC_TYPES.HEART_RATE]: 0,
    [HEALTH_METRIC_TYPES.BLOOD_PRESSURE]: 0,
    [HEALTH_METRIC_TYPES.BLOOD_GLUCOSE]: 1,
    [HEALTH_METRIC_TYPES.WEIGHT]: 1,
    [HEALTH_METRIC_TYPES.HEIGHT]: 1,
    [HEALTH_METRIC_TYPES.STEPS]: 0
  };
  return precisionMap[metricType] ?? 2;
};

/**
 * Helper function to determine age-specific ranges
 */
const getAgeSpecificRange = (
  age: number,
  ranges: Record<string, { min: number; max: number }>
): { min: number; max: number } => {
  if (age < 1) return ranges.newborn;
  if (age < 2) return ranges.infant;
  if (age < 13) return ranges.child;
  return ranges.adult;
};