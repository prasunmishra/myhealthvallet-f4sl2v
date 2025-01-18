/**
 * @file validation.utils.ts
 * @description Provides comprehensive validation utilities for form validation, data validation,
 * and input sanitization across the web application, with enhanced focus on HIPAA-compliant
 * health data validation, secure user input validation, and document validation requirements.
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { z } from 'zod'; // v3.22.0
import {
  PASSWORD_REQUIREMENTS,
  HEALTH_METRIC_RANGES,
  DOCUMENT_VALIDATION
} from '../constants/validation.constants';

/**
 * Interface for validation results with HIPAA compliance context
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  clinicalContext?: string;
  hipaaCompliant: boolean;
  auditLog: {
    timestamp: string;
    validationType: string;
    status: string;
  };
}

/**
 * Interface for health metric validation
 */
interface HealthMetric {
  type: 'heartRate' | 'bloodPressure' | 'steps';
  value: number | { systolic: number; diastolic: number };
  unit: string;
  timestamp: string;
}

/**
 * Interface for login credentials
 */
interface LoginCredentials {
  email: string;
  password: string;
  mfaToken?: string;
}

/**
 * Sanitizes input strings for security
 * @param input String to sanitize
 * @returns Sanitized string
 */
const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML/XML tags
    .replace(/['"]/g, ''); // Remove quotes that could enable SQL injection
};

/**
 * Validates health metric values against FHIR R4 compliant ranges
 * @param metric Health metric to validate
 * @returns Validation result with clinical context
 */
export const validateHealthMetric = (metric: HealthMetric): ValidationResult => {
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    clinicalContext: '',
    hipaaCompliant: true,
    auditLog: {
      timestamp: new Date().toISOString(),
      validationType: 'HealthMetric',
      status: 'PENDING'
    }
  };

  try {
    // Validate metric type and structure
    const metricSchema = z.object({
      type: z.enum(['heartRate', 'bloodPressure', 'steps']),
      timestamp: z.string().datetime(),
      unit: z.string().min(1)
    });

    metricSchema.parse(metric);

    switch (metric.type) {
      case 'heartRate':
        if (typeof metric.value !== 'number') {
          throw new Error('Heart rate must be a number');
        }
        
        const heartRateRange = HEALTH_METRIC_RANGES.heartRate;
        if (metric.value < heartRateRange.min || metric.value > heartRateRange.max) {
          throw new Error(`Heart rate must be between ${heartRateRange.min} and ${heartRateRange.max} ${heartRateRange.unit}`);
        }
        
        result.clinicalContext = heartRateRange.description;
        break;

      case 'bloodPressure':
        if (typeof metric.value === 'number') {
          throw new Error('Blood pressure must include systolic and diastolic values');
        }
        
        const bpRange = HEALTH_METRIC_RANGES.bloodPressure;
        const { systolic, diastolic } = metric.value as { systolic: number; diastolic: number };
        
        if (systolic < bpRange.systolic.min || systolic > bpRange.systolic.max) {
          throw new Error(`Systolic pressure must be between ${bpRange.systolic.min} and ${bpRange.systolic.max} ${bpRange.systolic.unit}`);
        }
        
        if (diastolic < bpRange.diastolic.min || diastolic > bpRange.diastolic.max) {
          throw new Error(`Diastolic pressure must be between ${bpRange.diastolic.min} and ${bpRange.diastolic.max} ${bpRange.diastolic.unit}`);
        }
        
        if (systolic <= diastolic) {
          throw new Error('Systolic pressure must be greater than diastolic pressure');
        }
        
        result.clinicalContext = `Systolic: ${bpRange.systolic.description}, Diastolic: ${bpRange.diastolic.description}`;
        break;

      case 'steps':
        if (typeof metric.value !== 'number') {
          throw new Error('Steps must be a number');
        }
        
        const stepsRange = HEALTH_METRIC_RANGES.steps;
        if (metric.value < stepsRange.min || metric.value > stepsRange.max) {
          throw new Error(`Steps must be between ${stepsRange.min} and ${stepsRange.max} ${stepsRange.unit}`);
        }
        
        result.clinicalContext = stepsRange.description;
        break;
    }

    result.isValid = true;
    result.auditLog.status = 'SUCCESS';

  } catch (error) {
    result.isValid = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown validation error');
    result.auditLog.status = 'FAILED';
    result.hipaaCompliant = false;
  }

  return result;
};

/**
 * Validates login credentials with enhanced security checks
 * @param credentials Login credentials to validate
 * @returns Validation result with security context
 */
export const validateLoginCredentials = (credentials: LoginCredentials): ValidationResult => {
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    hipaaCompliant: true,
    auditLog: {
      timestamp: new Date().toISOString(),
      validationType: 'LoginCredentials',
      status: 'PENDING'
    }
  };

  try {
    // Email validation
    const emailSchema = z
      .string()
      .email()
      .transform(email => sanitizeInput(email.toLowerCase()));

    // Password validation
    const passwordSchema = z
      .string()
      .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
      .max(PASSWORD_REQUIREMENTS.maxLength, `Password must not exceed ${PASSWORD_REQUIREMENTS.maxLength} characters`)
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

    // Optional MFA token validation
    const mfaSchema = z.string().length(6).regex(/^\d+$/).optional();

    // Validate all credentials
    const credentialsSchema = z.object({
      email: emailSchema,
      password: passwordSchema,
      mfaToken: mfaSchema
    });

    credentialsSchema.parse(credentials);

    result.isValid = true;
    result.auditLog.status = 'SUCCESS';

  } catch (error) {
    result.isValid = false;
    if (error instanceof z.ZodError) {
      result.errors = error.errors.map(err => err.message);
    } else {
      result.errors.push('Invalid credentials format');
    }
    result.auditLog.status = 'FAILED';
    result.hipaaCompliant = false;
  }

  return result;
};

/**
 * Validates document upload against HIPAA-compliant rules
 * @param file File to validate
 * @returns Validation result
 */
export const validateDocument = (file: File): ValidationResult => {
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    hipaaCompliant: true,
    auditLog: {
      timestamp: new Date().toISOString(),
      validationType: 'Document',
      status: 'PENDING'
    }
  };

  try {
    // Validate file size
    if (file.size > DOCUMENT_VALIDATION.maxFileSize) {
      throw new Error(`File size must not exceed ${DOCUMENT_VALIDATION.maxFileSize / 1048576}MB`);
    }

    // Validate file type
    if (!DOCUMENT_VALIDATION.allowedFileTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed. Allowed types: ${DOCUMENT_VALIDATION.allowedFileTypes.join(', ')}`);
    }

    // Validate filename length and characters
    const sanitizedFilename = sanitizeInput(file.name);
    if (sanitizedFilename.length > DOCUMENT_VALIDATION.maxFilenameLength) {
      throw new Error(`Filename must not exceed ${DOCUMENT_VALIDATION.maxFilenameLength} characters`);
    }

    result.isValid = true;
    result.auditLog.status = 'SUCCESS';

  } catch (error) {
    result.isValid = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown validation error');
    result.auditLog.status = 'FAILED';
    result.hipaaCompliant = false;
  }

  return result;
};