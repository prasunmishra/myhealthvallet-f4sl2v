import React, { useEffect, useState, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { NavigationService } from '../../navigation/NavigationService';
import { ROUTE_PATHS, ROUTE_PERMISSIONS, NavigationAudit } from '../../constants/navigation.constants';
import { useAuth } from '../../hooks/useAuth';
import { Icon } from '../common/Icon';
import { ErrorBoundary } from '../common/ErrorBoundary';

// Navigation item interface with accessibility properties
interface NavigationItem {
  route: string;
  icon: string;
  label: string;
  ariaLabel: string;
  testId: string;
}

// Styled components with WCAG AAA compliance
const NavigationContainer = styled.nav`
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: ${({ theme }) => theme.componentSizes.BOTTOM_NAV_HEIGHT}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  border-top: 1px solid ${({ theme }) => theme.colors.surface[300]};
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: ${({ theme }) => theme.zIndex.navigation};
  transition: transform 0.3s ease;
  user-select: none;
  touch-action: manipulation;

  @media (prefers-color-scheme: dark) {
    background-color: ${({ theme }) => theme.colors.surface[800]};
    border-color: ${({ theme }) => theme.colors.surface[600]};
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.TABLET}px) {
    display: none;
  }
`;

const NavigationItem = styled.button<{ isActive: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  color: ${({ theme, isActive }) => 
    isActive ? theme.colors.primary[500] : theme.colors.text[500]};
  background: none;
  border: none;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  gap: 4px;
  cursor: pointer;
  transition: color 0.2s ease;
  min-width: 48px;
  min-height: 48px;
  position: relative;
  outline: none;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: -2px;
  }

  &:active {
    transform: scale(0.95);
  }
`;

const Label = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-weight: ${({ theme }) => theme.typography.fontWeights.medium};
  line-height: 1.2;
  text-align: center;
`;

// Navigation items configuration
const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    route: ROUTE_PATHS.DASHBOARD.path,
    icon: 'dashboard',
    label: 'Dashboard',
    ariaLabel: 'Navigate to Dashboard',
    testId: 'nav-dashboard'
  },
  {
    route: ROUTE_PATHS.DOCUMENTS.path,
    icon: 'document',
    label: 'Records',
    ariaLabel: 'Navigate to Health Records',
    testId: 'nav-records'
  },
  {
    route: ROUTE_PATHS.HEALTH_DATA.path,
    icon: 'health',
    label: 'Health',
    ariaLabel: 'Navigate to Health Data',
    testId: 'nav-health'
  },
  {
    route: ROUTE_PATHS.ANALYTICS.path,
    icon: 'analytics',
    label: 'Analytics',
    ariaLabel: 'Navigate to Analytics',
    testId: 'nav-analytics'
  },
  {
    route: ROUTE_PATHS.SETTINGS.path,
    icon: 'settings',
    label: 'Settings',
    ariaLabel: 'Navigate to Settings',
    testId: 'nav-settings'
  }
];

const BottomNavigation: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<string>('');
  const [permittedItems, setPermittedItems] = useState<NavigationItem[]>([]);
  const { user, roles } = useAuth();
  const navigationService = useRef(NavigationService.getInstance());
  const auditLogger = useRef(new NavigationAudit());

  // Filter navigation items based on user permissions
  useEffect(() => {
    if (user && roles) {
      const filteredItems = NAVIGATION_ITEMS.filter(item => {
        const routePermissions = ROUTE_PERMISSIONS[item.route];
        return routePermissions?.allowedRoles.some(role => roles.includes(role));
      });
      setPermittedItems(filteredItems);
    }
  }, [user, roles]);

  // Subscribe to navigation state changes
  useEffect(() => {
    const subscription = navigationService.current.getNavigationState$().subscribe(
      state => {
        setCurrentRoute(state.currentRoute);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Handle navigation with error handling and audit logging
  const handleNavigation = useCallback(async (item: NavigationItem) => {
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      const success = await navigationService.current.navigate(
        item.route,
        {},
        user
      );

      if (success) {
        auditLogger.current.logNavigation({
          userId: user.id,
          route: item.route,
          timestamp: new Date(),
          success: true
        });
      }
    } catch (error) {
      auditLogger.current.logNavigation({
        userId: user?.id,
        route: item.route,
        timestamp: new Date(),
        success: false,
        error: error.message
      });
    }
  }, [user]);

  // Keyboard navigation handler
  const handleKeyPress = useCallback((
    event: React.KeyboardEvent,
    item: NavigationItem
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNavigation(item);
    }
  }, [handleNavigation]);

  return (
    <ErrorBoundary>
      <NavigationContainer
        role="navigation"
        aria-label="Main Navigation"
        data-testid="bottom-navigation"
      >
        {permittedItems.map((item) => (
          <NavigationItem
            key={item.route}
            onClick={() => handleNavigation(item)}
            onKeyPress={(e) => handleKeyPress(e, item)}
            isActive={currentRoute === item.route}
            aria-label={item.ariaLabel}
            aria-current={currentRoute === item.route ? 'page' : undefined}
            data-testid={item.testId}
          >
            <Icon
              name={item.icon}
              size="small"
              color="currentColor"
              aria-hidden="true"
            />
            <Label>{item.label}</Label>
          </NavigationItem>
        ))}
      </NavigationContainer>
    </ErrorBoundary>
  );
};

export default BottomNavigation;