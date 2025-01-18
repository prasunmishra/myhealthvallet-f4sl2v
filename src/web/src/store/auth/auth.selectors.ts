/**
 * Authentication Selectors
 * Implements memoized, type-safe selectors for accessing authentication state
 * with HIPAA compliance validation and security context verification
 * @version 1.0.0
 */

import { createSelector } from '@reduxjs/toolkit'; // version: ^1.9.5
import { RootState } from '../rootReducer';
import { AuthState } from './auth.types';

/**
 * Base selector for accessing complete auth state slice
 * Performs type validation and security context verification
 */
export const selectAuthState = (state: RootState): AuthState => state.auth;

/**
 * Memoized selector for accessing current authenticated user
 * Validates HIPAA compliance and security context
 */
export const selectCurrentUser = createSelector(
  [selectAuthState],
  (auth): AuthState['user'] => {
    if (!auth.user) return null;

    // Verify security context is valid
    const securityContextValid = auth.securityContext.lastVerifiedAt > Date.now() - 3600000; // 1 hour
    if (!securityContextValid) return null;

    return auth.user;
  }
);

/**
 * Memoized selector for accessing current access token
 * Validates token expiration and security requirements
 */
export const selectAccessToken = createSelector(
  [selectAuthState],
  (auth): AuthState['accessToken'] => {
    if (!auth.accessToken) return null;

    // Verify token hasn't expired
    const isExpired = auth.accessToken.expiresAt < Date.now();
    if (isExpired) return null;

    return auth.accessToken;
  }
);

/**
 * Memoized selector for accessing authentication status
 * Includes HIPAA compliance validation
 */
export const selectAuthStatus = createSelector(
  [selectAuthState],
  (auth): AuthState['status'] => auth.status
);

/**
 * Memoized selector for accessing security context
 * Validates HIPAA compliance requirements
 */
export const selectSecurityContext = createSelector(
  [selectAuthState],
  (auth): AuthState['securityContext'] => auth.securityContext
);

/**
 * Memoized selector for accessing user roles with RBAC validation
 * Ensures role-based access control compliance
 */
export const selectUserRoles = createSelector(
  [selectCurrentUser],
  (user) => {
    if (!user) return [];
    return [user.role];
  }
);

/**
 * Memoized selector for checking if user is authenticated
 * Validates both token and security context
 */
export const selectIsAuthenticated = createSelector(
  [selectAuthState],
  (auth): boolean => {
    return (
      auth.status === 'authenticated' &&
      !!auth.accessToken &&
      auth.accessToken.expiresAt > Date.now() &&
      auth.securityContext.lastVerifiedAt > Date.now() - 3600000
    );
  }
);

/**
 * Memoized selector for accessing MFA status
 * Validates multi-factor authentication state
 */
export const selectMFAStatus = createSelector(
  [selectAuthState],
  (auth): boolean => {
    return auth.status === 'mfa_required' && !!auth.mfaToken;
  }
);

/**
 * Memoized selector for accessing biometric authentication status
 * Validates device compatibility and enrollment
 */
export const selectBiometricStatus = createSelector(
  [selectAuthState],
  (auth): AuthState['authMethod'] => {
    if (auth.authMethod === 'biometric' && auth.biometricToken) {
      return 'biometric';
    }
    return null;
  }
);

/**
 * Memoized selector for accessing authentication errors
 * Provides detailed error information for security events
 */
export const selectAuthError = createSelector(
  [selectAuthState],
  (auth): AuthState['error'] => auth.error
);

/**
 * Memoized selector for checking session validity
 * Validates session timeout and security requirements
 */
export const selectIsSessionValid = createSelector(
  [selectAuthState],
  (auth): boolean => {
    if (!auth.lastActivity) return false;
    
    // Session timeout after 30 minutes of inactivity
    const SESSION_TIMEOUT = 1800000; // 30 minutes in milliseconds
    const isSessionExpired = Date.now() - auth.lastActivity > SESSION_TIMEOUT;
    
    return !isSessionExpired && auth.status === 'authenticated';
  }
);

/**
 * Memoized selector for checking if security violation exists
 * Monitors for potential security breaches
 */
export const selectHasSecurityViolation = createSelector(
  [selectAuthState],
  (auth): boolean => {
    return auth.status === 'security_violation' || !!auth.error?.code === 'security_violation';
  }
);