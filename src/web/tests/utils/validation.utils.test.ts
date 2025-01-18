/**
 * @file validation.utils.test.ts
 * @description Test suite for validation utilities ensuring HIPAA compliance,
 * security requirements, and clinical data validation
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { describe, test, expect } from '@jest/globals'; // v29.0.0
import {
  validateEmail,
  validatePassword,
  validateHealthMetric,
  validateDocument,
  validateLoginCredentials
} from '../../src/utils/validation.utils';
import {
  PASSWORD_REQUIREMENTS,
  HEALTH_METRIC_RANGES,
  DOCUMENT_VALIDATION
} from '../../src/constants/validation.constants';

describe('Email Validation', () => {
  test('should validate correct email formats', () => {
    const validEmails = [
      'test@example.com',
      'user.name+tag@example.co.uk',
      '123.456@domain.international'
    ];

    validEmails.forEach(email => {
      const result = validateLoginCredentials({ email, password: 'TestPass123!' });
      expect(result.isValid).toBe(true);
      expect(result.hipaaCompliant).toBe(true);
    });
  });

  test('should reject invalid email formats', () => {
    const invalidEmails = [
      'test@',
      '@example.com',
      'test@.com',
      '<script>alert("xss")</script>@hack.com'
    ];

    invalidEmails.forEach(email => {
      const result = validateLoginCredentials({ email, password: 'TestPass123!' });
      expect(result.isValid).toBe(false);
      expect(result.hipaaCompliant).toBe(false);
    });
  });
});

describe('Password Validation', () => {
  test('should validate HIPAA-compliant passwords', () => {
    const validPasswords = [
      'SecurePass123!',
      'HealthData2023#',
      'ComplexP@ssw0rd'
    ];

    validPasswords.forEach(password => {
      const result = validateLoginCredentials({ 
        email: 'test@example.com', 
        password 
      });
      expect(result.isValid).toBe(true);
      expect(result.hipaaCompliant).toBe(true);
    });
  });

  test('should enforce password requirements', () => {
    const invalidPasswords = [
      'short1!',                 // Too short
      'nouppercase123!',        // No uppercase
      'NOLOWERCASE123!',        // No lowercase
      'NoSpecialChars123',      // No special chars
      'NoNumbers!'              // No numbers
    ];

    invalidPasswords.forEach(password => {
      const result = validateLoginCredentials({ 
        email: 'test@example.com', 
        password 
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('Health Metric Validation', () => {
  test('should validate heart rate within clinical ranges', () => {
    const validHeartRates = [60, 100, 150];
    const invalidHeartRates = [20, 250];

    validHeartRates.forEach(value => {
      const result = validateHealthMetric({
        type: 'heartRate',
        value,
        unit: 'bpm',
        timestamp: new Date().toISOString()
      });
      expect(result.isValid).toBe(true);
      expect(result.clinicalContext).toBeTruthy();
    });

    invalidHeartRates.forEach(value => {
      const result = validateHealthMetric({
        type: 'heartRate',
        value,
        unit: 'bpm',
        timestamp: new Date().toISOString()
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  test('should validate blood pressure measurements', () => {
    const validBP = {
      type: 'bloodPressure',
      value: { systolic: 120, diastolic: 80 },
      unit: 'mmHg',
      timestamp: new Date().toISOString()
    };

    const invalidBP = {
      type: 'bloodPressure',
      value: { systolic: 80, diastolic: 100 }, // Systolic < Diastolic
      unit: 'mmHg',
      timestamp: new Date().toISOString()
    };

    const validResult = validateHealthMetric(validBP);
    expect(validResult.isValid).toBe(true);
    expect(validResult.hipaaCompliant).toBe(true);

    const invalidResult = validateHealthMetric(invalidBP);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors).toContain('Systolic pressure must be greater than diastolic pressure');
  });
});

describe('Document Validation', () => {
  test('should validate HIPAA-compliant document uploads', () => {
    const validFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const invalidTypeFile = new File(['test content'], 'test.exe', { type: 'application/x-msdownload' });
    const oversizedFile = new File(
      [new ArrayBuffer(DOCUMENT_VALIDATION.maxFileSize + 1)],
      'large.pdf',
      { type: 'application/pdf' }
    );

    const validResult = validateDocument(validFile);
    expect(validResult.isValid).toBe(true);
    expect(validResult.hipaaCompliant).toBe(true);

    const invalidTypeResult = validateDocument(invalidTypeFile);
    expect(invalidTypeResult.isValid).toBe(false);
    expect(invalidTypeResult.errors).toContain(
      `File type application/x-msdownload is not allowed. Allowed types: ${DOCUMENT_VALIDATION.allowedFileTypes.join(', ')}`
    );

    const oversizedResult = validateDocument(oversizedFile);
    expect(oversizedResult.isValid).toBe(false);
    expect(oversizedResult.errors).toContain(
      `File size must not exceed ${DOCUMENT_VALIDATION.maxFileSize / 1048576}MB`
    );
  });
});

describe('Login Credentials Validation', () => {
  test('should validate complete login credentials with MFA', () => {
    const validCredentials = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      mfaToken: '123456'
    };

    const invalidMFACredentials = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      mfaToken: '12345' // Invalid length
    };

    const validResult = validateLoginCredentials(validCredentials);
    expect(validResult.isValid).toBe(true);
    expect(validResult.hipaaCompliant).toBe(true);

    const invalidResult = validateLoginCredentials(invalidMFACredentials);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  test('should validate audit logging requirements', () => {
    const credentials = {
      email: 'test@example.com',
      password: 'SecurePass123!'
    };

    const result = validateLoginCredentials(credentials);
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog.timestamp).toBeDefined();
    expect(result.auditLog.validationType).toBe('LoginCredentials');
    expect(['SUCCESS', 'FAILED']).toContain(result.auditLog.status);
  });
});