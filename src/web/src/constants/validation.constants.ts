/**
 * @file validation.constants.ts
 * @description Defines validation constants and rules for form validation, data validation, 
 * and input sanitization across the web application, with specific focus on health data,
 * user input, and document validation requirements.
 * @version 1.0.0
 * @license HIPAA-compliant
 */

/**
 * Interface defining password requirement rules
 * Ensures HIPAA compliance for password security
 */
interface PasswordRequirements {
  readonly minLength: number;
  readonly maxLength: number;
  readonly requireUppercase: boolean;
  readonly requireNumbers: boolean;
  readonly requireSpecialChar: boolean;
}

/**
 * Interface for basic numeric range validation
 */
interface MetricRange {
  readonly min: number;
  readonly max: number;
  readonly description: string;
}

/**
 * Interface for blood pressure range validation
 */
interface BloodPressureRange {
  readonly systolic: {
    readonly min: number;
    readonly max: number;
    readonly unit: string;
    readonly description: string;
  };
  readonly diastolic: {
    readonly min: number;
    readonly max: number;
    readonly unit: string;
    readonly description: string;
  };
}

/**
 * Interface for health metric ranges with units
 */
interface HealthMetricRanges {
  readonly heartRate: MetricRange & { unit: string };
  readonly bloodPressure: BloodPressureRange;
  readonly steps: MetricRange & { unit: string };
}

/**
 * Interface for document validation rules
 */
interface DocumentValidation {
  readonly maxFileSize: number;
  readonly maxFilenameLength: number;
  readonly allowedFileTypes: readonly string[];
  readonly description: string;
}

/**
 * Password requirements following HIPAA security guidelines
 * @constant
 */
export const PASSWORD_REQUIREMENTS: Readonly<PasswordRequirements> = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireNumbers: true,
  requireSpecialChar: true,
} as const;

/**
 * Clinically validated ranges for health metrics
 * Based on medical standards and extreme use cases
 * @constant
 */
export const HEALTH_METRIC_RANGES: Readonly<HealthMetricRanges> = {
  heartRate: {
    min: 30,
    max: 220,
    unit: 'bpm',
    description: 'Valid range including athletic and emergency conditions'
  },
  bloodPressure: {
    systolic: {
      min: 70,
      max: 190,
      unit: 'mmHg',
      description: 'Valid systolic range for adults'
    },
    diastolic: {
      min: 40,
      max: 130,
      unit: 'mmHg',
      description: 'Valid diastolic range for adults'
    }
  },
  steps: {
    min: 0,
    max: 100000,
    unit: 'steps',
    description: 'Daily steps range including ultra-marathoners'
  }
} as const;

/**
 * Document validation rules following HIPAA guidelines
 * @constant
 * maxFileSize: 50MB in bytes
 */
export const DOCUMENT_VALIDATION: Readonly<DocumentValidation> = {
  maxFileSize: 52428800, // 50MB in bytes
  maxFilenameLength: 255,
  allowedFileTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/dicom'
  ],
  description: 'HIPAA-compliant document restrictions'
} as const;

/**
 * RFC 5322 compliant email validation pattern
 * @constant
 */
export const EMAIL_REGEX: Readonly<RegExp> = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/ as const;

/**
 * Type guard to check if a value is within a metric range
 * @param value The numeric value to check
 * @param range The MetricRange to check against
 * @returns boolean indicating if value is within range
 */
export const isWithinMetricRange = (value: number, range: MetricRange): boolean => {
  return value >= range.min && value <= range.max;
};

/**
 * Type guard to check if blood pressure values are valid
 * @param systolic The systolic blood pressure value
 * @param diastolic The diastolic blood pressure value
 * @returns boolean indicating if values are valid
 */
export const isValidBloodPressure = (
  systolic: number,
  diastolic: number
): boolean => {
  const { bloodPressure } = HEALTH_METRIC_RANGES;
  return (
    systolic >= bloodPressure.systolic.min &&
    systolic <= bloodPressure.systolic.max &&
    diastolic >= bloodPressure.diastolic.min &&
    diastolic <= bloodPressure.diastolic.max &&
    systolic > diastolic
  );
};