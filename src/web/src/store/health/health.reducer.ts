/**
 * @fileoverview Redux reducer for health data management with FHIR validation
 * @version 1.0.0
 */

import { Reducer } from '@reduxjs/toolkit'; // version: ^1.9.5
import {
  HealthState,
  HealthAction,
  HealthActionTypes,
  FHIRValidationState,
  HealthPlatform,
  SyncStatus
} from './health.types';

/**
 * Initial state for health data management
 */
const initialState: HealthState = {
  // Health data collections
  metrics: [],
  metricFilters: {
    metricTypes: [],
    dateRange: undefined,
    platforms: [],
    limit: 100,
    offset: 0
  },
  records: [],
  recordFilters: {
    recordTypes: [],
    dateRange: undefined,
    status: [],
    searchTerm: '',
    limit: 50,
    offset: 0
  },

  // Loading states
  loading: {
    metrics: false,
    records: false,
    sync: false,
    validation: false
  },

  // Error states with enhanced tracking
  error: {
    metrics: null,
    records: null,
    sync: null,
    validation: null
  },

  // Sync status tracking
  lastSyncTimestamp: null,
  platformSync: Object.values(HealthPlatform).reduce((acc, platform) => ({
    ...acc,
    [platform]: {
      platform,
      status: SyncStatus.PENDING,
      lastSyncAt: null,
      retryStrategy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        intervalMs: 1000
      },
      validationErrors: [],
      syncMetadata: {}
    }
  }), {}),
  syncConfig: {},

  // FHIR validation state
  fhirValidation: {
    isValid: true,
    errors: [],
    lastValidated: null,
    resourcesValidated: 0
  },
  pendingValidation: []
};

/**
 * Health data reducer with FHIR validation and enhanced error tracking
 */
const healthReducer: Reducer<HealthState, HealthAction> = (state = initialState, action): HealthState => {
  switch (action.type) {
    // Metric fetch operations
    case HealthActionTypes.FETCH_METRICS_REQUEST:
      return {
        ...state,
        loading: { ...state.loading, metrics: true },
        error: { ...state.error, metrics: null }
      };

    case HealthActionTypes.FETCH_METRICS_SUCCESS:
      return {
        ...state,
        metrics: action.payload,
        loading: { ...state.loading, metrics: false },
        error: { ...state.error, metrics: null }
      };

    case HealthActionTypes.FETCH_METRICS_FAILURE:
      return {
        ...state,
        loading: { ...state.loading, metrics: false },
        error: {
          ...state.error,
          metrics: action.payload
        }
      };

    // Health record operations
    case HealthActionTypes.FETCH_RECORDS_REQUEST:
      return {
        ...state,
        loading: { ...state.loading, records: true },
        error: { ...state.error, records: null }
      };

    case HealthActionTypes.FETCH_RECORDS_SUCCESS:
      return {
        ...state,
        records: action.payload,
        loading: { ...state.loading, records: false },
        error: { ...state.error, records: null }
      };

    case HealthActionTypes.FETCH_RECORDS_FAILURE:
      return {
        ...state,
        loading: { ...state.loading, records: false },
        error: {
          ...state.error,
          records: action.payload
        }
      };

    // Platform sync operations
    case HealthActionTypes.SYNC_HEALTH_DATA_REQUEST:
      return {
        ...state,
        loading: { ...state.loading, sync: true },
        platformSync: {
          ...state.platformSync,
          [action.payload.platform]: {
            ...state.platformSync[action.payload.platform],
            status: SyncStatus.IN_PROGRESS
          }
        }
      };

    case HealthActionTypes.SYNC_HEALTH_DATA_SUCCESS:
      return {
        ...state,
        loading: { ...state.loading, sync: false },
        lastSyncTimestamp: new Date(),
        platformSync: {
          ...state.platformSync,
          [action.payload.platform]: {
            ...action.payload.syncResult,
            status: SyncStatus.COMPLETED
          }
        }
      };

    case HealthActionTypes.SYNC_HEALTH_DATA_FAILURE:
      return {
        ...state,
        loading: { ...state.loading, sync: false },
        error: { ...state.error, sync: action.payload.error },
        platformSync: {
          ...state.platformSync,
          [action.payload.platform]: {
            ...state.platformSync[action.payload.platform],
            status: SyncStatus.FAILED,
            validationErrors: [{
              code: 'SYNC_FAILED',
              message: action.payload.error,
              details: {}
            }]
          }
        }
      };

    // FHIR validation operations
    case HealthActionTypes.VALIDATE_FHIR_DATA:
      return {
        ...state,
        loading: { ...state.loading, validation: true },
        pendingValidation: action.payload
      };

    case HealthActionTypes.VALIDATE_FHIR_SUCCESS:
      const validationState: FHIRValidationState = {
        isValid: true,
        errors: [],
        lastValidated: new Date(),
        resourcesValidated: action.payload.length
      };
      return {
        ...state,
        loading: { ...state.loading, validation: false },
        fhirValidation: validationState,
        pendingValidation: []
      };

    case HealthActionTypes.VALIDATE_FHIR_FAILURE:
      return {
        ...state,
        loading: { ...state.loading, validation: false },
        fhirValidation: {
          ...state.fhirValidation,
          isValid: false,
          errors: action.payload.errors,
          lastValidated: new Date()
        },
        error: {
          ...state.error,
          validation: 'FHIR validation failed'
        }
      };

    // Platform status update
    case HealthActionTypes.UPDATE_SYNC_STATUS:
      return {
        ...state,
        platformSync: {
          ...state.platformSync,
          [action.payload.platform]: {
            ...state.platformSync[action.payload.platform],
            ...action.payload.status
          }
        }
      };

    default:
      return state;
  }
};

export default healthReducer;