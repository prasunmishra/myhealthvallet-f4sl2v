/**
 * Root navigation component with enhanced security and HIPAA compliance features
 * Manages authentication state and renders appropriate navigator based on auth status
 * @version 1.0.0
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Subscription } from 'rxjs';
import { performance } from 'perf_hooks';
import { ErrorBoundary } from 'react-error-boundary';
import { SecurityContext } from '@company/security-context';
import { AuditLogger } from '@company/audit-logger';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import NavigationService from './NavigationService';
import { useAuth } from '../hooks/useAuth';

// Initialize HIPAA-compliant audit logger
const auditLogger = new AuditLogger({
  service: 'navigation',
  hipaaCompliant: true
});

/**
 * Props interface for AppNavigator component
 */
interface AppNavigatorProps {
  className?: string;
  securityLevel: SecurityLevel;
  auditEnabled: boolean;
}

/**
 * Interface for navigation state management
 */
interface NavigationState {
  currentRoute: string;
  previousRoute: string | null;
  timestamp: number;
  securityContext: SecurityContext;
}

/**
 * Error boundary fallback component
 */
const NavigationErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div role="alert" className="navigation-error">
    <h2>Navigation Error</h2>
    <p>An error occurred while navigating. Please try again.</p>
    {process.env.NODE_ENV !== 'production' && (
      <pre>{error.message}</pre>
    )}
  </div>
);

/**
 * Enhanced AppNavigator component with security and monitoring features
 */
export const AppNavigator: React.FC<AppNavigatorProps> = ({
  className,
  securityLevel,
  auditEnabled = true
}) => {
  const [navigationSubscription, setNavigationSubscription] = useState<Subscription>();
  const { isAuthenticated, authState } = useAuth();
  const [securityContext, setSecurityContext] = useState<SecurityContext>();

  // Initialize security context
  useEffect(() => {
    const context = new SecurityContext({
      level: securityLevel,
      enforceHIPAA: true,
      auditEnabled: auditEnabled
    });
    setSecurityContext(context);
  }, [securityLevel, auditEnabled]);

  // Monitor navigation performance
  const startNavigationMonitoring = useCallback(() => {
    if (performance && performance.mark) {
      performance.mark('navigation-start');
    }
  }, []);

  const endNavigationMonitoring = useCallback((route: string) => {
    if (performance && performance.mark) {
      performance.mark('navigation-end');
      performance.measure(
        `navigation-to-${route}`,
        'navigation-start',
        'navigation-end'
      );
    }
  }, []);

  // Subscribe to navigation state changes
  useEffect(() => {
    if (!securityContext) return;

    const subscription = NavigationService.navigationState$.subscribe(
      async (state: NavigationState) => {
        try {
          startNavigationMonitoring();

          // Log navigation event for HIPAA compliance
          if (auditEnabled) {
            await auditLogger.log({
              event: 'NAVIGATION',
              from: state.previousRoute,
              to: state.currentRoute,
              userId: authState?.user?.id,
              timestamp: new Date(),
              securityContext: securityContext
            });
          }

          endNavigationMonitoring(state.currentRoute);
        } catch (error) {
          console.error('Navigation monitoring error:', error);
        }
      }
    );

    setNavigationSubscription(subscription);

    return () => {
      subscription?.unsubscribe();
    };
  }, [securityContext, auditEnabled, authState, startNavigationMonitoring, endNavigationMonitoring]);

  // Handle navigation errors
  const handleNavigationError = useCallback((error: Error) => {
    auditLogger.error('Navigation error occurred', {
      error: error.message,
      userId: authState?.user?.id,
      timestamp: new Date()
    });
  }, [authState]);

  // Memoize security props for child navigators
  const securityProps = useMemo(() => ({
    securityContext,
    analyticsEnabled: auditEnabled
  }), [securityContext, auditEnabled]);

  return (
    <ErrorBoundary
      FallbackComponent={NavigationErrorFallback}
      onError={handleNavigationError}
    >
      <div 
        className={`app-navigator ${className || ''}`}
        role="navigation"
        aria-live="polite"
      >
        {isAuthenticated ? (
          <MainNavigator
            className="main-navigator"
            {...securityProps}
          />
        ) : (
          <AuthNavigator
            className="auth-navigator"
            {...securityProps}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AppNavigator;