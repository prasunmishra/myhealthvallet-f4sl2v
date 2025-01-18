import React, { useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { Navigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import Layout from '../../components/layout/Layout';
import PrivacySettings from '../../components/settings/PrivacySettings';
import { useAuth } from '../../hooks/useAuth';

// Styled components with accessibility and security considerations
const ScreenContainer = styled.main`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  position: relative;
  min-height: 100vh;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  }
`;

const ScreenTitle = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizes.h4};
  font-weight: ${({ theme }) => theme.typography.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text[900]};
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
  line-height: 1.4;
  letter-spacing: 0.2px;
`;

const ErrorContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background-color: ${({ theme }) => theme.colors.error[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

// Error fallback component with security context
const ErrorFallback = ({ error }: { error: Error }) => (
  <ErrorContainer role="alert">
    <h2>Privacy Settings Error</h2>
    <p>{error.message}</p>
  </ErrorContainer>
);

const PrivacyScreen: React.FC = React.memo(() => {
  const { isAuthenticated, user, validateSecurityContext } = useAuth();

  // Security context validation
  useEffect(() => {
    const validateContext = async () => {
      try {
        await validateSecurityContext();
      } catch (error) {
        console.error('Security context validation failed:', error);
      }
    };

    validateContext();
  }, [validateSecurityContext]);

  // Security violation handler
  const handleSecurityViolation = useCallback((violation: string) => {
    console.error('Security violation detected:', violation);
    // Implement additional security measures like session termination if needed
  }, []);

  // Audit logging handler
  const handleAuditLog = useCallback((event: string, data: any) => {
    // Implement HIPAA-compliant audit logging
    console.info('Privacy audit log:', { event, data, timestamp: new Date() });
  }, []);

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onError={(error) => {
          handleAuditLog('PRIVACY_SCREEN_ERROR', { error: error.message });
        }}
      >
        <ScreenContainer role="main" aria-labelledby="privacy-settings-title">
          <ScreenTitle id="privacy-settings-title">Privacy Settings</ScreenTitle>
          <PrivacySettings
            onSecurityViolation={handleSecurityViolation}
            auditLogger={handleAuditLog}
          />
        </ScreenContainer>
      </ErrorBoundary>
    </Layout>
  );
});

PrivacyScreen.displayName = 'PrivacyScreen';

export default PrivacyScreen;