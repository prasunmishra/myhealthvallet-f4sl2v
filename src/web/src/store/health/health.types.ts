/**
 * @fileoverview Redux health state management type definitions with FHIR R4 compliance
 * @version 1.0.0
 * 
 * Comprehensive type definitions for health data state management including:
 * - Action types for health data operations
 * - State interface with FHIR validation
 * - Platform-specific data handling
 */

import { Action } from 'redux'; // version: ^4.2.1
import { FHIRResource } from 'fhir/r4'; // version: ^4.0.0
import { 
  HealthMetric, 
  HealthRecord, 
  HealthPlatformSync,
  HealthMetricType,
  HealthRecordType,
  HealthPlatform,
  SyncStatus,
  ValidationError
} from '../../types/health.types';

/**
 * Health-related Redux action types
 */
export enum HealthActionTypes {
  // Metric operations
  FETCH_METRICS_REQUEST = '@health/FETCH_METRICS_REQUEST',
  FETCH_METRICS_SUCCESS = '@health/FETCH_METRICS_SUCCESS',
  FETCH_METRICS_FAILURE = '@health/FETCH_METRICS_FAILURE',
  
  // Health record operations
  FETCH_RECORDS_REQUEST = '@health/FETCH_RECORDS_REQUEST',
  FETCH_RECORDS_SUCCESS = '@health/FETCH_RECORDS_SUCCESS',
  FETCH_RECORDS_FAILURE = '@health/FETCH_RECORDS_FAILURE',
  
  // Platform sync operations
  SYNC_HEALTH_DATA_REQUEST = '@health/SYNC_HEALTH_DATA_REQUEST',
  SYNC_HEALTH_DATA_SUCCESS = '@health/SYNC_HEALTH_DATA_SUCCESS',
  SYNC_HEALTH_DATA_FAILURE = '@health/SYNC_HEALTH_DATA_FAILURE',
  
  // FHIR validation operations
  VALIDATE_FHIR_DATA = '@health/VALIDATE_FHIR_DATA',
  VALIDATE_FHIR_SUCCESS = '@health/VALIDATE_FHIR_SUCCESS',
  VALIDATE_FHIR_FAILURE = '@health/VALIDATE_FHIR_FAILURE',
  
  // Platform-specific operations
  CONNECT_PLATFORM = '@health/CONNECT_PLATFORM',
  DISCONNECT_PLATFORM = '@health/DISCONNECT_PLATFORM',
  UPDATE_SYNC_STATUS = '@health/UPDATE_SYNC_STATUS'
}

/**
 * FHIR validation state interface
 */
export interface FHIRValidationState {
  isValid: boolean;
  errors: ValidationError[];
  lastValidated: Date | null;
  resourcesValidated: number;
}

/**
 * Health metrics filter criteria
 */
export interface HealthMetricFilter {
  metricTypes?: HealthMetricType[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  platforms?: HealthPlatform[];
  limit?: number;
  offset?: number;
}

/**
 * Health records filter criteria
 */
export interface HealthRecordFilter {
  recordTypes?: HealthRecordType[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  status?: string[];
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

/**
 * Platform sync configuration
 */
export interface PlatformSyncConfig {
  platform: HealthPlatform;
  metrics: HealthMetricType[];
  syncInterval: number;
  retryAttempts: number;
  validateFHIR: boolean;
}

/**
 * Main health state interface for Redux store
 */
export interface HealthState {
  // Health metrics data
  metrics: HealthMetric[];
  metricFilters: HealthMetricFilter;
  
  // Health records data
  records: HealthRecord[];
  recordFilters: HealthRecordFilter;
  
  // Loading and error states
  loading: {
    metrics: boolean;
    records: boolean;
    sync: boolean;
    validation: boolean;
  };
  error: {
    metrics: string | null;
    records: string | null;
    sync: string | null;
    validation: string | null;
  };
  
  // Sync status
  lastSyncTimestamp: Date | null;
  platformSync: Record<HealthPlatform, HealthPlatformSync>;
  syncConfig: Record<HealthPlatform, PlatformSyncConfig>;
  
  // FHIR validation
  fhirValidation: FHIRValidationState;
  pendingValidation: FHIRResource[];
}

/**
 * Action interfaces for type safety
 */
export interface FetchMetricsRequestAction extends Action<HealthActionTypes.FETCH_METRICS_REQUEST> {
  payload: HealthMetricFilter;
}

export interface FetchMetricsSuccessAction extends Action<HealthActionTypes.FETCH_METRICS_SUCCESS> {
  payload: HealthMetric[];
}

export interface FetchMetricsFailureAction extends Action<HealthActionTypes.FETCH_METRICS_FAILURE> {
  payload: string;
}

export interface SyncHealthDataRequestAction extends Action<HealthActionTypes.SYNC_HEALTH_DATA_REQUEST> {
  payload: {
    platform: HealthPlatform;
    config: PlatformSyncConfig;
  };
}

export interface SyncHealthDataSuccessAction extends Action<HealthActionTypes.SYNC_HEALTH_DATA_SUCCESS> {
  payload: {
    platform: HealthPlatform;
    syncResult: HealthPlatformSync;
  };
}

export interface SyncHealthDataFailureAction extends Action<HealthActionTypes.SYNC_HEALTH_DATA_FAILURE> {
  payload: {
    platform: HealthPlatform;
    error: string;
  };
}

export interface ValidateFHIRDataAction extends Action<HealthActionTypes.VALIDATE_FHIR_DATA> {
  payload: FHIRResource[];
}

/**
 * Union type of all health-related actions
 */
export type HealthActions =
  | FetchMetricsRequestAction
  | FetchMetricsSuccessAction
  | FetchMetricsFailureAction
  | SyncHealthDataRequestAction
  | SyncHealthDataSuccessAction
  | SyncHealthDataFailureAction
  | ValidateFHIRDataAction;