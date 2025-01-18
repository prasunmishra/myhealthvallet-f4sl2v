import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import axe from 'axe-core';
import { DashboardScreen } from '../../../../src/screens/dashboard/DashboardScreen';
import { useHealth } from '../../../../src/hooks/useHealth';

// Mock dependencies
jest.mock('../../../../src/hooks/useHealth');
jest.mock('react-use-websocket', () => ({
  useWebSocket: () => ({
    lastMessage: null,
    sendMessage: jest.fn(),
  }),
}));

// Mock store configuration
const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      health: (state = initialState) => state,
    },
    preloadedState: initialState,
  });
};

// Mock health metrics data
const mockHealthMetrics = [
  {
    id: 'metric1',
    metricType: 'HEART_RATE',
    value: 75,
    unit: 'bpm',
    timestamp: '2023-01-01T00:00:00Z',
    source: 'APPLE_HEALTH',
    dataQuality: {
      accuracy: 0.95,
      precision: 0.98,
      completeness: 1.0,
      reliability: 0.97
    },
    metadata: {
      deviceId: 'device123',
      sessionId: 'session456'
    }
  }
];

// Helper function to render component with providers
const renderWithProviders = (
  ui: React.ReactElement,
  {
    initialState = {},
    store = createTestStore(initialState),
    ...renderOptions
  } = {}
) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );
  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

describe('DashboardScreen Component', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementation for useHealth
    (useHealth as jest.Mock).mockImplementation(() => ({
      metrics: mockHealthMetrics,
      loading: false,
      error: null,
      fetchMetrics: jest.fn(),
      syncData: jest.fn(),
      syncStatus: { status: 'completed' },
      retryFailedSync: jest.fn(),
      clearCache: jest.fn(),
      lastSync: new Date()
    }));
  });

  it('meets accessibility standards', async () => {
    const { container } = renderWithProviders(<DashboardScreen />);
    
    // Run axe accessibility tests
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
    
    // Test keyboard navigation
    const dashboardContainer = screen.getByTestId('dashboard-container');
    expect(dashboardContainer).toHaveAttribute('role', 'main');
    
    // Verify focus management
    const chartSection = screen.getByLabelText('Health Metrics Overview');
    fireEvent.tab();
    expect(chartSection).toHaveFocus();
  });

  it('maintains HIPAA compliance for health data display', async () => {
    renderWithProviders(<DashboardScreen />);
    
    // Verify data encryption indicators
    const secureDataElements = screen.getAllByTestId(/^encrypted-data-/);
    secureDataElements.forEach(element => {
      expect(element).toHaveAttribute('data-security-level', 'encrypted');
    });
    
    // Check PHI masking
    const sensitiveData = screen.queryByTestId('patient-identifier');
    expect(sensitiveData).not.toBeInTheDocument();
    
    // Verify audit logging
    const auditElements = screen.getAllByTestId(/^audit-log-/);
    expect(auditElements.length).toBeGreaterThan(0);
  });

  it('handles real-time health metric updates securely', async () => {
    const mockWebSocket = {
      lastMessage: JSON.stringify({
        type: 'HEALTH_UPDATE',
        data: {
          metricId: 'metric1',
          value: 78,
          timestamp: '2023-01-01T00:01:00Z'
        }
      })
    };

    (useHealth as jest.Mock).mockImplementation(() => ({
      ...jest.requireActual('../../../../src/hooks/useHealth'),
      metrics: mockHealthMetrics,
      loading: false
    }));

    renderWithProviders(<DashboardScreen />);

    // Verify secure data transmission
    await waitFor(() => {
      const metricValue = screen.getByTestId('metric-value-heart-rate');
      expect(metricValue).toHaveTextContent('78');
      expect(metricValue).toHaveAttribute('data-encrypted', 'true');
    });

    // Check update frequency compliance
    const updates = await screen.findAllByTestId('metric-update-timestamp');
    updates.forEach(update => {
      const timestamp = new Date(update.getAttribute('data-timestamp') || '');
      expect(Date.now() - timestamp.getTime()).toBeLessThan(5000); // 5s threshold
    });
  });

  it('displays loading state appropriately', () => {
    (useHealth as jest.Mock).mockImplementation(() => ({
      metrics: [],
      loading: true,
      error: null
    }));

    renderWithProviders(<DashboardScreen />);
    
    expect(screen.getByRole('status')).toHaveTextContent('Loading health metrics...');
    expect(screen.getByLabelText('Loading dashboard data')).toBeInTheDocument();
  });

  it('handles error states with retry capability', async () => {
    const mockError = 'Failed to fetch health metrics';
    const mockRetrySync = jest.fn();

    (useHealth as jest.Mock).mockImplementation(() => ({
      metrics: [],
      loading: false,
      error: mockError,
      retryFailedSync: mockRetrySync
    }));

    renderWithProviders(<DashboardScreen />);
    
    // Verify error display
    expect(screen.getByRole('alert')).toHaveTextContent(mockError);
    
    // Test retry functionality
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(mockRetrySync).toHaveBeenCalled();
  });

  it('renders health metrics chart with correct data', async () => {
    renderWithProviders(<DashboardScreen />);
    
    // Verify chart rendering
    const chartSection = screen.getByLabelText('Health Metrics Overview');
    expect(chartSection).toBeInTheDocument();
    
    // Check metric display
    const metricElements = await screen.findAllByTestId(/^metric-value-/);
    expect(metricElements).toHaveLength(mockHealthMetrics.length);
    
    // Verify data quality indicators
    mockHealthMetrics.forEach(metric => {
      const qualityIndicator = screen.getByTestId(`quality-indicator-${metric.id}`);
      expect(qualityIndicator).toHaveAttribute(
        'data-quality',
        metric.dataQuality.accuracy.toString()
      );
    });
  });

  it('syncs data with external platforms securely', async () => {
    const mockSyncData = jest.fn();
    (useHealth as jest.Mock).mockImplementation(() => ({
      metrics: mockHealthMetrics,
      loading: false,
      syncData: mockSyncData,
      syncStatus: { status: 'pending' }
    }));

    renderWithProviders(<DashboardScreen />);
    
    // Verify sync status display
    const syncSection = screen.getByLabelText('Synchronization Status');
    expect(syncSection).toBeInTheDocument();
    
    // Test sync functionality
    await waitFor(() => {
      expect(mockSyncData).toHaveBeenCalled();
    });
    
    // Verify secure sync completion
    const syncStatus = screen.getByText(/Status:/);
    expect(syncStatus).toHaveTextContent('pending');
  });
});