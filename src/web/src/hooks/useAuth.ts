import { useState, useEffect, useCallback, useMemo } from 'react';
import { useIdleTimer } from 'react-idle-timer'; // v5.7.2
import { useRateLimiter } from 'react-rate-limiter'; // v1.0.0
import type { SecurityContext } from '@types/security-context'; // v1.0.0
import { AuditLogger } from '@hipaa/audit-logger'; // v2.0.0
import { DeviceFingerprint } from '@security/device-fingerprint'; // v1.2.0
import { TokenManager } from '@security/token-manager'; // v1.0.0

// Types for authentication state and operations
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  roles: string[];
  securityContext: SecurityContext;
  lastActivity: Date;
}

interface User {
  id: string;
  email: string;
  mfaEnabled: boolean;
  biometricEnabled: boolean;
  lastLogin: Date;
}

interface AuthError {
  code: string;
  message: string;
  timestamp: Date;
}

interface BiometricAuthResult {
  success: boolean;
  method: 'touchid' | 'faceid' | 'none';
  timestamp: Date;
}

// Constants
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function useAuth() {
  // State management
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    roles: [],
    securityContext: {},
    lastActivity: new Date(),
  });
  const [errors, setErrors] = useState<AuthError[]>([]);

  // Initialize security utilities
  const tokenManager = useMemo(() => new TokenManager(), []);
  const auditLogger = useMemo(() => new AuditLogger(), []);
  const deviceFingerprint = useMemo(() => new DeviceFingerprint(), []);

  // Rate limiting configuration
  const { isRateLimited, attempt } = useRateLimiter({
    maxAttempts: MAX_LOGIN_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });

  // Session timeout management
  const handleOnIdle = useCallback(() => {
    if (authState.isAuthenticated) {
      logout();
      auditLogger.log({
        event: 'SESSION_TIMEOUT',
        userId: authState.user?.id,
        timestamp: new Date(),
      });
    }
  }, [authState.isAuthenticated, authState.user]);

  const { start: startIdleTimer, reset: resetIdleTimer } = useIdleTimer({
    timeout: SESSION_TIMEOUT_MS,
    onIdle: handleOnIdle,
  });

  // Authentication methods
  const login = useCallback(async (email: string, password: string) => {
    try {
      if (isRateLimited()) {
        throw new Error('Too many login attempts. Please try again later.');
      }

      attempt();
      const fingerprint = await deviceFingerprint.generate();
      
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': fingerprint,
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const { user, token, roles } = await response.json();
      
      tokenManager.setToken(token);
      startIdleTimer();

      setAuthState({
        isAuthenticated: true,
        user,
        roles,
        securityContext: { deviceFingerprint: fingerprint },
        lastActivity: new Date(),
      });

      auditLogger.log({
        event: 'LOGIN_SUCCESS',
        userId: user.id,
        timestamp: new Date(),
      });
    } catch (error) {
      handleAuthError(error as Error);
    }
  }, [isRateLimited, attempt, deviceFingerprint, tokenManager, startIdleTimer]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenManager.getToken()}`,
        },
      });

      auditLogger.log({
        event: 'LOGOUT',
        userId: authState.user?.id,
        timestamp: new Date(),
      });

      tokenManager.clearToken();
      setAuthState({
        isAuthenticated: false,
        user: null,
        roles: [],
        securityContext: {},
        lastActivity: new Date(),
      });
    } catch (error) {
      handleAuthError(error as Error);
    }
  }, [authState.user, tokenManager]);

  const verifyMFA = useCallback(async (code: string) => {
    try {
      const response = await fetch('/api/v1/auth/mfa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenManager.getToken()}`,
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error('MFA verification failed');
      }

      auditLogger.log({
        event: 'MFA_VERIFICATION_SUCCESS',
        userId: authState.user?.id,
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      handleAuthError(error as Error);
      return false;
    }
  }, [authState.user, tokenManager]);

  const authenticateWithBiometrics = useCallback(async (): Promise<BiometricAuthResult> => {
    try {
      const biometricSupport = await fetch('/api/v1/auth/biometric/support').then(r => r.json());
      
      if (!biometricSupport.available) {
        return {
          success: false,
          method: 'none',
          timestamp: new Date(),
        };
      }

      const result = await fetch('/api/v1/auth/biometric/authenticate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenManager.getToken()}`,
        },
      }).then(r => r.json());

      auditLogger.log({
        event: 'BIOMETRIC_AUTH_ATTEMPT',
        userId: authState.user?.id,
        success: result.success,
        method: result.method,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      handleAuthError(error as Error);
      return {
        success: false,
        method: 'none',
        timestamp: new Date(),
      };
    }
  }, [authState.user, tokenManager]);

  // Error handling
  const handleAuthError = useCallback((error: Error) => {
    const authError: AuthError = {
      code: 'AUTH_ERROR',
      message: error.message,
      timestamp: new Date(),
    };

    setErrors(prev => [...prev, authError]);
    auditLogger.log({
      event: 'AUTH_ERROR',
      userId: authState.user?.id,
      error: authError,
      timestamp: new Date(),
    });
  }, [authState.user]);

  // Effect for token refresh
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout;

    if (authState.isAuthenticated) {
      refreshInterval = setInterval(async () => {
        try {
          const response = await fetch('/api/v1/auth/token/refresh', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokenManager.getToken()}`,
            },
          });

          if (!response.ok) {
            throw new Error('Token refresh failed');
          }

          const { token } = await response.json();
          tokenManager.setToken(token);
          resetIdleTimer();
        } catch (error) {
          handleAuthError(error as Error);
          logout();
        }
      }, 14 * 60 * 1000); // Refresh token every 14 minutes
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [authState.isAuthenticated, tokenManager, resetIdleTimer, logout]);

  return {
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    roles: authState.roles,
    securityContext: authState.securityContext,
    errors,
    login,
    logout,
    verifyMFA,
    authenticateWithBiometrics,
    deviceFingerprint: deviceFingerprint.getFingerprint(),
    auditLog: auditLogger,
    sessionTimeout: {
      reset: resetIdleTimer,
      getRemainingTime: () => SESSION_TIMEOUT_MS - (Date.now() - authState.lastActivity.getTime()),
    },
    rateLimiter: {
      isLimited: isRateLimited,
      remainingAttempts: MAX_LOGIN_ATTEMPTS - attempt(),
    },
  };
}