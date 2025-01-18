/**
 * @fileoverview Enhanced API utility functions for PHRSAT Web Application
 * @version 1.0.0
 * 
 * Provides comprehensive API communication utilities including:
 * - Secure request creation with enhanced headers
 * - Advanced error handling with correlation tracking
 * - Circuit breaker pattern implementation
 * - gRPC support with fallback mechanisms
 * - Retry logic with exponential backoff
 */

import axios, { AxiosInstance, AxiosError } from 'axios'; // version: ^1.4.0
import { credentials, ServiceError } from '@grpc/grpc-js'; // version: ^1.8.0
import { v4 as uuidv4 } from 'uuid'; // version: ^9.0.0

import { API_CONFIG } from '../config/api.config';
import { 
  ApiResponse, 
  ApiError, 
  ApiRequestConfig, 
  ApiStatus, 
  ApiErrorCode,
  HttpMethod
} from '../types/api.types';

/**
 * Circuit breaker state interface
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Retry configuration interface
 */
interface RetryConfig {
  attempts: number;
  backoffFactor: number;
  initialDelay: number;
}

// Initialize circuit breaker state
const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false
};

/**
 * Creates an enhanced API request instance with security features and gRPC support
 * @param config API request configuration
 * @returns Configured Axios instance
 */
export const createApiRequest = (config: ApiRequestConfig): AxiosInstance => {
  const correlationId = uuidv4();
  
  // Create base axios instance
  const instance = axios.create({
    baseURL: `${API_CONFIG.BASE_URL}/api/${API_CONFIG.API_VERSION}`,
    timeout: config.timeout || API_CONFIG.TIMEOUT.default,
    withCredentials: true,
    headers: {
      ...API_CONFIG.SECURITY.headers,
      'X-Correlation-ID': correlationId,
      'X-API-Version': API_CONFIG.API_VERSION,
      'X-Client-ID': uuidv4(),
      ...config.headers
    }
  });

  // Request interceptor for authentication and security
  instance.interceptors.request.use(
    async (request) => {
      // Check circuit breaker
      if (circuitBreaker.isOpen) {
        const now = Date.now();
        if (now - circuitBreaker.lastFailure >= API_CONFIG.SECURITY.circuitBreaker.resetTimeout) {
          circuitBreaker.isOpen = false;
          circuitBreaker.failures = 0;
        } else {
          throw new Error('Circuit breaker is open');
        }
      }

      // Add CSRF token if available
      const csrfToken = document.cookie.match('(^|;)\\s*csrf-token\\s*=\\s*([^;]+)');
      if (csrfToken) {
        request.headers['X-CSRF-Token'] = csrfToken[2];
      }

      return request;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling and correlation tracking
  instance.interceptors.response.use(
    (response) => {
      // Reset circuit breaker on successful response
      circuitBreaker.failures = 0;
      circuitBreaker.isOpen = false;

      return {
        ...response,
        correlationId
      };
    },
    async (error) => {
      return handleApiError(error, correlationId);
    }
  );

  return instance;
};

/**
 * Enhanced error handler with correlation tracking and gRPC support
 * @param error API error object
 * @param correlationId Request correlation ID
 * @returns Standardized error object
 */
export const handleApiError = async (
  error: AxiosError | ServiceError,
  correlationId: string
): Promise<ApiError> => {
  // Update circuit breaker state
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= API_CONFIG.SECURITY.circuitBreaker.failureThreshold) {
    circuitBreaker.isOpen = true;
  }

  let standardError: ApiError = {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    details: {},
    correlationId,
    timestamp: Date.now(),
    path: '',
    retryable: false
  };

  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 500;
    standardError = {
      code: mapStatusToErrorCode(status),
      message: error.response?.data?.message || API_CONFIG.ERROR_HANDLING.defaultMessage,
      details: error.response?.data || {},
      correlationId,
      timestamp: Date.now(),
      path: error.config?.url || '',
      retryable: isRetryableError(status),
      stack: error.stack
    };
  } else if (error instanceof ServiceError) {
    standardError = {
      code: mapGrpcErrorCode(error.code),
      message: error.details || API_CONFIG.ERROR_HANDLING.defaultMessage,
      details: { grpcCode: error.code },
      correlationId,
      timestamp: Date.now(),
      path: error.metadata.get('path')?.[0] || '',
      retryable: isRetryableGrpcError(error.code),
      stack: error.stack
    };
  }

  // Log error if enabled
  if (API_CONFIG.ERROR_HANDLING.logging.enabled) {
    console.error(`API Error [${correlationId}]:`, standardError);
  }

  return standardError;
};

/**
 * Maps HTTP status codes to API error codes
 * @param status HTTP status code
 * @returns API error code
 */
const mapStatusToErrorCode = (status: number): ApiErrorCode => {
  const statusMap: Record<number, ApiErrorCode> = {
    [ApiStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [ApiStatus.FORBIDDEN]: 'FORBIDDEN',
    [ApiStatus.NOT_FOUND]: 'NOT_FOUND',
    [ApiStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    [ApiStatus.SERVER_ERROR]: 'INTERNAL_ERROR',
    [ApiStatus.SERVICE_UNAVAILABLE]: 'UNAVAILABLE'
  };
  return statusMap[status] || 'INTERNAL_ERROR';
};

/**
 * Maps gRPC error codes to API error codes
 * @param grpcCode gRPC error code
 * @returns API error code
 */
const mapGrpcErrorCode = (grpcCode: number): ApiErrorCode => {
  const grpcMap: Record<number, ApiErrorCode> = {
    1: 'CANCELLED',
    3: 'VALIDATION_ERROR',
    4: 'DEADLINE_EXCEEDED',
    5: 'NOT_FOUND',
    6: 'ALREADY_EXISTS',
    7: 'FORBIDDEN',
    8: 'RESOURCE_EXHAUSTED',
    9: 'FAILED_PRECONDITION',
    10: 'ABORTED',
    11: 'OUT_OF_RANGE',
    12: 'UNIMPLEMENTED',
    13: 'INTERNAL_ERROR',
    14: 'UNAVAILABLE',
    15: 'DATA_LOSS',
    16: 'UNAUTHORIZED'
  };
  return grpcMap[grpcCode] || 'INTERNAL_ERROR';
};

/**
 * Determines if an error is retryable based on status code
 * @param status HTTP status code
 * @returns boolean indicating if error is retryable
 */
const isRetryableError = (status: number): boolean => {
  return API_CONFIG.RETRY_POLICY.retryableStatuses.includes(status);
};

/**
 * Determines if a gRPC error is retryable
 * @param code gRPC error code
 * @returns boolean indicating if error is retryable
 */
const isRetryableGrpcError = (code: number): boolean => {
  const retryableCodes = [4, 8, 10, 13, 14]; // Deadline exceeded, exhausted, aborted, internal, unavailable
  return retryableCodes.includes(code);
};

/**
 * Creates a gRPC client with fallback to HTTP
 * @param config API request configuration
 * @returns gRPC client instance
 */
export const createGrpcClient = (config: ApiRequestConfig) => {
  return {
    client: new credentials.createInsecure(),
    fallback: createApiRequest(config)
  };
};

/**
 * Implements exponential backoff for retries
 * @param attempt Current attempt number
 * @param config Retry configuration
 * @returns Delay in milliseconds
 */
export const calculateBackoff = (
  attempt: number,
  config: RetryConfig = API_CONFIG.RETRY_POLICY
): number => {
  return Math.min(
    config.initialDelay * Math.pow(config.backoffFactor, attempt),
    API_CONFIG.RETRY_POLICY.maxDelay
  );
};