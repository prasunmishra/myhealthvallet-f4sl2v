/**
 * Authentication Reducer
 * Implements HIPAA-compliant authentication state management with comprehensive security features
 * Supports OAuth 2.0, JWT, MFA, and biometric authentication flows
 * @version 1.0.0
 */

import { Reducer, createLogger } from '@reduxjs/toolkit';
import { 
  AuthState, 
  AuthActionTypes,
  AuthActionUnion,
  SecurityViolation,
  AuthStatus,
  AuthMethod
} from './auth.types';

// Security audit logger for tracking authentication state changes
const securityLogger = createLogger({
  predicate: (getState, action) => 
    Object.values(AuthActionTypes).includes(action.type as AuthActionTypes)
});

// Session timeout duration (30 minutes in milliseconds)
const SESSION_TIMEOUT_MS = 1800000;

// Maximum failed authentication attempts before account lockout
const MAX_AUTH_ATTEMPTS = 3;

// Initial authentication state with security context
const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  mfaToken: null,
  biometricToken: null,
  status: 'idle',
  lastActivity: Date.now(),
  securityContext: {
    deviceId: '',
    ipAddress: '',
    userAgent: '',
    lastVerifiedAt: 0
  },
  authMethod: null,
  error: null
};

/**
 * Authentication reducer with enhanced security features
 * Handles all authentication-related state updates with security validations
 */
const authReducer: Reducer<AuthState, AuthActionUnion> = (
  state = initialState,
  action
): AuthState => {
  // Update last activity timestamp for session management
  const updatedState = {
    ...state,
    lastActivity: Date.now()
  };

  switch (action.type) {
    case AuthActionTypes.LOGIN_REQUEST:
      return {
        ...updatedState,
        status: 'authenticating',
        error: null,
        securityContext: {
          ...state.securityContext,
          deviceId: action.payload.deviceId || '',
          lastVerifiedAt: Date.now()
        }
      };

    case AuthActionTypes.LOGIN_SUCCESS:
      // Validate token integrity before storing
      if (!action.payload.accessToken || !action.payload.refreshToken) {
        return {
          ...updatedState,
          status: 'error',
          error: { 
            code: 'token_invalid',
            message: 'Invalid authentication tokens received',
            errorId: Date.now().toString(),
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        ...updatedState,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        status: 'authenticated',
        error: null,
        authMethod: 'password',
        securityContext: {
          ...state.securityContext,
          lastVerifiedAt: Date.now()
        }
      };

    case AuthActionTypes.LOGIN_FAILURE:
      const failedAttempts = (state.user?.failedLoginAttempts || 0) + 1;
      const shouldLockAccount = failedAttempts >= MAX_AUTH_ATTEMPTS;

      return {
        ...updatedState,
        status: shouldLockAccount ? 'security_violation' : 'error',
        error: {
          code: shouldLockAccount ? 'account_locked' : 'invalid_credentials',
          message: action.payload,
          errorId: Date.now().toString(),
          timestamp: new Date().toISOString()
        },
        user: state.user ? {
          ...state.user,
          failedLoginAttempts: failedAttempts
        } : null
      };

    case AuthActionTypes.LOGOUT:
      // Securely clear all authentication state
      return {
        ...initialState,
        lastActivity: Date.now()
      };

    case AuthActionTypes.MFA_REQUIRED:
      return {
        ...updatedState,
        status: 'mfa_required',
        mfaToken: action.payload.mfaToken,
        authMethod: 'mfa'
      };

    case AuthActionTypes.MFA_VERIFY:
      if (!state.mfaToken || state.mfaToken !== action.payload.mfaToken) {
        return {
          ...updatedState,
          status: 'error',
          error: {
            code: 'mfa_invalid',
            message: 'Invalid MFA token',
            errorId: Date.now().toString(),
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        ...updatedState,
        status: 'authenticated',
        mfaToken: null,
        securityContext: {
          ...state.securityContext,
          lastVerifiedAt: Date.now()
        }
      };

    case AuthActionTypes.REFRESH_TOKEN:
      return {
        ...updatedState,
        accessToken: action.payload.accessToken,
        securityContext: {
          ...state.securityContext,
          lastVerifiedAt: Date.now()
        }
      };

    case AuthActionTypes.SESSION_TIMEOUT:
      // Check if session has exceeded timeout duration
      if (Date.now() - state.lastActivity > SESSION_TIMEOUT_MS) {
        return {
          ...initialState,
          status: 'session_expired',
          error: {
            code: 'token_expired',
            message: 'Session has expired',
            errorId: Date.now().toString(),
            timestamp: new Date().toISOString()
          }
        };
      }
      return updatedState;

    case AuthActionTypes.SECURITY_VIOLATION:
      const violation: SecurityViolation = action.payload;
      
      return {
        ...updatedState,
        status: 'security_violation',
        error: {
          code: 'security_violation',
          message: `Security violation detected: ${violation.type}`,
          errorId: Date.now().toString(),
          timestamp: new Date().toISOString(),
          details: violation.details
        },
        // Clear sensitive data on security violation
        accessToken: null,
        refreshToken: null,
        mfaToken: null,
        biometricToken: null
      };

    case AuthActionTypes.BIOMETRIC_AUTH:
      return {
        ...updatedState,
        biometricToken: action.payload.biometricToken,
        authMethod: 'biometric',
        securityContext: {
          ...state.securityContext,
          lastVerifiedAt: Date.now()
        }
      };

    default:
      return updatedState;
  }
};

// Log security-relevant state changes
authReducer.middleware = [securityLogger];

export default authReducer;