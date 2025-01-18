/**
 * Authentication Reducer Test Suite
 * Comprehensive tests for HIPAA-compliant authentication state management
 * Covers OAuth 2.0, OIDC, MFA, JWT tokens, and biometric authentication
 * @version 1.0.0
 */

import { describe, it, expect } from '@jest/globals';
import authReducer from '../../src/store/auth/auth.reducer';
import { AuthState, AuthActionTypes } from '../../src/store/auth/auth.types';

describe('authReducer', () => {
  // Initial state setup with security context
  const initialState: AuthState = {
    user: null,
    accessToken: null,
    refreshToken: null,
    mfaToken: null,
    biometricToken: null,
    status: 'idle',
    lastActivity: Date.now(),
    securityContext: {
      deviceId: 'test-device',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      lastVerifiedAt: Date.now()
    },
    authMethod: null,
    error: null
  };

  // Mock user data for testing
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'PATIENT',
    isEmailVerified: true,
    isMFAEnabled: true,
    lastLogin: new Date(),
    lastPasswordChange: new Date(),
    failedLoginAttempts: 0,
    securityAuditLog: []
  };

  // Mock tokens for testing
  const mockTokens = {
    accessToken: {
      token: 'mock-access-token',
      type: 'access',
      expiresAt: Date.now() + 3600000,
      tokenId: 'test-token-id',
      issuedAt: Date.now(),
      deviceId: 'test-device',
      scope: ['openid', 'profile']
    },
    refreshToken: {
      token: 'mock-refresh-token',
      type: 'refresh',
      expiresAt: Date.now() + 86400000,
      tokenId: 'test-refresh-token-id',
      issuedAt: Date.now(),
      deviceId: 'test-device',
      scope: ['offline_access']
    }
  };

  it('should handle LOGIN_REQUEST action', () => {
    const action = {
      type: AuthActionTypes.LOGIN_REQUEST,
      payload: {
        email: 'test@example.com',
        password: 'password123',
        deviceId: 'test-device'
      }
    };

    const nextState = authReducer(initialState, action);

    expect(nextState.status).toBe('authenticating');
    expect(nextState.error).toBeNull();
    expect(nextState.securityContext.deviceId).toBe('test-device');
    expect(nextState.securityContext.lastVerifiedAt).toBeDefined();
  });

  it('should handle LOGIN_SUCCESS action with valid tokens', () => {
    const action = {
      type: AuthActionTypes.LOGIN_SUCCESS,
      payload: {
        user: mockUser,
        accessToken: mockTokens.accessToken,
        refreshToken: mockTokens.refreshToken
      }
    };

    const nextState = authReducer(initialState, action);

    expect(nextState.status).toBe('authenticated');
    expect(nextState.user).toEqual(mockUser);
    expect(nextState.accessToken).toEqual(mockTokens.accessToken);
    expect(nextState.refreshToken).toEqual(mockTokens.refreshToken);
    expect(nextState.authMethod).toBe('password');
  });

  it('should handle LOGIN_FAILURE with account lockout', () => {
    const stateWithFailedAttempts: AuthState = {
      ...initialState,
      user: { ...mockUser, failedLoginAttempts: 2 }
    };

    const action = {
      type: AuthActionTypes.LOGIN_FAILURE,
      payload: 'Invalid credentials'
    };

    const nextState = authReducer(stateWithFailedAttempts, action);

    expect(nextState.status).toBe('security_violation');
    expect(nextState.error).toEqual(expect.objectContaining({
      code: 'account_locked',
      message: 'Invalid credentials'
    }));
    expect(nextState.user?.failedLoginAttempts).toBe(3);
  });

  it('should handle MFA_REQUIRED action', () => {
    const action = {
      type: AuthActionTypes.MFA_REQUIRED,
      payload: {
        mfaToken: 'mock-mfa-token'
      }
    };

    const nextState = authReducer(initialState, action);

    expect(nextState.status).toBe('mfa_required');
    expect(nextState.mfaToken).toBe('mock-mfa-token');
    expect(nextState.authMethod).toBe('mfa');
  });

  it('should handle MFA_VERIFY with valid token', () => {
    const stateWithMFA: AuthState = {
      ...initialState,
      mfaToken: 'mock-mfa-token',
      status: 'mfa_required'
    };

    const action = {
      type: AuthActionTypes.MFA_VERIFY,
      payload: {
        code: '123456',
        mfaToken: 'mock-mfa-token'
      }
    };

    const nextState = authReducer(stateWithMFA, action);

    expect(nextState.status).toBe('authenticated');
    expect(nextState.mfaToken).toBeNull();
    expect(nextState.securityContext.lastVerifiedAt).toBeDefined();
  });

  it('should handle SESSION_TIMEOUT', () => {
    const expiredState: AuthState = {
      ...initialState,
      lastActivity: Date.now() - 1900000, // 31 minutes ago
      status: 'authenticated'
    };

    const action = {
      type: AuthActionTypes.SESSION_TIMEOUT,
      payload: { lastActivity: expiredState.lastActivity }
    };

    const nextState = authReducer(expiredState, action);

    expect(nextState.status).toBe('session_expired');
    expect(nextState.error).toEqual(expect.objectContaining({
      code: 'token_expired',
      message: 'Session has expired'
    }));
  });

  it('should handle SECURITY_VIOLATION', () => {
    const action = {
      type: AuthActionTypes.SECURITY_VIOLATION,
      payload: {
        type: 'ip_change',
        details: 'Suspicious IP address change detected'
      }
    };

    const nextState = authReducer(initialState, action);

    expect(nextState.status).toBe('security_violation');
    expect(nextState.error).toEqual(expect.objectContaining({
      code: 'security_violation',
      message: expect.stringContaining('ip_change')
    }));
    expect(nextState.accessToken).toBeNull();
    expect(nextState.refreshToken).toBeNull();
    expect(nextState.mfaToken).toBeNull();
    expect(nextState.biometricToken).toBeNull();
  });

  it('should handle BIOMETRIC_AUTH', () => {
    const action = {
      type: AuthActionTypes.BIOMETRIC_AUTH,
      payload: {
        biometricToken: 'mock-biometric-token'
      }
    };

    const nextState = authReducer(initialState, action);

    expect(nextState.biometricToken).toBe('mock-biometric-token');
    expect(nextState.authMethod).toBe('biometric');
    expect(nextState.securityContext.lastVerifiedAt).toBeDefined();
  });

  it('should handle LOGOUT by clearing sensitive data', () => {
    const authenticatedState: AuthState = {
      ...initialState,
      user: mockUser,
      accessToken: mockTokens.accessToken,
      refreshToken: mockTokens.refreshToken,
      status: 'authenticated'
    };

    const action = {
      type: AuthActionTypes.LOGOUT
    };

    const nextState = authReducer(authenticatedState, action);

    expect(nextState.user).toBeNull();
    expect(nextState.accessToken).toBeNull();
    expect(nextState.refreshToken).toBeNull();
    expect(nextState.mfaToken).toBeNull();
    expect(nextState.biometricToken).toBeNull();
    expect(nextState.status).toBe('idle');
    expect(nextState.lastActivity).toBeDefined();
  });

  it('should handle REFRESH_TOKEN', () => {
    const action = {
      type: AuthActionTypes.REFRESH_TOKEN,
      payload: {
        accessToken: {
          ...mockTokens.accessToken,
          token: 'new-access-token'
        }
      }
    };

    const nextState = authReducer(initialState, action);

    expect(nextState.accessToken).toEqual(action.payload.accessToken);
    expect(nextState.securityContext.lastVerifiedAt).toBeDefined();
  });
});