/**
 * Root application component that provides theme context, error boundary,
 * and navigation structure for the PHRSAT application.
 * Implements HIPAA-compliant error handling and accessibility support.
 * @version 1.0.0
 */

import React, { useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import * as ErrorTracker from '@sentry/react';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

import AppNavigator from './navigation/AppNavigator';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useTheme } from './hooks/useTheme';

// Initialize performance monitoring
const appInsights = new ApplicationInsights({
  config: {
    instrumentationKey: process.env.REACT_APP_APPINSIGHTS_KEY,
    enableAutoRouteTracking: true,
    enableCorsCorrelation: true,
    enableRequestHeaderTracking: true,
    enableResponseHeaderTracking: true,
  }
});

appInsights.loadAppInsights();

// Initialize error tracking with HIPAA compliance
ErrorTracker.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  beforeSend(event) {
    // Sanitize sensitive data before sending
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }
    return event;
  },
  integrations: [
    new ErrorTracker.BrowserTracing({
      tracingOrigins: [window.location.hostname]
    })
  ],
  tracesSampleRate: 0.1
});

/**
 * Root application component with theme and error handling
 */
const App: React.FC = ErrorTracker.withProfiler(() => {
  const { theme, currentTheme, setTheme, error: themeError } = useTheme();

  // Handle theme changes with performance monitoring
  const handleThemeChange = useCallback((mode: 'light' | 'dark') => {
    const startTime = performance.now();
    try {
      setTheme(mode);
      appInsights.trackMetric({
        name: 'ThemeChangeTime',
        average: performance.now() - startTime
      });
    } catch (error) {
      ErrorTracker.captureException(error);
    }
  }, [setTheme]);

  // Set up CSP headers and security features
  useEffect(() => {
    // Configure Content Security Policy
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = `
      default-src 'self';
      img-src 'self' data: https:;
      style-src 'self' 'unsafe-inline';
      script-src 'self';
      connect-src 'self' ${process.env.REACT_APP_API_URL};
    `;
    document.head.appendChild(meta);

    // Track initial page load performance
    if (window.performance) {
      const navigationTiming = performance.getEntriesByType('navigation')[0];
      appInsights.trackMetric({
        name: 'PageLoadTime',
        average: navigationTiming.duration
      });
    }
  }, []);

  // Handle global errors
  const handleError = useCallback((error: Error, errorInfo: React.ErrorInfo, errorId: string) => {
    ErrorTracker.withScope(scope => {
      scope.setTag('errorId', errorId);
      scope.setExtra('componentStack', errorInfo.componentStack);
      ErrorTracker.captureException(error);
    });

    appInsights.trackException({
      error,
      properties: {
        errorId,
        componentStack: errorInfo.componentStack
      }
    });
  }, []);

  if (themeError) {
    return (
      <div role="alert" className="theme-error">
        Failed to load theme. Please refresh the page.
      </div>
    );
  }

  return (
    <ErrorBoundary
      onError={handleError}
      fallback={({ error }) => (
        <div role="alert" className="error-container">
          <h1>Something went wrong</h1>
          <p>Please try refreshing the page</p>
          {process.env.NODE_ENV !== 'production' && (
            <pre>{error.message}</pre>
          )}
        </div>
      )}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <div 
          className="app-container"
          data-theme={currentTheme}
          role="application"
          aria-label="PHRSAT Application"
        >
          <AppNavigator
            securityLevel="high"
            auditEnabled={true}
            className="main-navigator"
          />
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
});

App.displayName = 'App';

export default App;