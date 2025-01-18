import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useDebounce } from 'use-debounce';
import sanitizeHtml from 'sanitize-html';

import { Input, InputProps } from '../common/Input';
import { HealthMetric, HealthMetricType } from '../../types/health.types';
import { useHealth } from '../../hooks/useHealth';

// Styled components with WCAG 2.1 AAA compliance
const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  position: relative;
  aria-live: polite;
  role: group;
`;

const UnitLabel = styled.span`
  color: ${props => props.theme.colors.text.secondary};
  font-size: ${props => props.theme.typography.fontSizes.small};
  min-width: 40px;
  font-weight: 500;
  aria-label: unit;
`;

const ErrorMessage = styled.div`
  color: ${props => props.theme.colors.error[500]};
  font-size: ${props => props.theme.typography.fontSizes.small};
  margin-top: 4px;
  aria-live: assertive;
  role: alert;
`;

// Props interface with validation and accessibility options
interface HealthMetricInputProps {
  metricType: HealthMetricType;
  value: number;
  unit: string;
  onChange: (metric: Partial<HealthMetric>) => void;
  error?: string;
  disabled?: boolean;
  patientAge?: number;
  convertUnit?: boolean;
  validateFHIR?: boolean;
}

// Metric-specific validation ranges
const VALIDATION_RANGES: Record<HealthMetricType, { min: number; max: number }> = {
  [HealthMetricType.HEART_RATE]: { min: 30, max: 220 },
  [HealthMetricType.BLOOD_PRESSURE]: { min: 60, max: 200 },
  [HealthMetricType.BLOOD_GLUCOSE]: { min: 30, max: 600 },
  [HealthMetricType.WEIGHT]: { min: 0, max: 500 },
  [HealthMetricType.HEIGHT]: { min: 0, max: 300 },
  [HealthMetricType.STEPS]: { min: 0, max: 100000 },
  [HealthMetricType.OXYGEN_SATURATION]: { min: 0, max: 100 }
};

export const HealthMetricInput: React.FC<HealthMetricInputProps> = ({
  metricType,
  value,
  unit,
  onChange,
  error,
  disabled = false,
  patientAge,
  convertUnit = false,
  validateFHIR = true
}) => {
  // Local state for input handling
  const [inputValue, setInputValue] = useState<string>(value?.toString() || '');
  const [localError, setLocalError] = useState<string>('');
  const [debouncedValue] = useDebounce(inputValue, 300);

  // Custom hook for health data management
  const { validateMetric } = useHealth();

  // Validate and format the input value
  const validateInput = useCallback((value: string): boolean => {
    // Sanitize input
    const sanitizedValue = sanitizeHtml(value, {
      allowedTags: [],
      allowedAttributes: {}
    });

    // Basic format validation
    if (!/^\d*\.?\d*$/.test(sanitizedValue)) {
      setLocalError('Please enter a valid number');
      return false;
    }

    const numValue = parseFloat(sanitizedValue);

    // Range validation
    const range = VALIDATION_RANGES[metricType];
    if (range && (numValue < range.min || numValue > range.max)) {
      setLocalError(`Value must be between ${range.min} and ${range.max} ${unit}`);
      return false;
    }

    // Age-specific validation if applicable
    if (patientAge && metricType === HealthMetricType.HEART_RATE) {
      const maxHeartRate = 220 - patientAge;
      if (numValue > maxHeartRate) {
        setLocalError(`Maximum heart rate for age ${patientAge} is ${maxHeartRate} bpm`);
        return false;
      }
    }

    return true;
  }, [metricType, unit, patientAge]);

  // Handle input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    if (validateInput(newValue)) {
      setLocalError('');
      const numValue = parseFloat(newValue);
      
      onChange({
        metricType,
        value: numValue,
        unit,
        effectivePeriod: {
          start: new Date()
        }
      });
    }
  }, [metricType, unit, onChange, validateInput]);

  // Effect for FHIR validation
  useEffect(() => {
    if (validateFHIR && debouncedValue) {
      const numValue = parseFloat(debouncedValue);
      const validationResult = validateMetric({
        metricType,
        value: numValue,
        unit,
        effectivePeriod: {
          start: new Date()
        }
      });

      if (!validationResult.isValid) {
        setLocalError(validationResult.errors[0] || 'Invalid metric value');
      }
    }
  }, [debouncedValue, metricType, unit, validateFHIR, validateMetric]);

  // Input props configuration
  const inputProps: InputProps = {
    id: `health-metric-${metricType}`,
    name: metricType,
    type: 'number',
    value: inputValue,
    onChange: handleInputChange,
    disabled,
    required: true,
    status: (error || localError) ? 'error' : 'default',
    ariaLabel: `Enter ${metricType.replace('_', ' ')} value`,
    ariaDescribedBy: `${metricType}-error`,
    placeholder: `Enter ${metricType.replace('_', ' ')}`
  };

  return (
    <Container>
      <Input {...inputProps} />
      <UnitLabel>{unit}</UnitLabel>
      {(error || localError) && (
        <ErrorMessage id={`${metricType}-error`}>
          {error || localError}
        </ErrorMessage>
      )}
    </Container>
  );
};

export type { HealthMetricInputProps };