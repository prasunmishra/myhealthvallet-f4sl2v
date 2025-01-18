/**
 * Authentication Constants
 * Defines authentication-related constants for the PHRSAT web application
 * Supports HIPAA-compliant authentication flows with OAuth 2.0, OIDC, MFA and biometric authentication
 * @version 1.0.0
 */

/**
 * Types of authentication tokens supported by the system
 */
export enum AUTH_TOKEN_TYPES {
  ACCESS = 'access',
  REFRESH = 'refresh',
  MFA = 'mfa',
  BIOMETRIC = 'biometric'
}

/**
 * Secure local storage keys for authentication data
 * Uses namespaced keys with application prefix for isolation
 */
export const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: '@phrsat/access_token',
  REFRESH_TOKEN: '@phrsat/refresh_token',
  USER_DATA: '@phrsat/user_data',
  MFA_TOKEN: '@phrsat/mfa_token',
  AUTH_STATE: '@phrsat/auth_state',
  BIOMETRIC_STATUS: '@phrsat/biometric_status'
} as const;

/**
 * Authentication API endpoint paths
 * Supports comprehensive authentication flows including OAuth, MFA and biometric
 */
export const AUTH_API_ENDPOINTS = {
  LOGIN: '/api/v1/auth/login',
  LOGOUT: '/api/v1/auth/logout',
  REFRESH_TOKEN: '/api/v1/auth/refresh',
  VERIFY_MFA: '/api/v1/auth/mfa/verify',
  REGISTER_BIOMETRIC: '/api/v1/auth/biometric/register',
  VERIFY_BIOMETRIC: '/api/v1/auth/biometric/verify',
  OAUTH_CALLBACK: '/api/v1/auth/oauth/callback'
} as const;

/**
 * Authentication configuration values
 * Defines security-focused defaults for token management and authentication flows
 */
export const AUTH_CONFIG = {
  // Refresh token 5 minutes before expiry (in seconds)
  TOKEN_REFRESH_THRESHOLD: 300,
  
  // MFA code configuration
  MFA_CODE_LENGTH: 6,
  MFA_CODE_EXPIRY: 300, // 5 minutes in seconds
  
  // Security limits
  MAX_LOGIN_ATTEMPTS: 3,
  SESSION_TIMEOUT: 3600, // 1 hour in seconds
  
  // OAuth scopes required for complete functionality
  OAUTH_SCOPES: [
    'openid',
    'profile', 
    'email',
    'offline_access'
  ]
} as const;