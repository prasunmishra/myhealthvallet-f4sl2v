import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useHealth } from '../../hooks/useHealth';
import { Button } from '../common/Button';
import HealthService from '../../services/health.service';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Toast } from '../common/Toast';

// Platform connection status indicator styling
const StatusIndicator = styled.div<{ status: string }>`
  display: inline-flex;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  background-color: ${({ status, theme }) => 
    status === 'connected' ? theme.colors.success[100] :
    status === 'connecting' ? theme.colors.warning[100] :
    status === 'error' ? theme.colors.error[100] :
    theme.colors.surface[200]};
  color: ${({ status, theme }) => 
    status === 'connected' ? theme.colors.success[700] :
    status === 'connecting' ? theme.colors.warning[700] :
    status === 'error' ? theme.colors.error[700] :
    theme.colors.text[500]};
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const ConnectionDetails = styled.div`
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  border: 1px solid ${({ theme }) => theme.colors.surface[300]};
`;

const SyncProgress = styled.div<{ progress: number }>`
  width: 100%;
  height: 4px;
  background-color: ${({ theme }) => theme.colors.surface[200]};
  border-radius: 2px;
  overflow: hidden;
  margin-top: ${({ theme }) => theme.spacing.SMALL}px;

  &::after {
    content: '';
    display: block;
    width: ${({ progress }) => progress}%;
    height: 100%;
    background-color: ${({ theme }) => theme.colors.primary[500]};
    transition: width 0.3s ease-in-out;
  }
`;

interface HealthPlatformConnectProps {
  platformId: string;
  platformName: string;
  onConnected: (success: boolean, error?: Error) => void;
  retryAttempts?: number;
  timeoutMs?: number;
  complianceLevel?: 'HIPAA' | 'GDPR' | 'BOTH';
}

interface PlatformConnectionState {
  isConnected: boolean;
  lastSyncTime: Date | null;
  error: Error | null;
  retryCount: number;
  syncProgress: number;
  complianceStatus: {
    hipaaCompliant: boolean;
    gdprCompliant: boolean;
    lastValidated: Date | null;
  };
}

const HealthPlatformConnect: React.FC<HealthPlatformConnectProps> = ({
  platformId,
  platformName,
  onConnected,
  retryAttempts = 3,
  timeoutMs = 30000,
  complianceLevel = 'HIPAA'
}) => {
  const [connectionState, setConnectionState] = useState<PlatformConnectionState>({
    isConnected: false,
    lastSyncTime: null,
    error: null,
    retryCount: 0,
    syncProgress: 0,
    complianceStatus: {
      hipaaCompliant: false,
      gdprCompliant: false,
      lastValidated: null
    }
  });

  const { syncData, loading, error } = useHealth();
  const healthService = new HealthService();

  const validatePlatformCompliance = useCallback(async () => {
    try {
      const validationResult = await healthService.validatePlatformAccess({
        platformId,
        complianceLevel
      });

      setConnectionState(prev => ({
        ...prev,
        complianceStatus: {
          hipaaCompliant: validationResult.hipaaCompliant,
          gdprCompliant: validationResult.gdprCompliant,
          lastValidated: new Date()
        }
      }));

      return validationResult.hipaaCompliant && 
        (complianceLevel !== 'GDPR' && complianceLevel !== 'BOTH' || validationResult.gdprCompliant);
    } catch (error) {
      console.error('Platform compliance validation failed:', error);
      return false;
    }
  }, [platformId, complianceLevel, healthService]);

  const handleConnect = useCallback(async () => {
    try {
      setConnectionState(prev => ({
        ...prev,
        error: null,
        syncProgress: 0
      }));

      // Validate platform compliance
      const isCompliant = await validatePlatformCompliance();
      if (!isCompliant) {
        throw new Error(`Platform ${platformName} does not meet required compliance level: ${complianceLevel}`);
      }

      // Initialize platform connection with timeout
      const connectionPromise = healthService.syncHealthPlatform(platformId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
      );

      const result = await Promise.race([connectionPromise, timeoutPromise]);

      // Update connection state
      setConnectionState(prev => ({
        ...prev,
        isConnected: true,
        lastSyncTime: new Date(),
        syncProgress: 100
      }));

      // Trigger initial sync
      await syncData();
      onConnected(true);

    } catch (error) {
      const shouldRetry = connectionState.retryCount < retryAttempts;

      setConnectionState(prev => ({
        ...prev,
        error: error as Error,
        retryCount: shouldRetry ? prev.retryCount + 1 : prev.retryCount,
        isConnected: false,
        syncProgress: 0
      }));

      if (shouldRetry) {
        // Implement exponential backoff
        const backoffDelay = Math.min(1000 * Math.pow(2, connectionState.retryCount), 10000);
        setTimeout(() => handleConnect(), backoffDelay);
      } else {
        onConnected(false, error as Error);
      }
    }
  }, [
    platformId,
    platformName,
    healthService,
    syncData,
    onConnected,
    connectionState.retryCount,
    retryAttempts,
    timeoutMs,
    validatePlatformCompliance
  ]);

  // Monitor connection status
  useEffect(() => {
    if (connectionState.isConnected) {
      const statusCheck = setInterval(async () => {
        try {
          const status = await healthService.checkCompliance(platformId);
          if (!status.isValid) {
            setConnectionState(prev => ({
              ...prev,
              isConnected: false,
              error: new Error('Platform compliance check failed')
            }));
            onConnected(false, new Error('Platform compliance check failed'));
          }
        } catch (error) {
          console.error('Platform status check failed:', error);
        }
      }, 60000); // Check every minute

      return () => clearInterval(statusCheck);
    }
  }, [connectionState.isConnected, platformId, healthService, onConnected]);

  return (
    <ErrorBoundary
      onError={(error) => {
        console.error('HealthPlatformConnect error:', error);
        onConnected(false, error);
      }}
    >
      <div>
        <StatusIndicator 
          status={connectionState.isConnected ? 'connected' : loading ? 'connecting' : 'disconnected'}
          role="status"
          aria-live="polite"
        >
          {connectionState.isConnected ? 'Connected' : loading ? 'Connecting...' : 'Disconnected'}
        </StatusIndicator>

        <Button
          onClick={handleConnect}
          disabled={loading || connectionState.isConnected}
          loading={loading}
          variant="primary"
          aria-label={`Connect to ${platformName}`}
        >
          {connectionState.isConnected ? 'Connected' : 'Connect'} to {platformName}
        </Button>

        {connectionState.isConnected && (
          <ConnectionDetails>
            <p>Last synced: {connectionState.lastSyncTime?.toLocaleString()}</p>
            <p>Compliance status: {
              connectionState.complianceStatus.hipaaCompliant ? 'HIPAA Compliant' : 'Not HIPAA Compliant'
            }</p>
            <SyncProgress progress={connectionState.syncProgress} />
          </ConnectionDetails>
        )}

        {connectionState.error && (
          <Toast
            type="error"
            message={`Connection error: ${connectionState.error.message}`}
            duration={5000}
            onClose={() => setConnectionState(prev => ({ ...prev, error: null }))}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default HealthPlatformConnect;