import React, { useCallback, useEffect, useMemo } from 'react';
import styled from '@emotion/styled'; // ^11.0.0
import { Icon, IconProps } from '../common/Icon';
import { NavigationService } from '../../navigation/NavigationService';
import { useAuth } from '../../hooks/useAuth';
import { NavigationRoutes } from '../../types/navigation.types';
import { UserRole } from '../../types/auth.types';
import { Theme } from '../../styles/theme';

// Enhanced interface for navigation items with security features
interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  route: NavigationRoutes;
  roles: UserRole[];
  securityLevel: 'low' | 'medium' | 'high';
  hipaaCategory?: string;
  auditLevel: 'none' | 'basic' | 'detailed';
}

interface SidebarProps {
  className?: string;
  securityLevel?: 'low' | 'medium' | 'high';
}

// Styled components with enhanced accessibility and security indicators
const SidebarContainer = styled.nav<{ securityLevel?: string }>`
  width: ${props => props.theme.componentSizes.SIDEBAR_WIDTH}px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background-color: ${props => props.theme.colors.surface[100]};
  border-right: 1px solid ${props => props.theme.colors.surface[300]};
  padding: ${props => props.theme.spacing.MEDIUM}px;
  display: flex;
  flex-direction: column;
  z-index: ${props => props.theme.zIndex.sidebar};
  box-shadow: ${props => props.theme.shadows.sm};
  transition: all 0.2s ease;
  
  &[data-security-level="high"] {
    border-left: 4px solid ${props => props.theme.colors.error[500]};
  }
`;

const NavigationList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
`;

const NavigationItem = styled.li<{ isActive?: boolean }>`
  margin-bottom: ${props => props.theme.spacing.SMALL}px;
`;

const NavigationButton = styled.button<{ isActive?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  padding: ${props => props.theme.spacing.SMALL}px;
  border: none;
  border-radius: ${props => props.theme.shape.borderRadius.md}px;
  background-color: ${props => 
    props.isActive ? props.theme.colors.primary[100] : 'transparent'
  };
  color: ${props => 
    props.isActive ? props.theme.colors.primary[700] : props.theme.colors.text[500]
  };
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: ${props => props.theme.typography.fontFamilies.primary};
  font-size: ${props => props.theme.typography.fontSizes.base};
  font-weight: ${props => props.theme.typography.fontWeights.medium};

  &:hover {
    background-color: ${props => props.theme.colors.surface[200]};
  }

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const IconWrapper = styled.span`
  margin-right: ${props => props.theme.spacing.SMALL}px;
  display: flex;
  align-items: center;
`;

// Navigation items with role-based access control
const navigationItems: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    route: NavigationRoutes.DASHBOARD,
    roles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    securityLevel: 'low',
    auditLevel: 'basic'
  },
  {
    id: 'health-data',
    label: 'Health Data',
    icon: 'health',
    route: NavigationRoutes.HEALTH_DATA,
    roles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT],
    securityLevel: 'high',
    hipaaCategory: 'PHI',
    auditLevel: 'detailed'
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: 'document',
    route: NavigationRoutes.DOCUMENTS,
    roles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    securityLevel: 'high',
    hipaaCategory: 'PHI',
    auditLevel: 'detailed'
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'analytics',
    route: NavigationRoutes.ANALYTICS,
    roles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT],
    securityLevel: 'medium',
    auditLevel: 'basic'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    route: NavigationRoutes.SETTINGS,
    roles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    securityLevel: 'medium',
    auditLevel: 'basic'
  }
];

export const Sidebar: React.FC<SidebarProps> = ({ className, securityLevel = 'low' }) => {
  const { user, isAuthenticated, securityContext } = useAuth();
  const currentRoute = NavigationService.getCurrentRoute();

  // Filter navigation items based on user role and permissions
  const filteredItems = useMemo(() => {
    if (!user || !isAuthenticated) return [];
    
    return navigationItems.filter(item => {
      const hasRole = item.roles.includes(user.role);
      const hasSecurityClearance = 
        securityLevel === 'high' || 
        (securityLevel === 'medium' && item.securityLevel !== 'high') ||
        (securityLevel === 'low' && item.securityLevel === 'low');
      
      return hasRole && hasSecurityClearance;
    });
  }, [user, isAuthenticated, securityLevel]);

  // Enhanced navigation handler with security logging
  const handleNavigation = useCallback(async (item: NavigationItem) => {
    try {
      // Security audit logging
      await NavigationService.logNavigationEvent({
        userId: user?.id,
        route: item.route,
        timestamp: new Date(),
        securityLevel: item.securityLevel,
        hipaaCategory: item.hipaaCategory,
        auditLevel: item.auditLevel
      });

      // Permission validation
      const canNavigate = await NavigationService.canNavigate(item.route, user!);
      if (!canNavigate) {
        throw new Error('Navigation access denied');
      }

      // Execute navigation
      await NavigationService.navigate(item.route, {}, user!);
    } catch (error) {
      console.error('Navigation error:', error);
      // Handle navigation error appropriately
    }
  }, [user]);

  // Monitor security context changes
  useEffect(() => {
    const securityCheck = setInterval(() => {
      if (securityContext && securityContext.securityLevel !== securityLevel) {
        // Handle security level changes
        console.warn('Security level mismatch detected');
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(securityCheck);
  }, [securityContext, securityLevel]);

  return (
    <SidebarContainer 
      className={className}
      data-security-level={securityLevel}
      role="navigation"
      aria-label="Main navigation"
    >
      <NavigationList>
        {filteredItems.map(item => (
          <NavigationItem 
            key={item.id}
            isActive={currentRoute === item.route}
          >
            <NavigationButton
              onClick={() => handleNavigation(item)}
              isActive={currentRoute === item.route}
              aria-current={currentRoute === item.route ? 'page' : undefined}
              data-testid={`nav-item-${item.id}`}
            >
              <IconWrapper>
                <Icon 
                  name={item.icon}
                  size="medium"
                  color={currentRoute === item.route ? 'primary' : 'text'}
                  role="presentation"
                />
              </IconWrapper>
              {item.label}
            </NavigationButton>
          </NavigationItem>
        ))}
      </NavigationList>
    </SidebarContainer>
  );
};

export type { SidebarProps };