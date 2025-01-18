/**
 * @fileoverview API Constants for PHRSAT Web Application
 * @version 1.0.0
 * 
 * Centralized constants for API configuration including:
 * - API endpoints and versioning
 * - HTTP methods
 * - Route definitions
 * - Security settings
 * - WebSocket endpoints
 */

/**
 * Current API version identifier
 */
export const API_VERSION = 'v1';

/**
 * Enum for supported HTTP methods
 */
export enum HTTP_METHODS {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH'
}

/**
 * HTTP status codes used across the application
 */
export enum HTTP_STATUS {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  TOO_MANY_REQUESTS = 429,
  SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

/**
 * API route definitions with versioning
 */
export const API_ROUTES = {
  BASE_URL: `/api/${API_VERSION}`,
  
  AUTH: {
    LOGIN: '/auth/login',
    SIGNUP: '/auth/signup',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    VERIFY_MFA: '/auth/verify-mfa',
    RESET_PASSWORD: '/auth/reset-password',
    BIOMETRIC: '/auth/biometric'
  },

  HEALTH: {
    METRICS: '/health/metrics',
    SYNC: '/health/sync',
    APPOINTMENTS: '/health/appointments',
    PLATFORMS: '/health/platforms',
    TRENDS: '/health/trends',
    DEVICES: '/health/devices'
  },

  DOCUMENTS: {
    UPLOAD: '/documents/upload',
    LIST: '/documents',
    DETAIL: '/documents/:id',
    DELETE: '/documents/:id',
    SHARE: '/documents/:id/share',
    TAGS: '/documents/tags',
    OCR: '/documents/:id/ocr',
    CLASSIFY: '/documents/:id/classify'
  },

  ANALYTICS: {
    INSIGHTS: '/analytics/insights',
    TRENDS: '/analytics/trends',
    PREDICTIONS: '/analytics/predictions',
    REPORTS: '/analytics/reports',
    EXPORT: '/analytics/export',
    ML_MODELS: '/analytics/models'
  },

  INTEGRATION: {
    GOOGLE_FIT: '/integration/google-fit',
    APPLE_HEALTH: '/integration/apple-health',
    SYNC_STATUS: '/integration/sync-status',
    DISCONNECT: '/integration/disconnect',
    WEARABLES: '/integration/wearables'
  }
} as const;

/**
 * WebSocket endpoint definitions
 */
export const WEBSOCKET_ROUTES = {
  HEALTH_METRICS: '/ws/health-metrics',
  NOTIFICATIONS: '/ws/notifications',
  DEVICE_SYNC: '/ws/device-sync',
  ANALYSIS_STATUS: '/ws/analysis-status'
} as const;

/**
 * API security configuration constants
 */
export const API_SECURITY = {
  RATE_LIMITS: {
    DEFAULT: 1000,
    AUTH: 100,
    DOCUMENTS: 500,
    ANALYTICS: 300
  },

  CORS: {
    ALLOWED_ORIGINS: [process.env.ALLOWED_ORIGINS],
    ALLOWED_METHODS: [
      HTTP_METHODS.GET,
      HTTP_METHODS.POST,
      HTTP_METHODS.PUT,
      HTTP_METHODS.DELETE
    ],
    MAX_AGE: 7200
  },

  CSRF: {
    HEADER_NAME: 'X-CSRF-Token',
    COOKIE_NAME: 'csrf-token',
    EXPIRY: 3600
  }
} as const;

/**
 * Type definitions for API routes to ensure type safety
 */
export type APIRouteKeys = keyof typeof API_ROUTES;
export type WebSocketRouteKeys = keyof typeof WEBSOCKET_ROUTES;
export type APISecurityKeys = keyof typeof API_SECURITY;

/**
 * Helper function to build full API URLs
 */
export const buildApiUrl = (path: string): string => {
  return `${API_ROUTES.BASE_URL}${path}`;
};

/**
 * Helper function to build WebSocket URLs
 */
export const buildWsUrl = (path: string): string => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}${path}`;
};