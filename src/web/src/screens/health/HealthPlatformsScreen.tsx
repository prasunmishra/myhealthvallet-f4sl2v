import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useTranslation } from 'react-i18next';
import { HealthPlatformConnect } from '../../components/health/HealthPlatformConnect';
import { useHealth } from '../../hooks/useHealth';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { HEALTH_PLATFORMS } from '../../constants/health.constants';
import { HealthPlatform, ValidationError } from '../../types/health.types';

// Styled components for layout
const ScreenContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.LARGE}px;
  min-height: 100vh;
  aria-live: polite;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const PlatformGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const Header = styled.header`
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizes.h2};
  color: ${({ theme }) => theme.colors.text[900]};
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
`;

const Description = styled.p`
  color: ${({ theme }) => theme.colors.text[600]};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  line-height: ${({ theme }) => theme.typography.lineHeights.relaxed};
`;

const StatusMessage = styled.div<{ type: 'success' | 'error' | 'info' }>`
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  background-color: ${({ theme, type }) => 
    type === 'success' ? theme.colors.success[100] :
    type === 'error' ? theme.colors.error[100] :
    theme.colors.info[100]
  };
  color: ${({ theme, type }) => 
    type === 'success' ? theme.colors.success[800] :
    type === 'error' ? theme.colors.error[800] :
    theme.colors.info[800]
  };
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

// Platform configuration with validation rules
const PLATFORM_CONFIG = {
  [HEALTH_PLATFORMS.APPLE_HEALTH]: {
    id: HEALTH_PLATFORMS.APPLE_HEALTH,
    name: 'Apple Health',
    icon: 'apple-health',
    description: 'Sync your Apple Health data including activity, vitals, and more',
    validationRules: {
      requiredMetrics: ['heart_rate', 'steps', 'blood_pressure'],
      minSyncInterval: 900000, // 15 minutes
      maxBatchSize: 1000
    }
  },
  [HEALTH_PLATFORMS.GOOGLE_FIT]: {
    id: HEALTH_PLATFORMS.GOOGLE_FIT,
    name: 'Google Fit',
    icon: 'google-fit',
    description: 'Connect with Google Fit to sync your fitness and health data',
    validationRules: {
      requiredMetrics: ['heart_rate', 'steps', 'activity'],
      minSyncInterval: 900000,
      maxBatchSize: 1000
    }
  }
};

const HealthPlatformsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { syncData, loading, error, retrySync, syncProgress } = useHealth();
  const [syncStatus, setSyncStatus] = useState<Record<string, { status: string; error?: string }>>({});
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Handle platform connection status
  const handlePlatformConnection = useCallback(async (
    platformId: string,
    success: boolean,
    error?: Error
  ) => {
    if (success) {
      setSyncStatus(prev => ({
        ...prev,
        [platformId]: { status: 'connected' }
      }));
      try {
        await syncData();
      } catch (syncError) {
        setSyncStatus(prev => ({
          ...prev,
          [platformId]: { 
            status: 'error',
            error: syncError instanceof Error ? syncError.message : 'Sync failed'
          }
        }));
      }
    } else {
      setSyncStatus(prev => ({
        ...prev,
        [platformId]: { 
          status: 'error',
          error: error?.message || 'Connection failed'
        }
      }));
    }
  }, [syncData]);

  // Monitor sync progress
  useEffect(() => {
    if (syncProgress === 100) {
      setSyncStatus(prev => 
        Object.keys(prev).reduce((acc, key) => ({
          ...acc,
          [key]: { status: 'synced' }
        }), {})
      );
    }
  }, [syncProgress]);

  // Handle validation errors
  useEffect(() => {
    if (error) {
      setValidationErrors(prev => [
        ...prev,
        {
          code: 'SYNC_ERROR',
          message: error.message,
          details: {}
        }
      ]);
    }
  }, [error]);

  return (
    <ErrorBoundary>
      <ScreenContainer>
        <Header>
          <Title>{t('health.platforms.title')}</Title>
          <Description>{t('health.platforms.description')}</Description>
        </Header>

        {error && (
          <StatusMessage type="error" role="alert">
            {t('health.platforms.syncError', { error: error.message })}
          </StatusMessage>
        )}

        {syncProgress > 0 && syncProgress < 100 && (
          <StatusMessage type="info">
            {t('health.platforms.syncing', { progress: syncProgress })}
          </StatusMessage>
        )}

        <PlatformGrid>
          {Object.values(PLATFORM_CONFIG).map(platform => (
            <HealthPlatformConnect
              key={platform.id}
              platformId={platform.id}
              platformName={platform.name}
              onConnected={(success, error) => 
                handlePlatformConnection(platform.id, success, error)
              }
              onError={(error) => {
                setValidationErrors(prev => [
                  ...prev,
                  {
                    code: 'PLATFORM_ERROR',
                    message: error.message,
                    details: { platformId: platform.id }
                  }
                ]);
              }}
              onProgress={(progress) => {
                setSyncStatus(prev => ({
                  ...prev,
                  [platform.id]: { 
                    status: 'syncing',
                    progress: progress
                  }
                }));
              }}
            />
          ))}
        </PlatformGrid>

        {validationErrors.length > 0 && (
          <StatusMessage type="error" role="alert">
            {t('health.platforms.validationErrors', { 
              count: validationErrors.length 
            })}
          </StatusMessage>
        )}
      </ScreenContainer>
    </ErrorBoundary>
  );
};

export default HealthPlatformsScreen;