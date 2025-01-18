/**
 * Enhanced DatePicker component for health record management
 * Implements WCAG 2.1 AAA compliance with timezone support
 * @version 1.0.0
 */

import React, { useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import DatePickerBase from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css"; // version: ^4.16.0
import { Theme } from '../../styles/theme';
import { formatDate, parseDate, isValidDate, validateDateRange } from '../../utils/date.utils';

/**
 * Validation context interface for date selection
 */
interface ValidationContext {
  isValid: boolean;
  message?: string;
  details?: Record<string, any>;
}

/**
 * Date validation options interface
 */
interface DateValidationOptions {
  minDate?: Date;
  maxDate?: Date;
  allowFuture?: boolean;
  allowPast?: boolean;
  required?: boolean;
  customValidation?: (date: Date) => ValidationContext;
}

/**
 * Enhanced DatePicker props interface
 */
export interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date | null, context: ValidationContext) => void;
  minDate?: Date;
  maxDate?: Date;
  timezone?: string;
  validationOptions?: DateValidationOptions;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
}

/**
 * Styled DatePicker component with theme support
 */
const StyledDatePicker = styled(DatePickerBase)<{ error?: string; theme: Theme }>`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  border: 1px solid ${({ theme, error }) => 
    error ? theme.colors.error[500] : theme.colors.surface[300]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  color: ${({ theme }) => theme.colors.text[500]};
  transition: all ${({ theme }) => theme.transitions.duration.short}ms 
    ${({ theme }) => theme.transitions.easing.easeInOut};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary[400]};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary[200]};
  }

  &:disabled {
    background-color: ${({ theme }) => theme.colors.surface[200]};
    cursor: not-allowed;
    opacity: 0.7;
  }

  @media (prefers-color-scheme: dark) {
    background-color: ${({ theme }) => theme.colors.surface[800]};
    color: ${({ theme }) => theme.colors.text[100]};
    border-color: ${({ theme, error }) => 
      error ? theme.colors.error[500] : theme.colors.surface[600]};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    font-size: ${({ theme }) => theme.typography.fontSizes.small};
  }
`;

/**
 * Styled error message component
 */
const ErrorText = styled.div<{ theme: Theme }>`
  color: ${({ theme }) => theme.colors.error[500]};
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  margin-top: ${({ theme }) => theme.spacing.BASE}px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.BASE}px;

  &::before {
    content: "⚠️";
    font-size: 1em;
  }
`;

/**
 * Enhanced DatePicker component with validation and accessibility
 */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  minDate,
  maxDate,
  timezone,
  validationOptions = {},
  placeholder = 'Select date',
  error,
  disabled = false,
  required = false,
  ariaLabel,
}) => {
  /**
   * Validates date selection with enhanced rules
   */
  const validateSelection = useCallback((date: Date | null): ValidationContext => {
    if (!date && required) {
      return { isValid: false, message: 'Date is required' };
    }

    if (!date) {
      return { isValid: true };
    }

    const isDateValid = isValidDate(date, {
      minDate: validationOptions.minDate || minDate,
      maxDate: validationOptions.maxDate || maxDate,
      allowFuture: validationOptions.allowFuture,
      allowPast: validationOptions.allowPast,
      required
    });

    if (!isDateValid) {
      return {
        isValid: false,
        message: 'Selected date is invalid',
        details: { date, validationOptions }
      };
    }

    // Custom validation if provided
    if (validationOptions.customValidation) {
      return validationOptions.customValidation(date);
    }

    return { isValid: true };
  }, [minDate, maxDate, required, validationOptions]);

  /**
   * Handles date change with validation
   */
  const handleDateChange = useCallback((date: Date | null) => {
    const validationContext = validateSelection(date);
    
    // Apply timezone if provided
    const adjustedDate = date && timezone ? 
      new Date(date.toLocaleString('en-US', { timeZone: timezone })) : 
      date;

    onChange(adjustedDate, validationContext);
  }, [onChange, validateSelection, timezone]);

  /**
   * Memoized date formatter
   */
  const formatDateValue = useMemo(() => {
    if (!value) return '';
    return formatDate(value, 'MMMM d, yyyy', timezone);
  }, [value, timezone]);

  return (
    <div role="group" aria-labelledby={ariaLabel}>
      <StyledDatePicker
        selected={value}
        onChange={handleDateChange}
        minDate={minDate}
        maxDate={maxDate}
        placeholderText={placeholder}
        disabled={disabled}
        dateFormat="MMMM d, yyyy"
        showPopperArrow={true}
        aria-label={ariaLabel || 'Date picker'}
        aria-required={required}
        aria-invalid={!!error}
        calendarStartDay={1}
        formatWeekDay={day => day.substr(0, 3)}
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        error={error}
        isClearable={!required}
        autoComplete="off"
        value={formatDateValue}
      />
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </div>
  );
};

export type { ValidationContext, DateValidationOptions };