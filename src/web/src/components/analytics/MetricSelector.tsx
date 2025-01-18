import React, { useState, useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import { debounce } from 'lodash';
import { Dropdown, DropdownProps } from '../common/Dropdown';
import { HealthMetricType } from '../../types/health.types';
import { useHealth } from '../../hooks/useHealth';
import { ErrorBoundary } from '../common/ErrorBoundary';

// Styled components
const SelectorContainer = styled.div`
  margin: ${({ theme }) => theme.spacing.MEDIUM}px;
  width: 100%;
  max-width: 400px;
  position: relative;
  aria-live: polite;
  aria-atomic: true;
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
`;

// Props interface
interface MetricSelectorProps {
  selectedMetrics: HealthMetricType[];
  onMetricsChange: (metrics: HealthMetricType[]) => void;
  isMulti?: boolean;
  isDisabled?: boolean;
  className?: string;
  maxSelections?: number;
  onError?: (error: Error) => void;
}

// Transform metric type to dropdown option with memoization
const transformMetricToOption = React.memo((metricType: HealthMetricType) => {
  const metricLabels: Record<HealthMetricType, string> = {
    [HealthMetricType.HEART_RATE]: 'Heart Rate (BPM)',
    [HealthMetricType.BLOOD_PRESSURE]: 'Blood Pressure (mmHg)',
    [HealthMetricType.BLOOD_GLUCOSE]: 'Blood Glucose (mg/dL)',
    [HealthMetricType.WEIGHT]: 'Weight (kg)',
    [HealthMetricType.HEIGHT]: 'Height (cm)',
    [HealthMetricType.STEPS]: 'Steps Count',
    [HealthMetricType.SLEEP]: 'Sleep Duration (hours)',
    [HealthMetricType.OXYGEN_SATURATION]: 'Blood Oxygen (%)'
  };

  return {
    value: metricType,
    label: metricLabels[metricType] || metricType,
    'aria-label': `Select ${metricLabels[metricType]}`,
    metadata: {
      type: metricType,
      unit: metricLabels[metricType].match(/\((.*?)\)/)?.[1] || ''
    }
  };
});

const MetricSelector: React.FC<MetricSelectorProps> = ({
  selectedMetrics,
  onMetricsChange,
  isMulti = false,
  isDisabled = false,
  className,
  maxSelections = 5,
  onError
}) => {
  // State and hooks
  const { metrics, loading, error, fetchMetrics } = useHealth();
  const [localError, setLocalError] = useState<string | null>(null);

  // Transform available metrics to dropdown options
  const metricOptions = useMemo(() => 
    Object.values(HealthMetricType).map(transformMetricToOption),
    []
  );

  // Debounced metric update handler
  const handleMetricChange = useCallback(
    debounce((selectedValues: string | string[]) => {
      try {
        const selectedMetricTypes = Array.isArray(selectedValues) 
          ? selectedValues as HealthMetricType[]
          : [selectedValues as HealthMetricType];

        // Validate selection count
        if (isMulti && selectedMetricTypes.length > maxSelections) {
          const error = new Error(`Maximum of ${maxSelections} metrics can be selected`);
          setLocalError(error.message);
          onError?.(error);
          return;
        }

        // Clear any previous errors
        setLocalError(null);
        onMetricsChange(selectedMetricTypes);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update metrics');
        setLocalError(error.message);
        onError?.(error);
      }
    }, 300),
    [onMetricsChange, maxSelections, isMulti, onError]
  );

  // Error handling
  React.useEffect(() => {
    if (error) {
      setLocalError(error.message);
      onError?.(error);
    }
  }, [error, onError]);

  // Cleanup
  React.useEffect(() => {
    return () => {
      handleMetricChange.cancel();
    };
  }, [handleMetricChange]);

  return (
    <ErrorBoundary
      onError={(error) => {
        setLocalError(error.message);
        onError?.(error);
      }}
    >
      <SelectorContainer className={className}>
        <Dropdown
          options={metricOptions}
          value={selectedMetrics}
          onChange={handleMetricChange}
          isMulti={isMulti}
          isDisabled={isDisabled || loading}
          isSearchable
          placeholder="Select health metrics..."
          error={localError}
          aria-label="Health metric selector"
          renderOption={(option) => (
            <div>
              <span>{option.label}</span>
              {option.metadata?.unit && (
                <small style={{ marginLeft: '8px', opacity: 0.7 }}>
                  ({option.metadata.unit})
                </small>
              )}
            </div>
          )}
        />
        {loading && (
          <LoadingOverlay>
            <span role="status">Loading metrics...</span>
          </LoadingOverlay>
        )}
      </SelectorContainer>
    </ErrorBoundary>
  );
};

export default MetricSelector;