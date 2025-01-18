/**
 * Redux selectors for health data management with FHIR compliance validation
 * Implements memoized selectors for accessing health metrics, records, and platform sync status
 * @version 1.0.0
 */

import { createSelector } from 'reselect'; // version: ^4.1.8
import { FHIRValidator } from '@fhir/validator'; // version: ^2.0.0
import { RootState } from '../rootReducer';
import { HealthState } from './health.types';
import { HealthMetricType, HealthPlatform } from '../../types/health.types';

/**
 * Base selector to access health state slice
 */
export const selectHealthState = (state: RootState): HealthState => state.health;

/**
 * Memoized selector for health metrics with FHIR validation
 * Returns validated metrics with compliance status
 */
export const selectHealthMetricsWithValidation = createSelector(
  [selectHealthState],
  (healthState): HealthState['metrics'] => {
    const validator = new FHIRValidator();
    
    return healthState.metrics.map(metric => {
      const validationResult = validator.validateResource({
        resourceType: 'Observation',
        status: 'final',
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: metric.metricType,
            display: HealthMetricType[metric.metricType]
          }]
        },
        valueQuantity: {
          value: metric.value,
          unit: metric.unit,
          system: 'http://unitsofmeasure.org'
        },
        effectiveDateTime: metric.effectivePeriod.start.toISOString()
      });

      return {
        ...metric,
        validationStatus: validationResult.isValid ? 'valid' : 'invalid',
        validationErrors: validationResult.errors,
        fhirCompliant: validationResult.isValid
      };
    });
  }
);

/**
 * Memoized selector for health records with FHIR validation
 * Returns validated records with compliance status
 */
export const selectHealthRecordsWithValidation = createSelector(
  [selectHealthState],
  (healthState): HealthState['records'] => {
    const validator = new FHIRValidator();
    
    return healthState.records.map(record => {
      const validationResult = validator.validateResource({
        resourceType: 'DocumentReference',
        status: record.status,
        type: {
          coding: [{
            system: 'http://hl7.org/fhir/document-type',
            code: record.recordType
          }]
        },
        subject: record.subject,
        date: record.recordDate.toISOString(),
        content: [{
          attachment: {
            url: record.storageUrl,
            contentType: record.metadata.mimeType
          }
        }]
      });

      return {
        ...record,
        validationStatus: validationResult.isValid ? 'valid' : 'invalid',
        validationErrors: validationResult.errors,
        fhirCompliant: validationResult.isValid
      };
    });
  }
);

/**
 * Memoized selector for platform sync status
 * Returns sync status for each connected health platform
 */
export const selectPlatformSyncStatus = createSelector(
  [selectHealthState],
  (healthState) => healthState.platformSync
);

/**
 * Memoized selector for FHIR validation status
 * Returns current validation state and any validation errors
 */
export const selectFHIRValidationStatus = createSelector(
  [selectHealthState],
  (healthState) => healthState.fhirValidation
);

/**
 * Memoized selector for filtered health metrics
 * Returns metrics filtered by type, date range, and platform
 */
export const selectFilteredHealthMetrics = createSelector(
  [selectHealthState, (state: RootState, filters: HealthState['metricFilters']) => filters],
  (healthState, filters) => {
    return healthState.metrics.filter(metric => {
      const matchesType = !filters.metricTypes?.length || 
        filters.metricTypes.includes(metric.metricType);
      
      const matchesPlatform = !filters.platforms?.length || 
        filters.platforms.includes(metric.source);
      
      const matchesDateRange = !filters.dateRange ||
        (metric.effectivePeriod.start >= filters.dateRange.start &&
         (!metric.effectivePeriod.end || metric.effectivePeriod.end <= filters.dateRange.end));

      return matchesType && matchesPlatform && matchesDateRange;
    });
  }
);

/**
 * Memoized selector for unsynced platforms
 * Returns platforms that require synchronization
 */
export const selectUnsyncedPlatforms = createSelector(
  [selectPlatformSyncStatus],
  (platformSync): HealthPlatform[] => {
    return Object.entries(platformSync)
      .filter(([_, status]) => status.status === 'pending' || status.status === 'failed')
      .map(([platform]) => platform as HealthPlatform);
  }
);

/**
 * Memoized selector for validation errors
 * Returns all FHIR validation errors across metrics and records
 */
export const selectValidationErrors = createSelector(
  [selectHealthState],
  (healthState) => {
    return {
      metricErrors: healthState.metrics
        .filter(m => m.validationErrors?.length)
        .map(m => ({
          id: m.id,
          type: m.metricType,
          errors: m.validationErrors
        })),
      recordErrors: healthState.records
        .filter(r => r.validationErrors?.length)
        .map(r => ({
          id: r.id,
          type: r.recordType,
          errors: r.validationErrors
        }))
    };
  }
);