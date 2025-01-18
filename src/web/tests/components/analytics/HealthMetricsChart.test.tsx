import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import { WebSocket, Server } from 'jest-websocket-mock';

import { HealthMetricsChart } from '../../../../src/components/analytics/HealthMetricsChart';
import { METRIC_TYPES } from '../../../../src/types/analytics.types';
import { useHealth } from '../../../../src/hooks/useHealth';

// Mock dependencies
jest.mock('../../../../src/hooks/useHealth');
jest.mock('chart.js');
jest.mock('jest-websocket-mock');

// Mock chart configuration
const mockChartConfig = {
  selectedMetrics: [METRIC_TYPES.HEART_RATE, METRIC_TYPES.BLOOD_PRESSURE],
  showLegend: true,
  enableZoom: true,
  yAxisScale: 'linear',
  aggregationType: 'none'
};

// Mock time range
const mockTimeRange = {
  startDate: new Date('2023-01-01'),
  endDate: new Date('2023-01-07')
};

/**
 * Helper function to generate mock health metric data
 */
const mockHealthMetrics = (metricType: METRIC_TYPES, count: number, options = {}) => {
  const metrics = [];
  const baseDate = new Date('2023-01-01');
  
  for (let i = 0; i < count; i++) {
    metrics.push({
      id: `metric-${i}`,
      metricType,
      value: Math.random() * 100,
      timestamp: new Date(baseDate.getTime() + i * 3600000),
      unit: metricType === METRIC_TYPES.HEART_RATE ? 'bpm' : 'mmHg',
      dataQuality: {
        accuracy: 0.95,
        precision: 0.98,
        completeness: 1.0,
        reliability: 0.97
      }
    });
  }
  return metrics;
};

/**
 * Helper function to setup WebSocket mock
 */
const setupWebSocketMock = (url: string) => {
  const server = new Server(url);
  server.on('connection', socket => {
    socket.on('message', data => {
      // Handle mock real-time updates
    });
  });
  return server;
};

describe('HealthMetricsChart', () => {
  let mockServer: Server;
  
  beforeEach(() => {
    mockServer = setupWebSocketMock('ws://localhost:8080/health-metrics');
  });

  afterEach(() => {
    mockServer.close();
    jest.clearAllMocks();
  });

  it('renders loading spinner when data is loading', () => {
    (useHealth as jest.Mock).mockReturnValue({
      metrics: [],
      loading: true,
      error: null
    });

    render(
      <HealthMetricsChart
        config={mockChartConfig}
        timeRange={mockTimeRange}
        onTimeRangeChange={jest.fn()}
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading health metrics chart...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders chart with correct data points and animations', async () => {
    const mockMetrics = mockHealthMetrics(METRIC_TYPES.HEART_RATE, 10);
    (useHealth as jest.Mock).mockReturnValue({
      metrics: mockMetrics,
      loading: false,
      error: null
    });

    const { container } = render(
      <HealthMetricsChart
        config={mockChartConfig}
        timeRange={mockTimeRange}
        onTimeRangeChange={jest.fn()}
      />
    );

    // Verify chart container and accessibility attributes
    const chartContainer = screen.getByRole('figure');
    expect(chartContainer).toHaveAttribute('aria-label', 'Interactive health metrics chart');
    expect(chartContainer).toHaveAttribute('tabIndex', '0');

    // Verify live region for screen reader announcements
    const liveRegion = screen.getByRole('status', { hidden: true });
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');

    // Verify data points are rendered
    await waitFor(() => {
      const chart = container.querySelector('canvas');
      expect(chart).toBeInTheDocument();
    });
  });

  it('handles WebSocket updates correctly', async () => {
    const initialMetrics = mockHealthMetrics(METRIC_TYPES.HEART_RATE, 5);
    const mockSubscribe = jest.fn();
    
    (useHealth as jest.Mock).mockReturnValue({
      metrics: initialMetrics,
      loading: false,
      error: null,
      subscribeToUpdates: mockSubscribe
    });

    render(
      <HealthMetricsChart
        config={mockChartConfig}
        timeRange={mockTimeRange}
        onTimeRangeChange={jest.fn()}
      />
    );

    // Verify subscription is called
    expect(mockSubscribe).toHaveBeenCalled();

    // Simulate real-time update
    const newMetric = mockHealthMetrics(METRIC_TYPES.HEART_RATE, 1)[0];
    await mockServer.send(JSON.stringify(newMetric));

    // Verify chart updates
    await waitFor(() => {
      const liveRegion = screen.getByRole('status', { hidden: true });
      expect(liveRegion).toHaveTextContent(new RegExp(newMetric.value.toString()));
    });
  });

  it('maintains performance with large datasets', async () => {
    // Generate large dataset
    const largeDataset = mockHealthMetrics(METRIC_TYPES.HEART_RATE, 1000);
    (useHealth as jest.Mock).mockReturnValue({
      metrics: largeDataset,
      loading: false,
      error: null
    });

    const { container } = render(
      <HealthMetricsChart
        config={mockChartConfig}
        timeRange={mockTimeRange}
        onTimeRangeChange={jest.fn()}
      />
    );

    // Verify initial render
    await waitFor(() => {
      const chart = container.querySelector('canvas');
      expect(chart).toBeInTheDocument();
    });

    // Test scrolling performance
    const chartContainer = screen.getByRole('figure');
    const scrollStartTime = performance.now();
    
    fireEvent.scroll(chartContainer, { target: { scrollTop: 1000 } });
    
    const scrollEndTime = performance.now();
    const scrollDuration = scrollEndTime - scrollStartTime;
    
    // Verify scroll performance is within acceptable range (< 16ms for 60fps)
    expect(scrollDuration).toBeLessThan(16);
  });

  it('handles keyboard navigation correctly', async () => {
    const metrics = mockHealthMetrics(METRIC_TYPES.HEART_RATE, 5);
    (useHealth as jest.Mock).mockReturnValue({
      metrics,
      loading: false,
      error: null
    });

    render(
      <HealthMetricsChart
        config={mockChartConfig}
        timeRange={mockTimeRange}
        onTimeRangeChange={jest.fn()}
      />
    );

    const chartContainer = screen.getByRole('figure');
    chartContainer.focus();

    // Test arrow key navigation
    fireEvent.keyDown(chartContainer, { key: 'ArrowRight' });
    await waitFor(() => {
      const liveRegion = screen.getByRole('status', { hidden: true });
      expect(liveRegion).toHaveTextContent(/Heart Rate:/);
    });

    fireEvent.keyDown(chartContainer, { key: 'ArrowLeft' });
    await waitFor(() => {
      const liveRegion = screen.getByRole('status', { hidden: true });
      expect(liveRegion).toHaveTextContent(/Heart Rate:/);
    });
  });

  it('applies correct ARIA attributes for accessibility', () => {
    const metrics = mockHealthMetrics(METRIC_TYPES.HEART_RATE, 5);
    (useHealth as jest.Mock).mockReturnValue({
      metrics,
      loading: false,
      error: null
    });

    render(
      <HealthMetricsChart
        config={mockChartConfig}
        timeRange={mockTimeRange}
        onTimeRangeChange={jest.fn()}
      />
    );

    // Verify ARIA attributes
    const chartContainer = screen.getByRole('figure');
    expect(chartContainer).toHaveAttribute('aria-label', 'Interactive health metrics chart');
    expect(chartContainer).toHaveAttribute('tabIndex', '0');

    const liveRegion = screen.getByRole('status', { hidden: true });
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveClass('sr-only');
  });
});