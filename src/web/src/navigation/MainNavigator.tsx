/**
 * MainNavigator Component
 * Enhanced navigation component for authenticated user flows with security validation,
 * performance monitoring, and accessibility features
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react'; // v18.0.0
import { Subscription, BehaviorSubject } from 'rxjs'; // v7.0.0
import { useErrorBoundary } from 'react-error-boundary'; // v4.0.0
import { SecurityContext } from '@auth0/auth0-react'; // v2.0.0

import { navigationService } from './NavigationService';
import { NavigationState, NavigationRoutes } from '../types/navigation.types';
import { User } from '../types/auth.types';

/**
 * Props interface for MainNavigator component
 */
interface MainNavigatorProps {
  className?: string;
  securityContext: SecurityContext;
  analyticsEnabled: boolean;
}

/**
 * Custom hook for managing navigation state with security validation
 */
const useNavigationState = (securityContext: SecurityContext) => {
  const [navigationState, setNavigationState] = useState<NavigationState>(
    navigationService.getCurrentState()
  );
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    let subscription: Subscription;
    const user = securityContext.user as User;

    const handleNavigationChange = async (state: NavigationState) => {
      setIsValidating(true);
      try {
        const canAccess = await navigationService.canNavigate(
          state.currentRoute,
          user
        );

        if (!canAccess) {
          // Redirect to default route if access is denied
          await navigationService.navigate(
            NavigationRoutes.DASHBOARD,
            {},
            user
          );
          return;
        }

        setNavigationState(state);

        // Log navigation for analytics if enabled
        if (window.performance && window.performance.mark) {
          window.performance.mark(`navigation-${state.currentRoute}`);
        }
      } catch (error) {
        console.error('Navigation state error:', error);
      } finally {
        setIsValidating(false);
      }
    };

    subscription = navigationService
      .getNavigationState$()
      .subscribe(handleNavigationChange);

    return () => {
      subscription?.unsubscribe();
    };
  }, [securityContext]);

  return { navigationState, isValidating };
};

/**
 * Enhanced main navigation component for authenticated user flows
 */
export const MainNavigator: React.FC<MainNavigatorProps> = ({
  className,
  securityContext,
  analyticsEnabled
}) => {
  const { showBoundary } = useErrorBoundary();
  const { navigationState, isValidating } = useNavigationState(securityContext);

  // Memoize route components map for performance
  const routeComponents = useMemo(() => ({
    [NavigationRoutes.DASHBOARD]: React.lazy(() => import('../screens/Dashboard')),
    [NavigationRoutes.ANALYTICS]: React.lazy(() => import('../screens/Analytics')),
    [NavigationRoutes.DOCUMENTS]: React.lazy(() => import('../screens/Documents')),
    [NavigationRoutes.HEALTH_DATA]: React.lazy(() => import('../screens/HealthData')),
    [NavigationRoutes.SETTINGS]: React.lazy(() => import('../screens/Settings')),
    [NavigationRoutes.PROFILE]: React.lazy(() => import('../screens/Profile')),
    [NavigationRoutes.NOTIFICATIONS]: React.lazy(() => import('../screens/Notifications')),
    [NavigationRoutes.HELP]: React.lazy(() => import('../screens/Help')),
    [NavigationRoutes.AUDIT_LOG]: React.lazy(() => import('../screens/AuditLog')),
    [NavigationRoutes.PROVIDER_DASHBOARD]: React.lazy(() => import('../screens/ProviderDashboard'))
  }), []);

  // Handle navigation errors
  const handleError = useCallback((error: Error) => {
    showBoundary(error);
  }, [showBoundary]);

  // Track route transition performance
  useEffect(() => {
    if (analyticsEnabled && window.performance && window.performance.measure) {
      const routeName = navigationState.currentRoute;
      window.performance.measure(
        `navigation-${routeName}-complete`,
        `navigation-${routeName}`
      );
    }
  }, [navigationState.currentRoute, analyticsEnabled]);

  // Render loading state during validation
  if (isValidating) {
    return (
      <div className="navigation-loading" role="alert" aria-busy="true">
        Loading...
      </div>
    );
  }

  const RouteComponent = routeComponents[navigationState.currentRoute];

  return (
    <div 
      className={`main-navigator ${className || ''}`}
      role="main"
      aria-live="polite"
    >
      <React.Suspense
        fallback={
          <div className="route-loading" role="alert" aria-busy="true">
            Loading route...
          </div>
        }
      >
        {RouteComponent && (
          <RouteComponent
            params={navigationState.params}
            onError={handleError}
          />
        )}
      </React.Suspense>
    </div>
  );
};

export default MainNavigator;