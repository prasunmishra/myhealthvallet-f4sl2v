import React, { useState, useCallback, useEffect, memo } from 'react';
import styled from '@emotion/styled';
import useMediaQuery from '@mui/material/useMediaQuery';
import Button from '../common/Button';
import Icon from '../common/Icon';
import BiometricPrompt from '../auth/BiometricPrompt';
import { useAuth } from '../../hooks/useAuth';
import { COMPONENT_SIZES, BREAKPOINTS } from '../../styles/dimensions';

// Props interface with accessibility and internationalization support
interface HeaderProps {
  onMenuClick: () => void;
  className?: string;
  dir?: 'ltr' | 'rtl';
  theme?: 'light' | 'dark' | 'system';
}

// Styled components with WCAG 2.1 AAA compliance
const HeaderContainer = styled.header<{ isRTL: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: ${COMPONENT_SIZES.HEADER_HEIGHT}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 ${({ theme }) => theme.spacing.LARGE}px;
  z-index: ${({ theme }) => theme.zIndex.header};
  direction: ${({ isRTL }) => isRTL ? 'rtl' : 'ltr'};
  transition: all 0.3s ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (forced-colors: active) {
    border-bottom: 1px solid ButtonText;
  }
`;

const LogoSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const NavigationSection = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;

  @media (max-width: ${BREAKPOINTS.TABLET}px) {
    display: none;
  }
`;

const ActionSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const NotificationBadge = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: ${({ theme }) => theme.colors.error[500]};
  color: ${({ theme }) => theme.colors.text[100]};
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
`;

const Header = memo<HeaderProps>(({
  onMenuClick,
  className,
  dir = 'ltr',
  theme: themeMode = 'system'
}) => {
  const [isBiometricPromptOpen, setIsBiometricPromptOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.TABLET}px)`);
  const isRTL = dir === 'rtl';
  
  const {
    isAuthenticated,
    user,
    logout,
    sessionTimeout,
    authenticateWithBiometrics
  } = useAuth();

  // Handle session timeout warnings
  useEffect(() => {
    if (isAuthenticated) {
      const timeoutWarning = setTimeout(() => {
        if (sessionTimeout.getRemainingTime() < 5 * 60 * 1000) { // 5 minutes
          setIsBiometricPromptOpen(true);
        }
      }, sessionTimeout.getRemainingTime() - (5 * 60 * 1000));

      return () => clearTimeout(timeoutWarning);
    }
  }, [isAuthenticated, sessionTimeout]);

  // Handle biometric authentication
  const handleBiometricAuth = useCallback(async () => {
    try {
      const result = await authenticateWithBiometrics();
      if (result.success) {
        sessionTimeout.reset();
        setIsBiometricPromptOpen(false);
      }
    } catch (error) {
      console.error('Biometric authentication failed:', error);
    }
  }, [authenticateWithBiometrics, sessionTimeout]);

  // Handle user logout
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout]);

  return (
    <HeaderContainer 
      className={className}
      isRTL={isRTL}
      role="banner"
      aria-label="Main header"
    >
      <LogoSection>
        {isMobile && (
          <Button
            variant="text"
            onClick={onMenuClick}
            ariaLabel="Toggle navigation menu"
          >
            <Icon name="menu" size="medium" aria-hidden="true" />
          </Button>
        )}
        <Icon name="logo" size="large" aria-hidden="true" />
        <span className="visually-hidden">PHRSAT</span>
      </LogoSection>

      {!isMobile && (
        <NavigationSection role="navigation" aria-label="Main navigation">
          <Button variant="text" ariaLabel="View dashboard">
            <Icon name="dashboard" size="small" aria-hidden="true" />
            Dashboard
          </Button>
          <Button variant="text" ariaLabel="View records">
            <Icon name="folder" size="small" aria-hidden="true" />
            Records
          </Button>
          <Button variant="text" ariaLabel="View analytics">
            <Icon name="analytics" size="small" aria-hidden="true" />
            Analytics
          </Button>
        </NavigationSection>
      )}

      <ActionSection>
        {isAuthenticated && (
          <>
            <Button
              variant="text"
              ariaLabel={`${notificationCount} notifications`}
              onClick={() => {/* Handle notifications */}}
            >
              <Icon name="notifications" size="medium" aria-hidden="true" />
              {notificationCount > 0 && (
                <NotificationBadge role="status" aria-live="polite">
                  {notificationCount}
                </NotificationBadge>
              )}
            </Button>
            <Button
              variant="text"
              ariaLabel="Open settings"
              onClick={() => {/* Handle settings */}}
            >
              <Icon name="settings" size="medium" aria-hidden="true" />
            </Button>
            <Button
              variant="outlined"
              onClick={handleLogout}
              ariaLabel="Log out"
            >
              <Icon name="logout" size="small" aria-hidden="true" />
              {!isMobile && 'Logout'}
            </Button>
          </>
        )}
      </ActionSection>

      <BiometricPrompt
        isOpen={isBiometricPromptOpen}
        onClose={() => setIsBiometricPromptOpen(false)}
        onSuccess={handleBiometricAuth}
        onError={(error) => console.error('Biometric error:', error)}
        isRTL={isRTL}
      />
    </HeaderContainer>
  );
});

Header.displayName = 'Header';

export default Header;