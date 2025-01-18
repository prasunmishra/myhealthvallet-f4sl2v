/**
 * Entry point for the PHRSAT web application
 * Sets up React root with Redux store, security contexts, and HIPAA compliance
 * @version 1.0.0
 */

import React from 'react'; // ^18.0.0
import ReactDOM from 'react-dom/client'; // ^18.0.0
import { Provider } from 'react-redux'; // ^8.1.0
import { PersistGate } from 'redux-persist/integration/react'; // ^6.0.0
import { datadogRum } from '@datadog/browser-rum'; // ^4.0.0
import * as Sentry from '@sentry/react'; // ^7.0.0
import { Auth0Provider } from '@auth0/auth0-react'; // ^2.0.0
import { ThemeProvider } from '@mui/material'; // ^5.0.0

import App from './App';
import { store, persistor } from './store/store';
import { createTheme } from './styles/theme';

// Initialize performance monitoring
datadogRum.init({
  applicationId: process.env.REACT_APP_DATADOG_APP_ID!,
  clientToken: process.env.REACT_APP_DATADOG_CLIENT_TOKEN!,
  site: 'datadoghq.com',
  service: 'phrsat-web',
  env: process.env.NODE_ENV,
  version: process.env.REACT_APP_VERSION,
  sessionSampleRate: 100,
  sessionReplaySampleRate: 20,
  trackUserInteractions: true,
  trackResources: true,
  trackLongTasks: true,
  defaultPrivacyLevel: 'mask-user-input'
});

// Initialize error tracking with HIPAA compliance
Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Sanitize sensitive data before sending
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }
    return event;
  },
  integrations: [
    new Sentry.BrowserTracing({
      tracingOrigins: [window.location.hostname]
    })
  ]
});

// Set up Content Security Policy
const setSecurityHeaders = () => {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = `
    default-src 'self';
    img-src 'self' data: https:;
    style-src 'self' 'unsafe-inline';
    script-src 'self';
    connect-src 'self' ${process.env.REACT_APP_API_URL} *.sentry.io *.datadog.com;
    frame-ancestors 'none';
    form-action 'self';
  `;
  document.head.appendChild(meta);
};

// Initialize security context
const initializeSecurity = () => {
  setSecurityHeaders();
  
  // Prevent clickjacking
  if (window.self !== window.top) {
    window.top.location = window.self.location;
  }

  // Disable console in production
  if (process.env.NODE_ENV === 'production') {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    console.error = () => {};
  }
};

// Create root element with error boundary
const createRoot = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');
  
  return ReactDOM.createRoot(rootElement);
};

// Initialize application
const initializeApp = () => {
  initializeSecurity();
  const root = createRoot();

  root.render(
    <React.StrictMode>
      <Sentry.ErrorBoundary
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
        <Auth0Provider
          domain={process.env.REACT_APP_AUTH0_DOMAIN!}
          clientId={process.env.REACT_APP_AUTH0_CLIENT_ID!}
          redirectUri={window.location.origin}
          audience={process.env.REACT_APP_AUTH0_AUDIENCE}
          scope="openid profile email"
        >
          <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
              <ThemeProvider theme={createTheme('light')}>
                <App />
              </ThemeProvider>
            </PersistGate>
          </Provider>
        </Auth0Provider>
      </Sentry.ErrorBoundary>
    </React.StrictMode>
  );
};

// Start the application
initializeApp();

// Enable hot module replacement in development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./App', () => {
    initializeApp();
  });
}