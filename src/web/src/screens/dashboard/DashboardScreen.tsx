import React, { useEffect, useState, useCallback } from 'react';
import styled from '@emotion/styled';
import { useWebSocket } from 'react-use-websocket'; // ^4.3.1
import { useIntersectionObserver } from 'react-intersection-observer'; // ^9.5.2
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.11

import Layout from '../../components/layout/Layout';
import HealthMetricsChart from '../../components/analytics/HealthMetricsChart';
import useHealth from '../../hooks/useHealth';
import useAuth from '../../hooks/useAuth';

// Styled components with enhanced accessibility
const DashboardContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing[4]};
  padding: ${({ theme }) => theme.spacing[4]};
  max-width: 1920px;
  margin: 0 auto;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
  
  position: relative;
  min-height: 100vh;
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

// Custom hook for managing health data with real-time updates
const useHealthData = (securityContext: any) => {
  const {
    metrics,
    loading,
    error,
    fetchMetrics,
    syncData,
    syncStatus,
    retryFailedSync,
    clearCache,
    lastSync
  } = useHealth();

  // WebSocket connection for real-time updates
  const { lastMessage } = useWebSocket(process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws', {
    shouldReconnect: true,
    reconnectAttempts: 5,
    reconnectInterval: 3000,
  });

  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        if (data.type === 'HEALTH_UPDATE') {
          fetchMetrics();
        }
      } catch (error) {
        console.error('WebSocket message parsing error:', error);
      }
    }
  }, [lastMessage, fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    syncData,
    syncStatus,
    retryFailedSync,
    clearCache,
    lastSync
  };
};

// Error handling function with logging
const handleError = (error: Error, context: string) => {
  console.error(`Error in ${context}:`, error);
  // Implement error reporting service integration here
};

// Main dashboard component with security features
const DashboardScreen: React.FC = () => {
  const { user, securityContext } = useAuth();
  const { ref, inView } = useIntersectionObserver();
  const {
    metrics,
    loading,
    error,
    syncData,
    syncStatus,
    retryFailedSync
  } = useHealthData(securityContext);

  const [chartConfig] = useState({
    selectedMetrics: ['HEART_RATE', 'BLOOD_PRESSURE', 'BLOOD_GLUCOSE'],
    showLegend: true,
    enableZoom: true,
    yAxisScale: 'linear',
    aggregationType: 'average'
  });

  const [timeRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date()
  });

  // Handle time range changes with validation
  const handleTimeRangeChange = useCallback((newRange: { startDate: Date; endDate: Date }) => {
    if (newRange.startDate >= newRange.endDate) {
      handleError(new Error('Invalid date range'), 'TimeRangeChange');
      return;
    }
    // Implement time range update logic
  }, []);

  // Initial data fetch with security validation
  useEffect(() => {
    if (user && securityContext.isValid) {
      syncData().catch(error => handleError(error, 'InitialSync'));
    }
  }, [user, securityContext.isValid, syncData]);

  // Render loading state
  if (loading) {
    return (
      <Layout>
        <LoadingOverlay>
          <div role="status" aria-label="Loading dashboard data">
            Loading health metrics...
          </div>
        </LoadingOverlay>
      </Layout>
    );
  }

  // Render error state
  if (error) {
    return (
      <Layout>
        <div role="alert" aria-label="Dashboard error">
          <h2>Error loading dashboard</h2>
          <p>{error}</p>
          <button onClick={() => retryFailedSync()}>Retry</button>
        </div>
      </Layout>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <div role="alert">
          <h2>Dashboard Error</h2>
          <pre>{error.message}</pre>
        </div>
      )}
    >
      <Layout>
        <DashboardContainer ref={ref} data-testid="dashboard-container">
          {/* Health Metrics Chart Section */}
          <section aria-label="Health Metrics Overview">
            <h2>Health Metrics</h2>
            <HealthMetricsChart
              config={chartConfig}
              timeRange={timeRange}
              onTimeRangeChange={handleTimeRangeChange}
            />
          </section>

          {/* Sync Status Section */}
          {syncStatus && (
            <section aria-label="Synchronization Status">
              <h2>Data Synchronization</h2>
              <div>
                <p>Last sync: {syncStatus.lastSyncAt?.toLocaleString()}</p>
                <p>Status: {syncStatus.status}</p>
                {syncStatus.status === 'failed' && (
                  <button 
                    onClick={() => retryFailedSync()}
                    aria-label="Retry failed synchronization"
                  >
                    Retry Sync
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Lazy loaded sections based on visibility */}
          {inView && (
            <>
              {/* Additional dashboard sections */}
            </>
          )}
        </DashboardContainer>
      </Layout>
    </ErrorBoundary>
  );
};

// Export the enhanced dashboard screen component
export default DashboardScreen;