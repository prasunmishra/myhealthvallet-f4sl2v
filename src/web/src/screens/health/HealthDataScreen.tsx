import React, { useState, useEffect, useCallback } from 'react';
import styled from '@emotion/styled';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from 'react-use-websocket';

import { HealthDataSync } from '../../components/health/HealthDataSync';
import { HealthMetricInput } from '../../components/health/HealthMetricInput';
import { useHealth } from '../../hooks/useHealth';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { Card } from '../../components/common/Card';
import { Toast } from '../../components/common/Toast';

// Styled components with WCAG 2.1 AAA compliance
const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  max-width: ${({ theme }) => theme.containerWidths.DESKTOP};
  margin: 0 auto;
`;

const Header = styled.header`
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.colors.text[900]};
  font-size: ${({ theme }) => theme.typography.fontSizes.h2};
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

const SyncContainer = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
`;

// WebSocket configuration
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/health';

const HealthDataScreen: React.FC = () => {
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Initialize health data hook with secure configuration
  const {
    metrics,
    loading,
    error,
    fetchMetrics,
    updateMetric,
    syncStatus
  } = useHealth({
    autoSync: true,
    syncInterval: 300000, // 5 minutes
    validateFHIR: true
  });

  // WebSocket connection for real-time updates
  const { sendMessage, lastMessage } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    retryOnError: true
  });

  // Handle sync completion with error handling
  const handleSyncComplete = useCallback((success: boolean, syncedMetrics: any[]) => {
    if (success) {
      setToastMessage('Health data synchronized successfully');
      setToastType('success');
      fetchMetrics({ forceRefresh: true });
    } else {
      setToastMessage('Failed to synchronize health data');
      setToastType('error');
    }
    setShowToast(true);
  }, [fetchMetrics]);

  // Handle metric updates with validation
  const handleMetricUpdate = useCallback(async (metric: any) => {
    try {
      await updateMetric(metric);
      sendMessage(JSON.stringify({
        type: 'METRIC_UPDATE',
        payload: metric
      }));
    } catch (err) {
      setToastMessage('Failed to update health metric');
      setToastType('error');
      setShowToast(true);
    }
  }, [updateMetric, sendMessage]);

  // Process real-time updates
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        if (data.type === 'METRIC_UPDATE') {
          fetchMetrics({ forceRefresh: true });
        }
      } catch (err) {
        console.error('Failed to process WebSocket message:', err);
      }
    }
  }, [lastMessage, fetchMetrics]);

  // Error handling effect
  useEffect(() => {
    if (error) {
      setToastMessage(error.message || 'An error occurred');
      setToastType('error');
      setShowToast(true);
    }
  }, [error]);

  return (
    <ErrorBoundary
      onError={(error) => {
        console.error('HealthDataScreen Error:', error);
        navigate('/error');
      }}
    >
      <Container>
        <Header>
          <Title>Health Data Management</Title>
        </Header>

        <SyncContainer>
          <HealthDataSync
            platform="apple_health"
            onSyncComplete={handleSyncComplete}
            retryAttempts={3}
          />
        </SyncContainer>

        <MetricsGrid>
          {metrics.map((metric) => (
            <Card
              key={metric.id}
              elevation={1}
              testId={`metric-card-${metric.metricType}`}
            >
              <HealthMetricInput
                metricType={metric.metricType}
                value={metric.value}
                unit={metric.unit}
                onChange={handleMetricUpdate}
                validateFHIR={true}
                disabled={loading}
              />
            </Card>
          ))}
        </MetricsGrid>

        {showToast && (
          <Toast
            message={toastMessage}
            type={toastType}
            duration={5000}
            onClose={() => setShowToast(false)}
            position="top-right"
          />
        )}
      </Container>
    </ErrorBoundary>
  );
};

// Wrap component with error boundary and accessibility enhancements
export default React.memo(HealthDataScreen);