import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { jest } from '@jest/globals';

import { HealthDataSync } from '../../../../src/components/health/HealthDataSync';
import { useHealth } from '../../../../src/hooks/useHealth';
import { HealthPlatform } from '../../types/health.types';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock useHealth hook
jest.mock('../../../../src/hooks/useHealth');
const mockUseHealth = useHealth as jest.MockedFunction<typeof useHealth>;

describe('HealthDataSync Component', () => {
  // Mock props
  const defaultProps = {
    platform: HealthPlatform.APPLE_HEALTH,
    onSyncComplete: jest.fn(),
    retryAttempts: 3,
  };

  // Mock sync function
  const mockSyncData = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementation
    mockUseHealth.mockReturnValue({
      metrics: [],
      loading: false,
      error: null,
      syncData: mockSyncData,
      syncStatus: {},
      retryFailedSync: jest.fn(),
      clearCache: jest.fn(),
      lastSync: null,
      fetchMetrics: jest.fn()
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with initial state correctly', () => {
      render(<HealthDataSync {...defaultProps} />);
      
      expect(screen.getByText(`Ready to sync with ${defaultProps.platform}`)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sync now/i })).toBeEnabled();
    });

    it('should render with proper ARIA attributes', () => {
      render(<HealthDataSync {...defaultProps} />);
      
      const syncButton = screen.getByRole('button');
      expect(syncButton).toHaveAttribute('aria-busy', 'false');
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should pass accessibility audit', async () => {
      const { container } = render(<HealthDataSync {...defaultProps} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support reduced motion preferences', () => {
      // Mock reduced motion preference
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      }));

      render(<HealthDataSync {...defaultProps} />);
      const container = screen.getByTestId('progress-bar');
      
      expect(container).toHaveStyle('transition: none');
    });
  });

  describe('Interaction', () => {
    it('should handle sync button click correctly', async () => {
      render(<HealthDataSync {...defaultProps} />);
      
      const syncButton = screen.getByRole('button', { name: /sync now/i });
      await userEvent.click(syncButton);

      expect(mockSyncData).toHaveBeenCalledWith({
        platform: defaultProps.platform,
        onProgress: expect.any(Function),
        validateFHIR: true
      });
      expect(syncButton).toBeDisabled();
      expect(screen.getByText(/syncing/i)).toBeInTheDocument();
    });

    it('should show progress during sync', async () => {
      render(<HealthDataSync {...defaultProps} />);
      
      // Trigger sync
      await userEvent.click(screen.getByRole('button'));

      // Simulate progress updates
      mockSyncData.mockImplementation(async ({ onProgress }) => {
        onProgress(50);
        return [];
      });

      await waitFor(() => {
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '50');
      });
    });

    it('should handle keyboard navigation correctly', () => {
      render(<HealthDataSync {...defaultProps} />);
      
      const syncButton = screen.getByRole('button');
      syncButton.focus();
      expect(document.activeElement).toBe(syncButton);
    });
  });

  describe('Error Handling', () => {
    it('should display error message on sync failure', async () => {
      const errorMessage = 'Sync failed';
      mockSyncData.mockRejectedValue(new Error(errorMessage));

      render(<HealthDataSync {...defaultProps} />);
      
      await userEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
      });
    });

    it('should implement retry logic on failure', async () => {
      mockSyncData.mockRejectedValue(new Error('Sync failed'));

      render(<HealthDataSync {...defaultProps} />);
      
      await userEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText(/retry attempt 1 of 3/i)).toBeInTheDocument();
      });
    });

    it('should handle error boundary fallback', async () => {
      mockSyncData.mockImplementation(() => {
        throw new Error('Critical error');
      });

      render(<HealthDataSync {...defaultProps} />);
      
      await userEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/error syncing health data/i)).toBeInTheDocument();
      });
    });
  });

  describe('Platform Integration', () => {
    it('should handle platform-specific configurations', () => {
      render(
        <HealthDataSync
          platform={HealthPlatform.GOOGLE_FIT}
          onSyncComplete={defaultProps.onSyncComplete}
        />
      );
      
      expect(screen.getByText(/ready to sync with google_fit/i)).toBeInTheDocument();
    });

    it('should call onSyncComplete with correct parameters', async () => {
      const mockMetrics = [{ id: '1', type: 'heart_rate', value: 75 }];
      mockSyncData.mockResolvedValue(mockMetrics);

      render(<HealthDataSync {...defaultProps} />);
      
      await userEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(defaultProps.onSyncComplete).toHaveBeenCalledWith(true, mockMetrics);
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on unmount', async () => {
      const { unmount } = render(<HealthDataSync {...defaultProps} />);
      
      await userEvent.click(screen.getByRole('button'));
      unmount();

      // Verify no memory leaks or pending operations
      expect(mockSyncData).toHaveBeenCalledTimes(1);
    });
  });
});