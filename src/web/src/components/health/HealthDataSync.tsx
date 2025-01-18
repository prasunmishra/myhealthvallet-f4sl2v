import React, { useState, useCallback, useEffect, memo } from 'react'; // ^18.2.0
import styled from '@emotion/styled'; // ^11.11.0
import { useReducedMotion } from 'framer-motion'; // ^10.12.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0

import { useHealth } from '../../hooks/useHealth';
import { ProgressBar } from '../common/ProgressBar';
import { HealthPlatform } from '../../types/health.types';

// Props interface with platform configuration
interface HealthDataSyncProps {
  platform: HealthPlatform;
  onSyncComplete?: (success: boolean, metrics: any[]) => void;
  retryAttempts?: number;
  className?: string;
}

// Styled components with accessibility support
const SyncContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.surface[200]};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  transition: all 0.3s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const StatusText = styled.p<{ error?: boolean }>`
  color: ${({ theme, error }) => error ? theme.colors.error[500] : theme.colors.text[500]};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  margin-bottom: 8px;
  font-weight: ${({ error }) => error ? 600 : 400};
  role: status;
  aria-live: polite;
`;

const SyncButton = styled.button<{ syncing?: boolean }>`
  padding: 8px 16px;
  border-radius: 4px;
  background-color: ${({ theme, syncing }) => 
    syncing ? theme.colors.primary[300] : theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.text[100]};
  border: none;
  cursor: ${({ syncing }) => syncing ? 'not-allowed' : 'pointer'};
  opacity: ${({ syncing }) => syncing ? 0.7 : 1};
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.colors.primary[600]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[400]};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <div role="alert">
    <StatusText error>Error syncing health data: {error.message}</StatusText>
    <SyncButton onClick={resetErrorBoundary}>Retry Sync</SyncButton>
  </div>
);

export const HealthDataSync: React.FC<HealthDataSyncProps> = memo(({
  platform,
  onSyncComplete,
  retryAttempts = 3,
  className
}) => {
  // Custom hooks
  const { metrics, syncData, error: syncError } = useHealth();
  const prefersReducedMotion = useReducedMotion();

  // Local state
  const [syncProgress, setSyncProgress] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Handle sync process with retry logic
  const handleSync = useCallback(async () => {
    if (isSyncing) return;

    try {
      setIsSyncing(true);
      setError(null);
      setSyncProgress(0);

      // Start sync with progress tracking
      const result = await syncData({
        platform,
        onProgress: (progress) => {
          setSyncProgress(progress);
        },
        validateFHIR: true
      });

      // Handle successful sync
      setSyncProgress(100);
      onSyncComplete?.(true, result);
      setRetryCount(0);

    } catch (err) {
      setError(err.message);
      
      // Handle retry logic
      if (retryCount < retryAttempts) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          handleSync();
        }, Math.pow(2, retryCount) * 1000); // Exponential backoff
      } else {
        onSyncComplete?.(false, []);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [platform, syncData, onSyncComplete, retryCount, retryAttempts, isSyncing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setIsSyncing(false);
      setSyncProgress(0);
    };
  }, []);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => setError(null)}>
      <SyncContainer className={className}>
        <StatusText error={!!error}>
          {error ? `Error: ${error}` :
           isSyncing ? `Syncing with ${platform}...` :
           `Ready to sync with ${platform}`}
        </StatusText>

        {isSyncing && (
          <ProgressBar
            value={syncProgress}
            animated={!prefersReducedMotion}
            aria-label={`Sync progress: ${syncProgress}%`}
          />
        )}

        <SyncButton
          onClick={handleSync}
          disabled={isSyncing}
          syncing={isSyncing}
          aria-busy={isSyncing}
        >
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </SyncButton>

        {retryCount > 0 && (
          <StatusText>
            Retry attempt {retryCount} of {retryAttempts}
          </StatusText>
        )}
      </SyncContainer>
    </ErrorBoundary>
  );
});

HealthDataSync.displayName = 'HealthDataSync';

export default HealthDataSync;