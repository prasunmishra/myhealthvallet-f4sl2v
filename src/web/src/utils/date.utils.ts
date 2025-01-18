/**
 * @fileoverview Date utility functions for PHRSAT web application
 * @version 1.0.0
 * 
 * Comprehensive date manipulation, formatting, validation, and timezone handling utilities
 * for health records, metrics, and analytics with enhanced timezone support.
 */

import { format, parseISO, isValid, startOfDay, endOfDay, subDays, subWeeks, subMonths } from 'date-fns'; // version: ^2.30.0
import { HealthMetric } from '../types/health.types';

/**
 * Default date format constants
 */
export const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';
export const DISPLAY_DATE_FORMAT = 'MMM dd, yyyy';
export const TIMESTAMP_FORMAT = 'yyyy-MM-dd HH:mm:ss';
export const ANALYTICS_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ssxxx";
export const APPOINTMENT_DATE_FORMAT = 'EEEE, MMMM d, yyyy h:mm a';
export const METRIC_TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'xxx'";

/**
 * Date validation options interface
 */
export interface DateValidationOptions {
  minDate?: Date;
  maxDate?: Date;
  allowFuture?: boolean;
  allowPast?: boolean;
  required?: boolean;
}

/**
 * Date range period type
 */
export type DateRangePeriod = '1d' | '7d' | '30d' | '90d' | 'custom';

/**
 * Date range interface
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
  timezone: string;
}

/**
 * Formats a date into a consistent string representation with timezone support
 * @param date Date to format
 * @param formatStr Optional format string
 * @param timezone Optional timezone
 * @returns Formatted date string
 */
export const formatDate = (
  date: Date | string,
  formatStr: string = DEFAULT_DATE_FORMAT,
  timezone?: string
): string => {
  try {
    if (!date) {
      return '';
    }

    const dateObj = typeof date === 'string' ? parseISO(date) : date;

    if (!isValid(dateObj)) {
      throw new Error('Invalid date provided');
    }

    // Apply timezone if provided
    if (timezone) {
      const options = { timeZone: timezone };
      return new Intl.DateTimeFormat('en-US', options).format(dateObj);
    }

    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Parses a date string into a Date object with timezone handling
 * @param dateStr Date string to parse
 * @param timezone Optional timezone
 * @returns Parsed Date object
 */
export const parseDate = (dateStr: string, timezone?: string): Date => {
  try {
    if (!dateStr) {
      throw new Error('Date string is required');
    }

    const parsedDate = parseISO(dateStr);

    if (!isValid(parsedDate)) {
      throw new Error('Invalid date string format');
    }

    if (timezone) {
      const tzOffset = new Date().getTimezoneOffset() * 60000;
      return new Date(parsedDate.getTime() + tzOffset);
    }

    return parsedDate;
  } catch (error) {
    console.error('Error parsing date:', error);
    return new Date();
  }
};

/**
 * Validates dates with enhanced rules for health records
 * @param date Date to validate
 * @param options Validation options
 * @returns Boolean indicating validity
 */
export const isValidDate = (
  date: Date | string,
  options: DateValidationOptions = {}
): boolean => {
  try {
    if (!date && options.required) {
      return false;
    }

    const dateObj = typeof date === 'string' ? parseISO(date) : date;

    if (!isValid(dateObj)) {
      return false;
    }

    const now = new Date();

    if (options.minDate && dateObj < options.minDate) {
      return false;
    }

    if (options.maxDate && dateObj > options.maxDate) {
      return false;
    }

    if (!options.allowFuture && dateObj > now) {
      return false;
    }

    if (!options.allowPast && dateObj < now) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating date:', error);
    return false;
  }
};

/**
 * Calculates date ranges for analytics with timezone support
 * @param period Date range period or custom range
 * @param timezone Optional timezone
 * @returns DateRange object
 */
export const getDateRange = (
  period: DateRangePeriod | { start: Date; end: Date },
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): DateRange => {
  try {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = endOfDay(now);

    if (typeof period === 'object') {
      startDate = startOfDay(period.start);
      endDate = endOfDay(period.end);
    } else {
      switch (period) {
        case '1d':
          startDate = startOfDay(subDays(now, 1));
          break;
        case '7d':
          startDate = startOfDay(subWeeks(now, 1));
          break;
        case '30d':
          startDate = startOfDay(subMonths(now, 1));
          break;
        case '90d':
          startDate = startOfDay(subMonths(now, 3));
          break;
        default:
          startDate = startOfDay(subDays(now, 7)); // Default to 7 days
      }
    }

    return {
      startDate,
      endDate,
      timezone
    };
  } catch (error) {
    console.error('Error calculating date range:', error);
    const now = new Date();
    return {
      startDate: startOfDay(subDays(now, 7)),
      endDate: endOfDay(now),
      timezone
    };
  }
};

/**
 * Formats a health metric timestamp
 * @param metric HealthMetric object
 * @returns Formatted timestamp string
 */
export const formatMetricTimestamp = (metric: HealthMetric): string => {
  return formatDate(metric.effectivePeriod.start, METRIC_TIMESTAMP_FORMAT);
};

/**
 * Checks if a date is within a specified range
 * @param date Date to check
 * @param range DateRange object
 * @returns Boolean indicating if date is within range
 */
export const isDateInRange = (date: Date | string, range: DateRange): boolean => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return dateObj >= range.startDate && dateObj <= range.endDate;
};

/**
 * Gets the start of the current day in the specified timezone
 * @param timezone Optional timezone
 * @returns Date object for start of day
 */
export const getStartOfDay = (timezone?: string): Date => {
  const now = new Date();
  if (timezone) {
    const options = { timeZone: timezone };
    const tzDate = new Intl.DateTimeFormat('en-US', options).format(now);
    return startOfDay(parseISO(tzDate));
  }
  return startOfDay(now);
};

/**
 * Gets the end of the current day in the specified timezone
 * @param timezone Optional timezone
 * @returns Date object for end of day
 */
export const getEndOfDay = (timezone?: string): Date => {
  const now = new Date();
  if (timezone) {
    const options = { timeZone: timezone };
    const tzDate = new Intl.DateTimeFormat('en-US', options).format(now);
    return endOfDay(parseISO(tzDate));
  }
  return endOfDay(now);
};