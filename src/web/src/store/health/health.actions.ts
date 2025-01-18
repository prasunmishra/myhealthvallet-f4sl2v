/**
 * @fileoverview Redux action creators for health data management
 * @version 1.0.0
 * 
 * Implements FHIR-compliant Redux actions for health metrics management with:
 * - Type-safe operations
 * - Platform synchronization
 * - Comprehensive error handling
 * - Real-time monitoring
 */

import { ThunkAction } from 'redux-thunk'; // version: ^2.4.2
import { Dispatch } from 'redux'; // version: ^4.2.1
import { debounce } from 'lodash'; // version: ^4.17.21
import { v4 as uuidv4 } from 'uuid'; // version: ^9.0.0
import { ErrorTypes } from '@types/http-errors'; // version: ^2.0.1

import { HealthActionTypes } from './health.types';
import HealthService from '../../services/health.service';
import { 
  HealthMetric, 
  HealthPlatform, 
  ValidationError, 
  HealthMetricType 
} from '../../types/health.types';

// Initialize health service
const healthService = new HealthService();

// Constants for retry and caching configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMs: 1000
};

const CACHE_CONFIG = {
  ttlMs: 300000, // 5 minutes
  maxSize: 1000
};

/**
 * Enhanced thunk action creator for fetching health metrics
 * Implements FHIR validation, caching, and retry capability
 */
export const fetchHealthMetrics = debounce(
  (
    filters: {
      types?: HealthMetricType[];
      startDate?: Date;
      endDate?: Date;
      source?: HealthPlatform;
    },
    options: {
      forceRefresh?: boolean;
      validateFHIR?: boolean;
      retryOnError?: boolean;
    } = {}
  ): ThunkAction<Promise<void>, any, unknown, any> => {
    return async (dispatch: Dispatch) => {
      const correlationId = uuidv4();

      try {
        dispatch({
          type: HealthActionTypes.FETCH_METRICS_REQUEST,
          payload: { filters, correlationId }
        });

        const metrics = await healthService.getHealthMetrics(filters);

        if (options.validateFHIR) {
          await Promise.all(
            metrics.map(metric => healthService.validateFHIRCompliance(metric))
          );
        }

        dispatch({
          type: HealthActionTypes.FETCH_METRICS_SUCCESS,
          payload: {
            metrics,
            correlationId,
            timestamp: Date.now()
          }
        });
      } catch (error: any) {
        const shouldRetry = options.retryOnError && 
          error.retryable && 
          error.attempt < RETRY_CONFIG.maxAttempts;

        if (shouldRetry) {
          await healthService.retryOperation(
            () => fetchHealthMetrics(filters, options)(dispatch),
            error.attempt,
            RETRY_CONFIG.backoffMs
          );
          return;
        }

        dispatch({
          type: HealthActionTypes.FETCH_METRICS_FAILURE,
          payload: {
            error: {
              message: error.message,
              code: error.code || ErrorTypes.INTERNAL_SERVER_ERROR,
              correlationId,
              retryable: error.retryable
            }
          }
        });
      }
    };
  },
  300 // Debounce delay
);

/**
 * Enhanced thunk action creator for syncing health platform data
 * Implements progress tracking and batch processing
 */
export const syncHealthPlatform = (
  platform: HealthPlatform,
  syncOptions: {
    metrics?: HealthMetricType[];
    startDate?: Date;
    endDate?: Date;
    batchSize?: number;
  } = {}
): ThunkAction<Promise<void>, any, unknown, any> => {
  return async (dispatch: Dispatch) => {
    const correlationId = uuidv4();
    let syncProgress = 0;

    try {
      dispatch({
        type: HealthActionTypes.SYNC_HEALTH_DATA_REQUEST,
        payload: { platform, correlationId }
      });

      const handleProgress = (progress: number) => {
        syncProgress = progress;
        dispatch({
          type: HealthActionTypes.SYNC_PROGRESS_UPDATE,
          payload: { platform, progress, correlationId }
        });
      };

      const result = await healthService.syncHealthPlatform({
        platform,
        syncOptions: {
          ...syncOptions,
          onProgress: handleProgress
        }
      });

      dispatch({
        type: HealthActionTypes.SYNC_HEALTH_DATA_SUCCESS,
        payload: {
          platform,
          result,
          correlationId,
          timestamp: Date.now()
        }
      });
    } catch (error: any) {
      const retryAttempt = error.attempt || 1;

      if (retryAttempt < RETRY_CONFIG.maxAttempts) {
        dispatch({
          type: HealthActionTypes.SYNC_RETRY_ATTEMPT,
          payload: {
            platform,
            attempt: retryAttempt,
            correlationId
          }
        });

        await healthService.retryOperation(
          () => syncHealthPlatform(platform, syncOptions)(dispatch),
          retryAttempt,
          RETRY_CONFIG.backoffMs
        );
        return;
      }

      dispatch({
        type: HealthActionTypes.SYNC_HEALTH_DATA_FAILURE,
        payload: {
          platform,
          error: {
            message: error.message,
            code: error.code || ErrorTypes.INTERNAL_SERVER_ERROR,
            correlationId,
            progress: syncProgress,
            retryable: false
          }
        }
      });
    }
  };
};

export type HealthActions = ReturnType<typeof fetchHealthMetrics> | ReturnType<typeof syncHealthPlatform>;