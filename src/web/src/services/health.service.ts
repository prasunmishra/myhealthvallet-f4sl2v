/**
 * @fileoverview Enhanced Health Service Implementation
 * @version 1.0.0
 * 
 * Provides comprehensive health data management with:
 * - FHIR R4 compliant CRUD operations
 * - Multi-platform health data synchronization
 * - Advanced data validation and transformation
 * - Robust error handling and retry mechanisms
 */

import { injectable, inject } from 'inversify'; // version: ^6.0.1
import { fhir } from '@types/fhir'; // version: 4.0.0
import { ApiService } from './api.service';
import { 
  HealthMetric, 
  HealthPlatform, 
  SyncStatus,
  ValidationError,
  RetryConfig
} from '../types/health.types';
import { validateHealthMetric } from '../utils/health.utils';
import { formatMetricTimestamp } from '../utils/date.utils';
import { 
  HEALTH_PLATFORMS, 
  HEALTH_METRIC_TYPES,
  SYNC_INTERVALS,
  MAX_SYNC_RETRIES 
} from '../constants/health.constants';

/**
 * Cache configuration interface
 */
interface CacheConfig {
  ttl: number;
  maxSize: number;
}

/**
 * Platform sync configuration interface
 */
interface PlatformConfig {
  platform: HealthPlatform;
  credentials: Record<string, string>;
  syncOptions?: {
    startDate?: Date;
    endDate?: Date;
    metrics?: HEALTH_METRIC_TYPES[];
  };
}

/**
 * Enhanced Health Service with FHIR support and multi-platform integration
 */
@injectable()
export class HealthService {
  private readonly baseUrl: string;
  private readonly metricCache: Map<string, { data: HealthMetric; timestamp: number }>;
  private readonly syncStatus: Map<HealthPlatform, SyncStatus>;
  private readonly retryConfigs: Map<HealthPlatform, RetryConfig>;

  constructor(
    @inject('ApiService') private readonly apiService: ApiService,
    @inject('CacheConfig') private readonly cacheConfig: CacheConfig,
    @inject('RetryConfig') private readonly defaultRetryConfig: RetryConfig
  ) {
    this.baseUrl = '/api/v1/health';
    this.metricCache = new Map();
    this.syncStatus = new Map();
    this.retryConfigs = new Map();
    this.initializeRetryConfigs();
  }

  /**
   * Initialize platform-specific retry configurations
   */
  private initializeRetryConfigs(): void {
    Object.values(HEALTH_PLATFORMS).forEach(platform => {
      this.retryConfigs.set(platform, {
        maxAttempts: MAX_SYNC_RETRIES,
        backoffStrategy: 'exponential',
        intervalMs: SYNC_INTERVALS[platform]?.retry_delay || this.defaultRetryConfig.intervalMs
      });
    });
  }

  /**
   * Retrieves health metrics with caching and FHIR validation
   */
  public async getHealthMetrics(
    filters?: {
      types?: HEALTH_METRIC_TYPES[];
      startDate?: Date;
      endDate?: Date;
      source?: HealthPlatform;
    }
  ): Promise<HealthMetric[]> {
    try {
      const cacheKey = this.generateCacheKey(filters);
      const cached = this.metricCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheConfig.ttl) {
        return [cached.data];
      }

      const response = await this.apiService.get<HealthMetric[]>(
        `${this.baseUrl}/metrics`,
        { params: filters }
      );

      const validatedMetrics = await Promise.all(
        response.data.map(async metric => {
          const validation = await validateHealthMetric(metric);
          if (!validation.isValid) {
            console.error('Metric validation failed:', validation.errors);
            throw new Error(`Invalid metric data: ${validation.errors.join(', ')}`);
          }
          return this.transformToFHIR(metric);
        })
      );

      validatedMetrics.forEach(metric => {
        this.updateCache(metric);
      });

      return validatedMetrics;
    } catch (error) {
      console.error('Error fetching health metrics:', error);
      throw error;
    }
  }

  /**
   * Synchronizes health data with external platforms
   */
  public async syncHealthPlatform(
    config: PlatformConfig
  ): Promise<{ status: SyncStatus; errors?: ValidationError[] }> {
    try {
      this.syncStatus.set(config.platform, SyncStatus.IN_PROGRESS);

      const platformConfig = SYNC_INTERVALS[config.platform];
      if (!platformConfig) {
        throw new Error(`Unsupported platform: ${config.platform}`);
      }

      const response = await this.apiService.post(
        `${this.baseUrl}/sync/${config.platform}`,
        {
          credentials: config.credentials,
          options: config.syncOptions,
          batchSize: platformConfig.batch_size
        }
      );

      if (response.data.status === SyncStatus.COMPLETED) {
        this.syncStatus.set(config.platform, SyncStatus.COMPLETED);
        return { status: SyncStatus.COMPLETED };
      }

      return this.handleSyncRetry(config);
    } catch (error) {
      console.error(`Error syncing with ${config.platform}:`, error);
      this.syncStatus.set(config.platform, SyncStatus.FAILED);
      throw error;
    }
  }

  /**
   * Batch processes multiple health metrics
   */
  public async batchProcessMetrics(
    metrics: HealthMetric[]
  ): Promise<{ processed: HealthMetric[]; failed: ValidationError[] }> {
    try {
      const results = {
        processed: [] as HealthMetric[],
        failed: [] as ValidationError[]
      };

      const validationPromises = metrics.map(async metric => {
        const validation = await validateHealthMetric(metric);
        if (validation.isValid) {
          const fhirMetric = this.transformToFHIR(metric);
          results.processed.push(fhirMetric);
        } else {
          results.failed.push({
            code: 'VALIDATION_ERROR',
            message: validation.errors.join(', '),
            field: 'metric',
            details: metric
          });
        }
      });

      await Promise.all(validationPromises);

      if (results.processed.length > 0) {
        await this.apiService.batchProcess(
          `${this.baseUrl}/metrics/batch`,
          results.processed
        );
      }

      return results;
    } catch (error) {
      console.error('Error in batch processing:', error);
      throw error;
    }
  }

  /**
   * Transforms health metric to FHIR format
   */
  private transformToFHIR(metric: HealthMetric): HealthMetric {
    const fhirResource: fhir.Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: this.getLoincCode(metric.metricType),
          display: metric.metricType
        }]
      },
      valueQuantity: {
        value: metric.value,
        unit: metric.unit,
        system: 'http://unitsofmeasure.org',
        code: metric.unit
      },
      effectiveDateTime: formatMetricTimestamp(metric),
      device: {
        reference: `Device/${metric.source}`
      }
    };

    return {
      ...metric,
      fhirResource
    };
  }

  /**
   * Handles retry logic for platform synchronization
   */
  private async handleSyncRetry(
    config: PlatformConfig,
    attempt: number = 1
  ): Promise<{ status: SyncStatus; errors?: ValidationError[] }> {
    const retryConfig = this.retryConfigs.get(config.platform) || this.defaultRetryConfig;

    if (attempt >= retryConfig.maxAttempts) {
      this.syncStatus.set(config.platform, SyncStatus.FAILED);
      return {
        status: SyncStatus.FAILED,
        errors: [{
          code: 'SYNC_FAILED',
          message: `Sync failed after ${attempt} attempts`,
          details: { platform: config.platform }
        }]
      };
    }

    const delay = retryConfig.backoffStrategy === 'exponential'
      ? retryConfig.intervalMs * Math.pow(2, attempt - 1)
      : retryConfig.intervalMs;

    await new Promise(resolve => setTimeout(resolve, delay));
    return this.syncHealthPlatform(config);
  }

  /**
   * Generates cache key for health metrics
   */
  private generateCacheKey(filters?: any): string {
    return filters ? JSON.stringify(filters) : 'all_metrics';
  }

  /**
   * Updates metric cache with new data
   */
  private updateCache(metric: HealthMetric): void {
    const cacheKey = this.generateCacheKey({ id: metric.id });
    this.metricCache.set(cacheKey, {
      data: metric,
      timestamp: Date.now()
    });

    if (this.metricCache.size > this.cacheConfig.maxSize) {
      const oldestKey = Array.from(this.metricCache.keys())[0];
      this.metricCache.delete(oldestKey);
    }
  }

  /**
   * Maps health metric types to LOINC codes
   */
  private getLoincCode(metricType: HEALTH_METRIC_TYPES): string {
    const loincMap: Record<HEALTH_METRIC_TYPES, string> = {
      [HEALTH_METRIC_TYPES.HEART_RATE]: '8867-4',
      [HEALTH_METRIC_TYPES.BLOOD_PRESSURE]: '85354-9',
      [HEALTH_METRIC_TYPES.BLOOD_GLUCOSE]: '2339-0',
      [HEALTH_METRIC_TYPES.WEIGHT]: '29463-7',
      [HEALTH_METRIC_TYPES.HEIGHT]: '8302-2',
      [HEALTH_METRIC_TYPES.STEPS]: '41950-7',
      [HEALTH_METRIC_TYPES.SLEEP]: '93832-4'
    };
    return loincMap[metricType] || '0';
  }
}

export default HealthService;