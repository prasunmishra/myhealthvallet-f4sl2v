import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useRateLimiter } from '@security/rate-limiter';
import { SecurityContext } from '@app/security-context';
import { LoginForm } from '../../components/auth/LoginForm';
import { BiometricPrompt } from '../../components/auth/BiometricPrompt';
import { MFAVerification } from '../../components/auth/MFAVerification';
import { NavigationService } from '../../navigation/NavigationService';
import { useAuth } from '../../hooks/useAuth';
import { AuthError } from '../../types/auth.types';
import { NavigationRoutes } from '../../types/navigation.types';

// Styled components with WCAG 2.1 AAA compliance
const Container = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${props => props.theme.spacing.LARGE}px;
  background-color: ${props => props.theme.colors.background};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const AccessibleAnnouncement = styled.div`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

// Component state interface
interface LoginScreenState {
  showBiometric: boolean;
  showMFA: boolean;
  error: AuthError | null;
  isLoading: boolean;
  attemptCount: number;
}

export const LoginScreen: React.FC = () => {
  // State management
  const [state, setState] = useState<LoginScreenState>({
    showBiometric: false,
    showMFA: false,
    error: null,
    isLoading: false,
    attemptCount: 0
  });

  // Hooks
  const { isAuthenticated, user, authenticateWithBiometrics } = useAuth();
  const rateLimiter = useRateLimiter({
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000 // 5 minutes
  });

  // Check for biometric availability on mount
  useEffect(() => {
    const checkBiometricAvailability = async () => {
      try {
        const biometricResult = await authenticateWithBiometrics();
        if (biometricResult.success) {
          setState(prev => ({ ...prev, showBiometric: true }));
        }
      } catch (error) {
        console.error('Biometric check failed:', error);
      }
    };

    checkBiometricAvailability();
  }, [authenticateWithBiometrics]);

  // Handle successful login
  const handleLoginSuccess = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      await NavigationService.navigate(
        NavigationRoutes.DASHBOARD,
        {},
        user!
      );
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: {
          code: 'navigation_error',
          message: 'Failed to navigate to dashboard',
          errorId: Date.now().toString(),
          timestamp: new Date().toISOString()
        }
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user]);

  // Handle login error
  const handleLoginError = useCallback((error: string) => {
    setState(prev => ({
      ...prev,
      error: {
        code: 'auth_error',
        message: error,
        errorId: Date.now().toString(),
        timestamp: new Date().toISOString()
      },
      attemptCount: prev.attemptCount + 1
    }));
  }, []);

  // Handle MFA requirement
  const handleMFARequired = useCallback(() => {
    setState(prev => ({ ...prev, showMFA: true }));
  }, []);

  // Handle biometric authentication
  const handleBiometricSuccess = useCallback(() => {
    handleLoginSuccess();
  }, [handleLoginSuccess]);

  // Handle biometric error
  const handleBiometricError = useCallback((error: any) => {
    setState(prev => ({
      ...prev,
      showBiometric: false,
      error: {
        code: 'biometric_error',
        message: error.message,
        errorId: Date.now().toString(),
        timestamp: new Date().toISOString()
      }
    }));
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      NavigationService.navigate(NavigationRoutes.DASHBOARD, {}, user!);
    }
  }, [isAuthenticated, user]);

  return (
    <Container role="main" aria-label="Login page">
      <AccessibleAnnouncement
        role="status"
        aria-live="polite"
        id="login-announcer"
      >
        {state.error?.message}
      </AccessibleAnnouncement>

      {state.showBiometric ? (
        <BiometricPrompt
          isOpen={state.showBiometric}
          onSuccess={handleBiometricSuccess}
          onError={handleBiometricError}
          onClose={() => setState(prev => ({ ...prev, showBiometric: false }))}
        />
      ) : state.showMFA ? (
        <MFAVerification
          onSuccess={handleLoginSuccess}
          onCancel={() => setState(prev => ({ ...prev, showMFA: false }))}
          onError={handleLoginError}
        />
      ) : (
        <LoginForm
          onSuccess={handleLoginSuccess}
          onError={handleLoginError}
          onMFARequired={handleMFARequired}
        />
      )}
    </Container>
  );
};

export default LoginScreen;