import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { ErrorBoundary } from 'react-error-boundary';
import Header from './Header';
import Sidebar from './Sidebar.desktop';
import BottomNavigation from './BottomNavigation.mobile';
import useBreakpoint from '../../hooks/useBreakpoint';

// Layout component props interface
interface LayoutProps {
  children: React.ReactNode;
  className?: string;
  disableNavigation?: boolean;
}

// Styled components with WCAG 2.1 AAA compliance
const LayoutContainer = styled.div<{ isRTL?: boolean }>`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.colors.background};
  direction: ${({ isRTL }) => isRTL ? 'rtl' : 'ltr'};
  position: relative;
  overflow-x: hidden;

  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
    }
  }

  @media (forced-colors: active) {
    border: 1px solid ButtonText;
  }
`;

const MainContent = styled.main<{ 
  isDesktop: boolean;
  isRTL?: boolean;
}>`
  flex: 1;
  padding-top: ${({ theme }) => theme.spacing.LARGE}px;
  padding-left: ${({ theme, isDesktop }) => 
    isDesktop ? `${theme.componentSizes.SIDEBAR_WIDTH}px` : '0'};
  padding-right: ${({ theme, isDesktop, isRTL }) => 
    isDesktop && isRTL ? `${theme.componentSizes.SIDEBAR_WIDTH}px` : '0'};
  padding-bottom: ${({ theme, isDesktop }) => 
    isDesktop ? 0 : `${theme.componentSizes.BOTTOM_NAV_HEIGHT}px`};
  width: 100%;
  max-width: ${({ theme }) => theme.containerWidths.MAX};
  margin: 0 auto;
  transition: padding 0.3s ${({ theme }) => theme.transitions.easing.easeInOut};

  @media print {
    padding: 0;
  }
`;

const Layout: React.FC<LayoutProps> = ({
  children,
  className,
  disableNavigation = false
}) => {
  const { isDesktop } = useBreakpoint();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRTL, setIsRTL] = useState(false);

  // Handle menu toggle for mobile view
  const handleMenuToggle = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  // Monitor RTL changes
  useEffect(() => {
    const handleRTLChange = () => {
      setIsRTL(document.dir === 'rtl');
    };

    // Initial RTL check
    handleRTLChange();

    // Create MutationObserver to watch for dir attribute changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'dir') {
          handleRTLChange();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dir']
    });

    return () => observer.disconnect();
  }, []);

  // Handle layout shift tracking
  useEffect(() => {
    let cls = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          cls += entry.value;
        }
      }
    });

    observer.observe({ entryTypes: ['layout-shift'] });

    return () => observer.disconnect();
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <div role="alert">
          <h2>Layout Error</h2>
          <pre>{error.message}</pre>
        </div>
      )}
    >
      <LayoutContainer 
        className={className}
        isRTL={isRTL}
        data-testid="layout-container"
      >
        <Header 
          onMenuClick={handleMenuToggle}
          dir={isRTL ? 'rtl' : 'ltr'}
        />

        {!disableNavigation && (
          <>
            {isDesktop ? (
              <Sidebar 
                securityLevel="high"
                className={isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}
              />
            ) : (
              <BottomNavigation />
            )}
          </>
        )}

        <MainContent
          isDesktop={isDesktop}
          isRTL={isRTL}
          role="main"
          aria-label="Main content"
          data-testid="main-content"
        >
          {children}
        </MainContent>
      </LayoutContainer>
    </ErrorBoundary>
  );
};

Layout.displayName = 'Layout';

export type { LayoutProps };
export default Layout;