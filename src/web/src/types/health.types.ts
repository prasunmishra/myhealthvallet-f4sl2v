/**
 * @fileoverview Health-related TypeScript type definitions for PHRSAT
 * @version 1.0.0
 * 
 * FHIR R4 compliant type definitions for:
 * - Health metrics
 * - Health records
 * - Platform integrations
 * - Data synchronization
 */

import { ApiResponse } from './api.types';

/**
 * FHIR R4 CodeableConcept type for standardized coding
 */
export interface CodeableConcept {
  coding: Array<{
    system: string;
    code: string;
    display?: string;
  }>;
  text?: string;
}

/**
 * FHIR R4 Reference type for resource references
 */
export interface Reference {
  reference: string;
  type?: string;
  display?: string;
}

/**
 * Supported health metric types
 */
export enum HealthMetricType {
  HEART_RATE = 'heart_rate',
  BLOOD_PRESSURE = 'blood_pressure',
  BLOOD_GLUCOSE = 'blood_glucose',
  WEIGHT = 'weight',
  HEIGHT = 'height',
  STEPS = 'steps',
  SLEEP = 'sleep',
  OXYGEN_SATURATION = 'oxygen_saturation'
}

/**
 * Supported health record types
 */
export enum HealthRecordType {
  LAB_REPORT = 'lab_report',
  PRESCRIPTION = 'prescription',
  IMAGING = 'imaging',
  CLINICAL_NOTES = 'clinical_notes',
  VACCINATION = 'vaccination'
}

/**
 * Supported health data platforms
 */
export enum HealthPlatform {
  APPLE_HEALTH = 'apple_health',
  GOOGLE_FIT = 'google_fit',
  FITBIT = 'fitbit'
}

/**
 * Health data synchronization status
 */
export enum SyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Configuration for sync retry handling
 */
export interface RetryConfig {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential';
  intervalMs: number;
}

/**
 * Structure for validation errors
 */
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, any>;
}

/**
 * FHIR R4 compliant interface for health metric data
 */
export interface HealthMetric {
  id: string;
  metricType: HealthMetricType;
  value: number;
  unit: string;
  effectivePeriod: {
    start: Date;
    end?: Date;
  };
  category: string[];
  interpretation: CodeableConcept[];
  source: HealthPlatform;
  rawData: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * FHIR R4 compliant interface for health record data
 */
export interface HealthRecord {
  id: string;
  recordType: HealthRecordType;
  status: 'preliminary' | 'final' | 'amended' | 'corrected';
  category: CodeableConcept[];
  subject: Reference;
  storageUrl: string;
  recordDate: Date;
  metadata: Record<string, any>;
}

/**
 * Enhanced interface for health platform synchronization status
 */
export interface HealthPlatformSync {
  platform: HealthPlatform;
  status: SyncStatus;
  lastSyncAt: Date;
  retryStrategy: RetryConfig;
  validationErrors: ValidationError[];
  syncMetadata: Record<string, any>;
}

/**
 * Type for health metric API response
 */
export type HealthMetricResponse = ApiResponse<HealthMetric[]>;

/**
 * Type for health record API response
 */
export type HealthRecordResponse = ApiResponse<HealthRecord[]>;

/**
 * Type for health platform sync API response
 */
export type HealthPlatformSyncResponse = ApiResponse<HealthPlatformSync>;