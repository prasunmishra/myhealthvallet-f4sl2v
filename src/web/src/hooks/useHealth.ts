/**
 * Custom React hook for managing health data operations with FHIR compliance
 * Implements real-time updates, comprehensive error handling, and platform sync
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // version: ^18.2.0
import { useDispatch, useSelector } from 'react-redux'; // version: ^8.1.0
import { retry } from 'axios-retry'; // version: ^3.5.0
import { FHIRValidator } from '@fhir/validator'; // version: ^2.0.0

import { 
  fetchHealthMetrics, 
  syncHealthData 
} from '../store/health/health.actions';
import { 
  selectHealthMetrics, 
  selectHealthSyncStatus 
} from '../store/health/health.selectors';
import { 
  HealthMetric, 
  HealthMetricType 
} from '../types/health.types';

/**
 * Interface for health hook error tracking
 */
interface HealthError {
  code: string;
  message: string;
  operation: string;
  retryCount: number;
  timestamp: Date;
}

/**
 * Interface for sync configuration
 */
interface SyncConfig {
  autoSync?: boolean;
  syncInterval?: number;
  retryOnError?: boolean;
  validateFHIR?: boolean;
}

/**
 * Default sync configuration
 */
const DEFAULT_SYNC_CONFIG: SyncConfig = {
  autoSync: true,
  syncInterval: 300000, // 5 minutes
  retryOnError: true,
  validateFHIR: true
};

/**
 * Custom hook for managing health data operations
 */
export function useHealth(
  initialMetricType?: HealthMetricType,
  syncConfig: SyncConfig = DEFAULT_SYNC_CONFIG
) {
  // Redux hooks
  const dispatch = useDispatch();
  const metrics = useSelector(selectHealthMetrics);
  const syncStatus = useSelector(selectHealthSyncStatus);

  // Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<HealthError | null>(null);
  const [fhirValidator] = useState(() => new FHIRValidator());
  const [retryCount, setRetryCount] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  /**
   * Fetches health metrics with error handling and FHIR validation
   */
  const fetchMetrics = useCallback(async (
    type?: HealthMetricType,
    options: { forceRefresh?: boolean; validateFHIR?: boolean } = {}
  ) => {
    try {
      setLoading(true);
      setError(null);

      const response = await dispatch(fetchHealthMetrics({
        types: type ? [type] : undefined,
        forceRefresh: options.forceRefresh
      }));

      if (options.validateFHIR) {
        const validationPromises = response.payload.map(metric => 
          fhirValidator.validateResource(metric)
        );
        await Promise.all(validationPromises);
      }

      setLoading(false);
      setRetryCount(0);
    } catch (err: any) {
      setError({
        code: err.code || 'FETCH_ERROR',
        message: err.message,
        operation: 'fetchMetrics',
        retryCount,
        timestamp: new Date()
      });

      if (syncConfig.retryOnError && retryCount < 3) {
        setRetryCount(prev => prev + 1);
        await retry(
          () => fetchMetrics(type, options),
          { retries: 3, retryDelay: (retryCount) => retryCount * 1000 }
        );
      }

      setLoading(false);
    }
  }, [dispatch, fhirValidator, retryCount, syncConfig.retryOnError]);

  /**
   * Syncs health data with connected platforms
   */
  const syncData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      await dispatch(syncHealthData({
        validateFHIR: syncConfig.validateFHIR
      }));

      setLastSync(new Date());
      setLoading(false);
      setRetryCount(0);
    } catch (err: any) {
      setError({
        code: err.code || 'SYNC_ERROR',
        message: err.message,
        operation: 'syncData',
        retryCount,
        timestamp: new Date()
      });

      if (syncConfig.retryOnError && retryCount < 3) {
        setRetryCount(prev => prev + 1);
        await retry(
          () => syncData(),
          { retries: 3, retryDelay: (retryCount) => retryCount * 1000 }
        );
      }

      setLoading(false);
    }
  }, [dispatch, retryCount, syncConfig]);

  /**
   * Retries failed sync operation
   */
  const retryFailedSync = useCallback(async () => {
    setRetryCount(0);
    await syncData();
  }, [syncData]);

  /**
   * Clears local cache and forces refresh
   */
  const clearCache = useCallback(async () => {
    try {
      setLoading(true);
      await fetchMetrics(initialMetricType, { forceRefresh: true });
      setLoading(false);
    } catch (err: any) {
      setError({
        code: err.code || 'CACHE_CLEAR_ERROR',
        message: err.message,
        operation: 'clearCache',
        retryCount: 0,
        timestamp: new Date()
      });
      setLoading(false);
    }
  }, [fetchMetrics, initialMetricType]);

  // Set up automatic sync interval
  useEffect(() => {
    if (!syncConfig.autoSync) return;

    const syncInterval = setInterval(() => {
      syncData();
    }, syncConfig.syncInterval);

    return () => clearInterval(syncInterval);
  }, [syncConfig.autoSync, syncConfig.syncInterval, syncData]);

  // Initial data fetch
  useEffect(() => {
    fetchMetrics(initialMetricType);
  }, [fetchMetrics, initialMetricType]);

  return {
    metrics,
    loading,
    error,
    fetchMetrics,
    syncData,
    syncStatus,
    retryFailedSync,
    clearCache,
    lastSync
  };
}

export default useHealth;