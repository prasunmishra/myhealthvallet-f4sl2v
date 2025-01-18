import React, { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { ErrorBoundary } from 'react-error-boundary';
import { AuditLogger } from '@hipaa-audit-logger/react';

import Layout from '../../components/layout/Layout';
import ProfileSettings from '../../components/settings/ProfileSettings';
import NavigationService from '../../navigation/NavigationService';
import useAuth from '../../hooks/useAuth';
import { ApiError } from '../../types/api.types';
import { Theme } from '../../styles/theme';

// Styled components with responsive design
const ProfileContainer = styled.div<{ theme: Theme }>`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;

  @media (max-width: ${({ theme }) => theme.breakpoints.TABLET}px) {
    padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    padding: ${({ theme }) => theme.spacing.SMALL}px;
  }
`;

const ProfileHeader = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const Title = styled.h1`
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.h2};
  color: ${({ theme }) => theme.colors.text[900]};
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    font-size: ${({ theme }) => theme.typography.fontSizes.h3};
  }
`;

const Subtitle = styled.p`
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  color: ${({ theme }) => theme.colors.text[600]};
  margin: 0;
`;

// Error boundary fallback component
const ErrorFallback = ({ error }: { error: Error }) => (
  <div role="alert">
    <h2>Profile Error</h2>
    <pre style={{ color: 'red' }}>{error.message}</pre>
  </div>
);

const ProfileScreen: React.FC = () => {
  const { user, securityContext } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const auditLogger = new AuditLogger();

  // Initialize security audit logging
  useEffect(() => {
    auditLogger.initialize({
      component: 'ProfileScreen',
      userId: user?.id,
      securityLevel: 'high',
      hipaaCategory: 'PHI'
    });

    return () => {
      auditLogger.cleanup();
    };
  }, [user]);

  // Handle successful profile update
  const handleUpdateSuccess = useCallback(async () => {
    try {
      setIsUpdating(true);

      // Log successful update
      await auditLogger.log({
        action: 'PROFILE_UPDATE_SUCCESS',
        details: {
          userId: user?.id,
          timestamp: new Date().toISOString()
        }
      });

      // Navigate to dashboard with audit logging
      await NavigationService.navigate(
        'DASHBOARD',
        {},
        user!
      );
    } catch (error) {
      console.error('Profile update success handling failed:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [user]);

  // Handle profile update error
  const handleUpdateError = useCallback((error: ApiError) => {
    auditLogger.log({
      action: 'PROFILE_UPDATE_ERROR',
      details: {
        userId: user?.id,
        error: error.message,
        timestamp: new Date().toISOString()
      },
      level: 'error'
    });
  }, [user]);

  // Verify security context before rendering
  if (!securityContext || !user) {
    return null;
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        auditLogger.log({
          action: 'PROFILE_ERROR',
          details: {
            userId: user?.id,
            error: error.message,
            timestamp: new Date().toISOString()
          },
          level: 'error'
        });
      }}
    >
      <Layout>
        <ProfileContainer>
          <ProfileHeader>
            <Title>Profile Settings</Title>
            <Subtitle>
              Manage your personal information and preferences
            </Subtitle>
          </ProfileHeader>

          <ProfileSettings
            onUpdateSuccess={handleUpdateSuccess}
            onUpdateError={handleUpdateError}
            disabled={isUpdating}
          />
        </ProfileContainer>
      </Layout>
    </ErrorBoundary>
  );
};

// Add display name for debugging
ProfileScreen.displayName = 'ProfileScreen';

export default ProfileScreen;