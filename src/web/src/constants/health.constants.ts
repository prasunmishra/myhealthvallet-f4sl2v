// @ts-check
import type { Readonly } from 'typescript'; // v5.0.0

/**
 * Enum defining supported health metric types in the system
 * @enum {string}
 */
export enum HEALTH_METRIC_TYPES {
  HEART_RATE = 'heart_rate',
  BLOOD_PRESSURE = 'blood_pressure',
  BLOOD_GLUCOSE = 'blood_glucose',
  WEIGHT = 'weight',
  HEIGHT = 'height',
  STEPS = 'steps',
  SLEEP = 'sleep'
}

/**
 * Enum defining supported health data platforms
 * @enum {string}
 */
export enum HEALTH_PLATFORMS {
  APPLE_HEALTH = 'apple_health',
  GOOGLE_FIT = 'google_fit',
  MANUAL = 'manual'
}

/**
 * Global sync interval default (15 minutes in milliseconds)
 */
export const DEFAULT_SYNC_INTERVAL = 15 * 60 * 1000;

/**
 * Maximum number of sync retries before failing
 */
export const MAX_SYNC_RETRIES = 3;

/**
 * Comprehensive mapping of health metrics to their measurement units
 */
export const HEALTH_UNITS: Readonly<{
  [key in HEALTH_METRIC_TYPES]?: {
    standard: string;
    alternate: string[];
    conversion?: { [key: string]: number };
  };
}> = {
  [HEALTH_METRIC_TYPES.HEART_RATE]: {
    standard: 'bpm',
    alternate: ['beats/min']
  },
  [HEALTH_METRIC_TYPES.BLOOD_PRESSURE]: {
    standard: 'mmHg',
    alternate: ['kPa']
  },
  [HEALTH_METRIC_TYPES.BLOOD_GLUCOSE]: {
    standard: 'mg/dL',
    alternate: ['mmol/L'],
    conversion: {
      'mmol/L': 18.0182
    }
  },
  [HEALTH_METRIC_TYPES.WEIGHT]: {
    standard: 'kg',
    alternate: ['lbs', 'g'],
    conversion: {
      'lbs': 2.20462,
      'g': 1000
    }
  },
  [HEALTH_METRIC_TYPES.HEIGHT]: {
    standard: 'cm',
    alternate: ['in', 'm'],
    conversion: {
      'in': 0.393701,
      'm': 0.01
    }
  }
};

/**
 * Validation ranges for health metrics including age and condition-specific thresholds
 */
export const HEALTH_METRIC_RANGES: Readonly<{
  [key in HEALTH_METRIC_TYPES]?: any;
}> = {
  [HEALTH_METRIC_TYPES.HEART_RATE]: {
    min: 40,
    max: 200,
    age_specific: {
      'newborn': { min: 100, max: 160 },
      'infant': { min: 90, max: 150 },
      'child': { min: 70, max: 140 },
      'adult': { min: 60, max: 100 },
      'athlete': { min: 40, max: 100 }
    },
    activity_specific: {
      'resting': { min: 60, max: 100 },
      'light_exercise': { min: 90, max: 130 },
      'moderate_exercise': { min: 120, max: 150 },
      'intense_exercise': { min: 140, max: 180 }
    }
  },
  [HEALTH_METRIC_TYPES.BLOOD_PRESSURE]: {
    systolic: {
      min: 70,
      max: 190,
      age_specific: {
        'adult': { min: 90, max: 120 },
        'elderly': { min: 95, max: 145 }
      }
    },
    diastolic: {
      min: 40,
      max: 100,
      age_specific: {
        'adult': { min: 60, max: 80 },
        'elderly': { min: 65, max: 85 }
      }
    },
    categories: {
      'normal': {
        systolic: { min: 90, max: 120 },
        diastolic: { min: 60, max: 80 }
      },
      'elevated': {
        systolic: { min: 120, max: 129 },
        diastolic: { min: 60, max: 80 }
      },
      'hypertension_1': {
        systolic: { min: 130, max: 139 },
        diastolic: { min: 80, max: 89 }
      },
      'hypertension_2': {
        systolic: { min: 140, max: 180 },
        diastolic: { min: 90, max: 120 }
      }
    }
  },
  [HEALTH_METRIC_TYPES.BLOOD_GLUCOSE]: {
    fasting: { min: 70, max: 100 },
    postPrandial: { min: 70, max: 140 },
    random: { min: 70, max: 200 },
    a1c: { min: 4.0, max: 6.4 }
  }
};

/**
 * Platform-specific sync configurations
 */
export const SYNC_INTERVALS: Readonly<{
  [key in HEALTH_PLATFORMS]?: {
    interval: number;
    batch_size: number;
    retry_delay: number;
    rate_limit: number;
  };
}> = {
  [HEALTH_PLATFORMS.APPLE_HEALTH]: {
    interval: DEFAULT_SYNC_INTERVAL,
    batch_size: 100,
    retry_delay: 5000,
    rate_limit: 100
  },
  [HEALTH_PLATFORMS.GOOGLE_FIT]: {
    interval: DEFAULT_SYNC_INTERVAL,
    batch_size: 200,
    retry_delay: 3000,
    rate_limit: 150
  }
};