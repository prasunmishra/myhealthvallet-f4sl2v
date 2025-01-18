/**
 * @fileoverview API Configuration for PHRSAT Web Application
 * @version 1.0.0
 * 
 * Centralized configuration for API settings including:
 * - Environment-specific configurations
 * - Timeout and retry policies
 * - Security settings
 * - Error handling
 */

import { API_ROUTES } from '../constants/api.constants';
import { StatusCodes } from 'http-status-codes'; // version: ^2.2.0

/**
 * Environment type definition
 */
type Environment = 'development' | 'staging' | 'production';

/**
 * Current environment
 */
const CURRENT_ENV = (process.env.REACT_APP_ENV || 'development') as Environment;

/**
 * API Configuration object
 */
export const API_CONFIG = {
  /**
   * Base configuration
   */
  BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
  API_VERSION: 'v1',
  
  /**
   * Environment-specific configurations
   */
  ENVIRONMENTS: {
    development: {
      baseUrl: 'http://localhost:8000',
      timeout: 30000,
      enableLogging: true,
      retryAttempts: 3,
      wsUrl: 'ws://localhost:8000'
    },
    staging: {
      baseUrl: 'https://api-staging.phrsat.com',
      timeout: 20000,
      enableLogging: true,
      retryAttempts: 3,
      wsUrl: 'wss://api-staging.phrsat.com'
    },
    production: {
      baseUrl: 'https://api.phrsat.com',
      timeout: 15000,
      enableLogging: false,
      retryAttempts: 2,
      wsUrl: 'wss://api.phrsat.com'
    }
  },

  /**
   * Route-specific timeout configurations (in milliseconds)
   */
  TIMEOUT: {
    default: 15000,
    upload: 60000, // Extended timeout for document uploads
    analytics: 45000, // Extended for complex analytics operations
    health: 10000,
    auth: 10000
  },

  /**
   * Retry policy configuration
   */
  RETRY_POLICY: {
    attempts: 3,
    backoffFactor: 2,
    initialDelay: 1000,
    maxDelay: 10000,
    retryableStatuses: [
      StatusCodes.REQUEST_TIMEOUT,
      StatusCodes.TOO_MANY_REQUESTS,
      StatusCodes.INTERNAL_SERVER_ERROR,
      StatusCodes.BAD_GATEWAY,
      StatusCodes.SERVICE_UNAVAILABLE,
      StatusCodes.GATEWAY_TIMEOUT
    ]
  },

  /**
   * API Routes configuration
   */
  ROUTES: {
    ...API_ROUTES,
    HEALTH_CHECK: '/health',
    METRICS: '/metrics'
  },

  /**
   * Security configuration
   */
  SECURITY: {
    headers: {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; script-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    },
    rateLimit: {
      maxRequests: 1000,
      windowMs: 3600000, // 1 hour
      errorMessage: 'Too many requests, please try again later'
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitorInterval: 10000
    },
    jwt: {
      headerName: 'Authorization',
      scheme: 'Bearer',
      refreshThreshold: 300 // Refresh token if expiring within 5 minutes
    }
  },

  /**
   * Error handling configuration
   */
  ERROR_HANDLING: {
    defaultMessage: 'An unexpected error occurred',
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'],
    errorMapping: {
      [StatusCodes.BAD_REQUEST]: 'Invalid request parameters',
      [StatusCodes.UNAUTHORIZED]: 'Authentication required',
      [StatusCodes.FORBIDDEN]: 'Access denied',
      [StatusCodes.NOT_FOUND]: 'Resource not found',
      [StatusCodes.TOO_MANY_REQUESTS]: 'Rate limit exceeded',
      [StatusCodes.INTERNAL_SERVER_ERROR]: 'Internal server error',
      [StatusCodes.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable'
    },
    logging: {
      enabled: CURRENT_ENV !== 'production',
      level: CURRENT_ENV === 'development' ? 'debug' : 'error',
      sanitize: true // Remove sensitive data before logging
    }
  },

  /**
   * Returns environment-specific configuration
   */
  getEnvironmentConfig: () => API_CONFIG.ENVIRONMENTS[CURRENT_ENV],

  /**
   * Returns timeout for specific route type
   */
  getTimeout: (routeType: keyof typeof API_CONFIG.TIMEOUT) => 
    API_CONFIG.TIMEOUT[routeType] || API_CONFIG.TIMEOUT.default,

  /**
   * Builds full API URL for given path
   */
  buildUrl: (path: string): string => {
    const envConfig = API_CONFIG.getEnvironmentConfig();
    return `${envConfig.baseUrl}/api/${API_CONFIG.API_VERSION}${path}`;
  }
} as const;

/**
 * Type definitions for API configuration
 */
export type APIConfigType = typeof API_CONFIG;
export type APITimeoutTypes = keyof typeof API_CONFIG.TIMEOUT;
export type APIEnvironmentType = keyof typeof API_CONFIG.ENVIRONMENTS;

export default API_CONFIG;