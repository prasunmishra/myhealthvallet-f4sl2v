import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from '@axe-core/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { LoginForm } from '../../../../src/components/auth/LoginForm';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock dependencies
jest.mock('../../../../src/hooks/useAuth', () => ({
  useAuth: jest.fn()
}));

// Test utilities
const renderWithProviders = (
  ui: React.ReactElement,
  {
    initialState = {},
    store = configureStore({ reducer: { auth: () => initialState } }),
    ...renderOptions
  } = {}
) => {
  const user = userEvent.setup();
  
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return {
    user,
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions })
  };
};

describe('LoginForm Component', () => {
  // Setup mocks and cleanup
  const mockLogin = jest.fn();
  const mockVerifyMFA = jest.fn();
  const mockOnSuccess = jest.fn();
  const mockOnMFARequired = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default auth hook mock
    require('../../../../src/hooks/useAuth').useAuth.mockImplementation(() => ({
      login: mockLogin,
      verifyMFA: mockVerifyMFA,
      loading: false,
      error: null
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('Authentication Flow Tests', () => {
    it('should handle successful login with email/password', async () => {
      const { user } = renderWithProviders(
        <LoginForm 
          onSuccess={mockOnSuccess}
          onMFARequired={mockOnMFARequired}
          onError={mockOnError}
        />
      );

      // Fill in credentials
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'SecurePass123!');
      
      mockLogin.mockResolvedValueOnce({ success: true });
      
      // Submit form
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'SecurePass123!');
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should handle MFA flow correctly', async () => {
      const { user, rerender } = renderWithProviders(
        <LoginForm 
          onSuccess={mockOnSuccess}
          onMFARequired={mockOnMFARequired}
          onError={mockOnError}
        />
      );

      // Trigger MFA flow
      mockLogin.mockResolvedValueOnce({ requiresMFA: true });
      
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'SecurePass123!');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockOnMFARequired).toHaveBeenCalled();
      });

      // Verify MFA code
      mockVerifyMFA.mockResolvedValueOnce(true);
      
      const mfaInput = screen.getByLabelText(/mfa verification code/i);
      await user.type(mfaInput, '123456');
      await user.click(screen.getByRole('button', { name: /verify mfa code/i }));

      await waitFor(() => {
        expect(mockVerifyMFA).toHaveBeenCalledWith('123456');
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('Security Tests', () => {
    it('should enforce rate limiting after max attempts', async () => {
      const { user } = renderWithProviders(<LoginForm onError={mockOnError} />);

      mockLogin.mockRejectedValue(new Error('Invalid credentials'));

      // Attempt login multiple times
      for (let i = 0; i < 6; i++) {
        await user.type(screen.getByLabelText(/email/i), 'test@example.com');
        await user.type(screen.getByLabelText(/password/i), 'WrongPass123!');
        await user.click(screen.getByRole('button', { name: /sign in/i }));
      }

      await waitFor(() => {
        expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();
        expect(mockOnError).toHaveBeenCalledWith('Too many login attempts. Please try again later.');
      });
    });

    it('should validate password complexity requirements', async () => {
      const { user } = renderWithProviders(<LoginForm />);

      // Test weak password
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'weakpass');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/password must contain/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility Tests', () => {
    it('should meet WCAG 2.1 AAA standards', async () => {
      const { container } = renderWithProviders(<LoginForm />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      const { user } = renderWithProviders(<LoginForm />);

      // Tab through form elements
      await user.tab();
      expect(screen.getByLabelText(/email/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText(/password/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
    });

    it('should announce form errors to screen readers', async () => {
      const { user } = renderWithProviders(<LoginForm />);

      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        const errorMessage = screen.getByRole('alert');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveAttribute('aria-live', 'polite');
      });
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle network failures gracefully', async () => {
      const { user } = renderWithProviders(<LoginForm onError={mockOnError} />);

      mockLogin.mockRejectedValueOnce(new Error('Network error'));

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'SecurePass123!');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Network error');
      });
    });

    it('should handle invalid MFA codes', async () => {
      const { user } = renderWithProviders(<LoginForm />);

      mockLogin.mockResolvedValueOnce({ requiresMFA: true });
      mockVerifyMFA.mockResolvedValueOnce(false);

      // Complete login and attempt MFA
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'SecurePass123!');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        const mfaInput = screen.getByLabelText(/mfa verification code/i);
        expect(mfaInput).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/mfa verification code/i), '000000');
      await user.click(screen.getByRole('button', { name: /verify mfa code/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid mfa code/i)).toBeInTheDocument();
      });
    });
  });
});