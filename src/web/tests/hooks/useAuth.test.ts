import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { jest } from '@jest/globals';

import useAuth from '../../src/hooks/useAuth';
import * as authActions from '../../src/store/auth/auth.actions';
import * as authSelectors from '../../src/store/auth/auth.selectors';

// Mock store setup with enhanced security configuration
const setupTest = (initialState = {}) => {
  // Create mock store with security context
  const store = configureStore({
    reducer: {
      auth: (state = initialState, action) => state
    }
  });

  // Mock security-related selectors
  const mockSelectors = {
    selectIsAuthenticated: jest.spyOn(authSelectors, 'selectIsAuthenticated'),
    selectCurrentUser: jest.spyOn(authSelectors, 'selectCurrentUser'),
    selectMFAStatus: jest.spyOn(authSelectors, 'selectMFAStatus'),
    selectAuthError: jest.spyOn(authSelectors, 'selectAuthError'),
    selectSecurityContext: jest.spyOn(authSelectors, 'selectSecurityContext'),
    selectBiometricStatus: jest.spyOn(authSelectors, 'selectBiometricStatus'),
    selectIsSessionValid: jest.spyOn(authSelectors, 'selectIsSessionValid')
  };

  // Mock security-related actions
  const mockActions = {
    login: jest.spyOn(authActions, 'login'),
    logout: jest.spyOn(authActions, 'logout'),
    verifyMFA: jest.spyOn(authActions, 'verifyMFA'),
    verifyBiometric: jest.spyOn(authActions, 'verifyBiometric'),
    refreshToken: jest.spyOn(authActions, 'refreshToken')
  };

  // Create wrapper with security providers
  const wrapper = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );

  return {
    store,
    mockSelectors,
    mockActions,
    wrapper
  };
};

describe('useAuth hook security features', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with secure context', () => {
    const { wrapper, mockSelectors } = setupTest();
    mockSelectors.selectIsAuthenticated.mockReturnValue(false);
    mockSelectors.selectSecurityContext.mockReturnValue({
      deviceId: 'test-device',
      lastVerifiedAt: Date.now()
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.securityContext).toBeDefined();
    expect(result.current.deviceFingerprint).toBeDefined();
  });

  it('should handle OAuth authentication flow', async () => {
    const { wrapper, mockActions, mockSelectors } = setupTest();
    const credentials = {
      email: 'test@example.com',
      password: 'Test123!'
    };

    mockSelectors.selectIsAuthenticated.mockReturnValue(false);
    mockActions.login.mockResolvedValue({
      user: { id: '123', email: credentials.email },
      accessToken: 'test-token',
      securityContext: { deviceId: 'test-device' }
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login(credentials.email, credentials.password);
    });

    expect(mockActions.login).toHaveBeenCalledWith(
      credentials,
      expect.objectContaining({
        deviceId: expect.any(String)
      })
    );
    expect(result.current.auditLog).toBeDefined();
  });

  it('should enforce rate limiting', async () => {
    const { wrapper, mockActions } = setupTest();
    const credentials = {
      email: 'test@example.com',
      password: 'wrong-password'
    };

    mockActions.login.mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Attempt multiple logins
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await result.current.login(credentials.email, credentials.password);
      });
    }

    expect(result.current.rateLimiter.isLimited()).toBe(true);
    expect(result.current.rateLimiter.remainingAttempts).toBe(0);
  });

  it('should handle biometric authentication', async () => {
    const { wrapper, mockActions, mockSelectors } = setupTest();
    mockSelectors.selectBiometricStatus.mockReturnValue(true);
    mockActions.verifyBiometric.mockResolvedValue({
      success: true,
      method: 'touchid'
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const biometricResult = await result.current.authenticateWithBiometrics();
      expect(biometricResult.success).toBe(true);
      expect(biometricResult.method).toBe('touchid');
    });

    expect(mockActions.verifyBiometric).toHaveBeenCalled();
  });

  it('should manage session timeout', async () => {
    const { wrapper, mockSelectors, mockActions } = setupTest();
    mockSelectors.selectIsAuthenticated.mockReturnValue(true);
    mockSelectors.selectIsSessionValid.mockReturnValue(false);

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Simulate session timeout
    await act(async () => {
      jest.advanceTimersByTime(1800000); // 30 minutes
    });

    expect(mockActions.logout).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should handle security violations', async () => {
    const { wrapper, mockActions, mockSelectors } = setupTest();
    const securityViolation = {
      type: 'suspicious_activity',
      details: 'Multiple failed login attempts detected'
    };

    mockSelectors.selectIsAuthenticated.mockReturnValue(true);
    mockActions.login.mockRejectedValue({
      code: 'SECURITY_VIOLATION',
      details: securityViolation
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      try {
        await result.current.login('test@example.com', 'Test123!');
      } catch (error) {
        expect(error.code).toBe('SECURITY_VIOLATION');
      }
    });

    expect(result.current.errors).toContainEqual(
      expect.objectContaining({
        code: 'AUTH_ERROR',
        message: expect.stringContaining('Security violation')
      })
    );
  });

  it('should handle MFA verification', async () => {
    const { wrapper, mockActions, mockSelectors } = setupTest();
    mockSelectors.selectMFAStatus.mockReturnValue(true);
    mockActions.verifyMFA.mockResolvedValue({
      success: true,
      user: { id: '123', mfaEnabled: true }
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const mfaResult = await result.current.verifyMFA('123456');
      expect(mfaResult).toBe(true);
    });

    expect(mockActions.verifyMFA).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '123456'
      })
    );
  });

  it('should handle token refresh', async () => {
    const { wrapper, mockActions, mockSelectors } = setupTest();
    mockSelectors.selectIsAuthenticated.mockReturnValue(true);
    mockActions.refreshToken.mockResolvedValue({
      accessToken: 'new-token'
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(840000); // 14 minutes
    });

    expect(mockActions.refreshToken).toHaveBeenCalled();
  });
});