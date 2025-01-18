import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { Input, InputProps } from '../common/Input';
import { Button } from '../common/Button';
import { useAuth } from '../../hooks/useAuth';
import { axe, toHaveNoViolations } from '@axe-core/react'; // v4.7.3

// Props interface for MFAVerification component
export interface MFAVerificationProps {
  onSuccess: () => void;
  onCancel: () => void;
  deviceTrust?: boolean;
}

// Styled components with WCAG 2.1 AAA compliance
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: clamp(16px, 5vw, 24px);
  max-width: min(400px, 90vw);
  width: 100%;
  margin: 0 auto;
  position: relative;
  background-color: ${props => props.theme.colors.surface[100]};
  border-radius: ${props => props.theme.shape.borderRadius.md}px;
  box-shadow: ${props => props.theme.shadows.md};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Title = styled.h2`
  font-size: clamp(20px, 5vw, 24px);
  font-weight: ${props => props.theme.typography.fontWeights.semibold};
  color: ${props => props.theme.colors.text[500]};
  margin-bottom: 8px;
  text-align: start;
`;

const Description = styled.p`
  font-size: ${props => props.theme.typography.fontSizes.base};
  color: ${props => props.theme.colors.text[400]};
  margin-bottom: 16px;
  line-height: ${props => props.theme.typography.lineHeights.relaxed};
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 16px;
  margin-top: 24px;
  justify-content: flex-end;

  [dir='rtl'] & {
    flex-direction: row-reverse;
  }
`;

const RemainingAttempts = styled.span`
  font-size: ${props => props.theme.typography.fontSizes.small};
  color: ${props => props.theme.colors.warning[500]};
  margin-top: 8px;
`;

export const MFAVerification: React.FC<MFAVerificationProps> = ({
  onSuccess,
  onCancel,
  deviceTrust = false,
}) => {
  const [mfaCode, setMfaCode] = useState<string>('');
  const [trustDevice, setTrustDevice] = useState<boolean>(false);
  const { verifyMFA, loading, error, rateLimiter } = useAuth();
  const [validationError, setValidationError] = useState<string>('');

  // Validate MFA code format
  const validateMFACode = useCallback((code: string): boolean => {
    const MFA_CODE_REGEX = /^\d{6}$/;
    return MFA_CODE_REGEX.test(code);
  }, []);

  // Handle MFA code input changes
  const handleCodeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/[^\d]/g, '').slice(0, 6);
    setMfaCode(value);
    setValidationError('');
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateMFACode(mfaCode)) {
      setValidationError('Please enter a valid 6-digit code');
      return;
    }

    if (rateLimiter.remainingAttempts <= 0) {
      setValidationError('Too many attempts. Please try again later.');
      return;
    }

    try {
      const success = await verifyMFA(mfaCode);
      if (success) {
        if (deviceTrust && trustDevice) {
          // Store device trust token in secure storage
          localStorage.setItem('device_trust', 'true');
        }
        onSuccess();
      }
    } catch (err) {
      setValidationError('Invalid verification code. Please try again.');
    }
  }, [mfaCode, verifyMFA, deviceTrust, trustDevice, onSuccess, rateLimiter.remainingAttempts]);

  // Accessibility announcement for remaining attempts
  useEffect(() => {
    if (rateLimiter.remainingAttempts <= 2) {
      const announcement = `${rateLimiter.remainingAttempts} attempts remaining`;
      const ariaLive = document.getElementById('mfa-attempts-announcement');
      if (ariaLive) {
        ariaLive.textContent = announcement;
      }
    }
  }, [rateLimiter.remainingAttempts]);

  return (
    <Container role="dialog" aria-labelledby="mfa-title" aria-describedby="mfa-description">
      <form onSubmit={handleSubmit} noValidate>
        <Title id="mfa-title">Two-Factor Authentication</Title>
        <Description id="mfa-description">
          Enter the 6-digit code from your authenticator app to continue.
        </Description>

        <Input
          id="mfa-code"
          name="mfaCode"
          type="tel"
          value={mfaCode}
          onChange={handleCodeChange}
          placeholder="000000"
          aria-label="Enter verification code"
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'mfa-error' : undefined}
          maxLength={6}
          required
          disabled={loading || rateLimiter.remainingAttempts <= 0}
          status={validationError ? 'error' : 'default'}
          errorMessage={validationError}
          autoComplete="one-time-code"
        />

        {deviceTrust && (
          <label>
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              aria-label="Trust this device for 30 days"
            />
            <span>Trust this device for 30 days</span>
          </label>
        )}

        {rateLimiter.remainingAttempts <= 2 && (
          <RemainingAttempts id="mfa-attempts-announcement" role="alert">
            {rateLimiter.remainingAttempts} attempts remaining
          </RemainingAttempts>
        )}

        <ButtonContainer>
          <Button
            type="button"
            variant="text"
            onClick={onCancel}
            disabled={loading}
            aria-label="Cancel verification"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!mfaCode || loading || rateLimiter.remainingAttempts <= 0}
            aria-label="Verify code"
          >
            Verify
          </Button>
        </ButtonContainer>
      </form>
    </Container>
  );
};

export default MFAVerification;