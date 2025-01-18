import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { ANIMATION_DURATIONS, ANIMATION_EASINGS } from '../../styles/animations';

// Types
interface BiometricPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (error: BiometricError) => void;
  isRTL?: boolean;
  preferReducedMotion?: boolean;
  maxAttempts?: number;
  fallbackUrl?: string;
}

interface BiometricError {
  code: string;
  message: string;
  timestamp: Date;
  deviceInfo: {
    type: string;
    platform: string;
    browser: string;
  };
}

interface DeviceInfo {
  type: string;
  platform: string;
  browser: string;
}

// Styled Components
const PromptContainer = styled.div<{ isRTL: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  direction: ${({ isRTL }) => isRTL ? 'rtl' : 'ltr'};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition: none;
  }
`;

const PromptIcon = styled.div<{ isAnimating: boolean }>`
  width: 64px;
  height: 64px;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
  opacity: ${({ isAnimating }) => isAnimating ? 0.7 : 1};
  transition: opacity ${ANIMATION_DURATIONS.NORMAL}ms ${ANIMATION_EASINGS.EASE_OUT};

  svg {
    width: 100%;
    height: 100%;
    fill: ${({ theme }) => theme.colors.primary[500]};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Title = styled.h2`
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.h4};
  font-weight: ${({ theme }) => theme.typography.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text[900]};
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const Description = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  color: ${({ theme }) => theme.colors.text[600]};
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
  max-width: 400px;
`;

const ButtonContainer = styled.div<{ isRTL: boolean }>`
  display: flex;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  flex-direction: ${({ isRTL }) => isRTL ? 'row-reverse' : 'row'};
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error[500]};
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

// BiometricPrompt Component
export const BiometricPrompt: React.FC<BiometricPromptProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
  isRTL = false,
  preferReducedMotion = false,
  maxAttempts = 3,
  fallbackUrl,
}) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion() || preferReducedMotion;
  const { verifyMFA, validateSecurityContext, logAuthAttempt } = useAuth();

  const getDeviceInfo = useCallback((): DeviceInfo => {
    return {
      type: 'browser',
      platform: navigator.platform,
      browser: navigator.userAgent,
    };
  }, []);

  const handleBiometricAuth = useCallback(async () => {
    if (attempts >= maxAttempts) {
      const error: BiometricError = {
        code: 'MAX_ATTEMPTS_EXCEEDED',
        message: 'Maximum authentication attempts exceeded',
        timestamp: new Date(),
        deviceInfo: getDeviceInfo(),
      };
      onError(error);
      onClose();
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Validate security context before attempting biometric auth
      const isContextValid = await validateSecurityContext();
      if (!isContextValid) {
        throw new Error('Invalid security context');
      }

      // Attempt biometric authentication
      const result = await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(32),
          rpId: window.location.hostname,
          userVerification: 'required',
        },
      });

      if (result) {
        // Verify the biometric result with MFA
        const mfaVerified = await verifyMFA('biometric');
        if (mfaVerified) {
          // Log successful attempt
          await logAuthAttempt({
            type: 'biometric',
            success: true,
            timestamp: new Date(),
            deviceInfo: getDeviceInfo(),
          });
          onSuccess();
        } else {
          throw new Error('MFA verification failed');
        }
      }
    } catch (err) {
      setAttempts(prev => prev + 1);
      const error: BiometricError = {
        code: 'BIOMETRIC_AUTH_FAILED',
        message: err instanceof Error ? err.message : 'Authentication failed',
        timestamp: new Date(),
        deviceInfo: getDeviceInfo(),
      };
      
      // Log failed attempt
      await logAuthAttempt({
        type: 'biometric',
        success: false,
        error: error,
        timestamp: new Date(),
        deviceInfo: getDeviceInfo(),
      });

      setError(error.message);
      onError(error);
    } finally {
      setIsAuthenticating(false);
    }
  }, [attempts, maxAttempts, onError, onSuccess, onClose, getDeviceInfo, validateSecurityContext, verifyMFA, logAuthAttempt]);

  const handleFallback = useCallback(() => {
    if (fallbackUrl) {
      window.location.href = fallbackUrl;
    }
    onClose();
  }, [fallbackUrl, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setAttempts(0);
      setError(null);
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Biometric Authentication"
      size="small"
      ariaLabel="Biometric authentication prompt"
      closeOnEscape={!isAuthenticating}
      closeOnBackdropClick={!isAuthenticating}
      disableAnimation={shouldReduceMotion}
    >
      <PromptContainer isRTL={isRTL}>
        <PromptIcon isAnimating={isAuthenticating}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3-13.5V9h-4v2h4v2.5l3.5-3.5L15 6.5z"/>
          </svg>
        </PromptIcon>
        
        <Title>Verify Your Identity</Title>
        <Description>
          Please use your fingerprint or face recognition to verify your identity
        </Description>

        {error && <ErrorMessage role="alert">{error}</ErrorMessage>}

        <ButtonContainer isRTL={isRTL}>
          <Button
            variant="primary"
            onClick={handleBiometricAuth}
            disabled={isAuthenticating || attempts >= maxAttempts}
            loading={isAuthenticating}
            ariaLabel="Authenticate with biometrics"
          >
            {isAuthenticating ? 'Verifying...' : 'Verify Identity'}
          </Button>
          <Button
            variant="text"
            onClick={handleFallback}
            disabled={isAuthenticating}
            ariaLabel="Use alternative authentication method"
          >
            Use Alternative Method
          </Button>
        </ButtonContainer>
      </PromptContainer>
    </Modal>
  );
};

export default BiometricPrompt;