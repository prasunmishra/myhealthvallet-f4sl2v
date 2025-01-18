import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Subscription, BehaviorSubject } from 'rxjs';
import { useA11y } from '@react-aria/utils';
import { SecurityContext } from '@auth0/security-context';
import { ErrorBoundary } from 'react-error-boundary';

import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import NavigationService from './NavigationService';

// Constants for navigation states
const AUTH_ROUTES = {
  LOGIN: '/login',
  SIGNUP: '/signup',
  RESET_PASSWORD: '/reset-password',
  MFA_SETUP: '/mfa-setup'
} as const;

// Interface for navigation state
interface AuthNavigationState {
  currentRoute: string;
  previousRoute: string | null;
  params: Record<string, unknown>;
  securityContext: SecurityContext;
}

/**
 * Enhanced AuthNavigator component with HIPAA compliance and security controls
 */
const AuthNavigator: React.FC = () => {
  // State management
  const [navigationState, setNavigationState] = useState<AuthNavigationState>({
    currentRoute: AUTH_ROUTES.LOGIN,
    previousRoute: null,
    params: {},
    securityContext: {}
  });

  // Refs for subscriptions and security context
  const navigationSubscription = useRef<Subscription>();
  const securityContext = useRef<SecurityContext>();

  // Accessibility hooks
  const { focusWithin } = useA11y();

  /**
   * Initialize security context and navigation subscriptions
   */
  useEffect(() => {
    securityContext.current = new SecurityContext({
      validateRouteAccess: true,
      enforceHIPAA: true,
      auditNavigationEvents: true
    });

    navigationSubscription.current = NavigationService.navigationState$.subscribe(
      async (state) => {
        try {
          // Validate route security before navigation
          const isRouteValid = await NavigationService.validateRoute(
            state.currentRoute,
            securityContext.current
          );

          if (!isRouteValid) {
            throw new Error('Invalid route access attempted');
          }

          // Log navigation event for audit trail
          await NavigationService.logNavigationEvent({
            from: navigationState.currentRoute,
            to: state.currentRoute,
            timestamp: new Date(),
            securityContext: securityContext.current
          });

          setNavigationState({
            currentRoute: state.currentRoute,
            previousRoute: navigationState.currentRoute,
            params: state.params,
            securityContext: securityContext.current
          });

        } catch (error) {
          console.error('Navigation security error:', error);
          // Redirect to login on security violation
          NavigationService.navigate(AUTH_ROUTES.LOGIN, {}, null);
        }
      }
    );

    return () => {
      navigationSubscription.current?.unsubscribe();
    };
  }, []);

  /**
   * Render appropriate authentication screen based on current route
   */
  const renderAuthScreen = useCallback(() => {
    switch (navigationState.currentRoute) {
      case AUTH_ROUTES.LOGIN:
        return <LoginScreen />;
      case AUTH_ROUTES.SIGNUP:
        return <SignupScreen />;
      default:
        return <LoginScreen />;
    }
  }, [navigationState.currentRoute]);

  /**
   * Error boundary fallback for navigation errors
   */
  const handleNavigationError = useCallback((error: Error) => {
    console.error('Auth navigation error:', error);
    NavigationService.navigate(AUTH_ROUTES.LOGIN, {}, null);
    return (
      <div role="alert" aria-live="assertive">
        An error occurred during navigation. Redirecting to login...
      </div>
    );
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => handleNavigationError(error)}
      onError={(error) => {
        NavigationService.logNavigationEvent({
          type: 'ERROR',
          error: error.message,
          timestamp: new Date(),
          securityContext: securityContext.current
        });
      }}
    >
      <main
        role="main"
        aria-live="polite"
        {...focusWithin}
      >
        {renderAuthScreen()}
      </main>
    </ErrorBoundary>
  );
};

export default AuthNavigator;