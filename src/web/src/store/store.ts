/**
 * Redux Store Configuration
 * Implements secure, performant, and HIPAA-compliant state management
 * @version 1.0.0
 */

import { configureStore, Middleware } from '@reduxjs/toolkit'; // version: ^1.9.5
import { persistStore, persistReducer } from 'redux-persist'; // version: ^6.0.0
import { createStateSanitizer } from 'redux-devtools-extension'; // version: ^2.13.9
import { encryptTransform } from 'redux-persist-transform-encrypt'; // version: ^3.0.1
import thunk from 'redux-thunk'; // version: ^2.4.2
import logger from 'redux-logger'; // version: ^3.0.6
import SecurityAuditMiddleware from '@phrsat/security-middleware'; // version: ^1.0.0
import PerformanceMonitorMiddleware from '@phrsat/performance-middleware'; // version: ^1.0.0

import rootReducer, { RootState } from './rootReducer';
import ApiService from '../services/api.service';

/**
 * Security configuration for Redux store
 */
const SECURITY_CONFIG = {
  encryptionKey: process.env.REDUX_ENCRYPTION_KEY as string,
  allowedOrigins: ['localhost', '*.phrsat.com'],
  sensitiveFields: ['health', 'documents', 'auth'],
  auditLevel: 'detailed'
} as const;

/**
 * Configure secure persistence with encryption
 */
const configurePersistence = () => {
  // Configure encryption transform for sensitive data
  const encryptionTransform = encryptTransform({
    secretKey: SECURITY_CONFIG.encryptionKey,
    onError: (error) => {
      console.error('Persistence encryption error:', error);
      // Clear sensitive data on encryption failure
      return undefined;
    }
  });

  return {
    key: 'phrsat_root',
    storage: require('redux-persist/lib/storage'),
    whitelist: ['auth', 'health', 'documents'],
    blacklist: ['notifications', 'analytics', 'temp'],
    transforms: [encryptionTransform],
    timeout: 30000,
    debug: process.env.NODE_ENV !== 'production'
  };
};

/**
 * Configure development tools with security constraints
 */
const configureDevTools = () => ({
  maxAge: 50,
  trace: true,
  traceLimit: 25,
  actionSanitizer: (action: any) => {
    // Remove sensitive data from actions
    const sanitizedAction = { ...action };
    if (sanitizedAction.type.includes('auth/')) {
      delete sanitizedAction.payload?.password;
      delete sanitizedAction.payload?.token;
    }
    return sanitizedAction;
  },
  stateSanitizer: createStateSanitizer(
    SECURITY_CONFIG.sensitiveFields,
    '[REDACTED]'
  ),
  actionsBlacklist: ['SENSITIVE_ACTION'],
  predicate: (_getState: any, action: any) => {
    // Filter out sensitive actions from dev tools
    return !action.type.includes('auth/') && !action.type.includes('documents/');
  }
});

/**
 * Configure comprehensive middleware stack
 */
const configureMiddleware = (isDevelopment: boolean): Middleware[] => {
  const middleware: Middleware[] = [
    // Core middleware
    thunk.withExtraArgument({ api: ApiService.instance }),

    // Security middleware
    SecurityAuditMiddleware({
      auditLevel: SECURITY_CONFIG.auditLevel,
      sensitiveFields: SECURITY_CONFIG.sensitiveFields
    }),

    // Performance middleware
    PerformanceMonitorMiddleware({
      threshold: 100, // ms
      slowActionWarning: true
    })
  ];

  // Add development middleware
  if (isDevelopment) {
    middleware.push(
      logger({
        collapsed: true,
        duration: true,
        timestamp: false,
        colors: {
          title: () => '#139BFE',
          prevState: () => '#9E9E9E',
          action: () => '#149945',
          nextState: () => '#A47104',
          error: () => '#FF0000'
        },
        predicate: (_getState, action) => {
          // Filter sensitive actions from logging
          return !SECURITY_CONFIG.sensitiveFields.some(field => 
            action.type.toLowerCase().includes(field)
          );
        }
      })
    );
  }

  return middleware;
};

/**
 * Configure and create the Redux store with security enhancements
 */
const persistedReducer = persistReducer(configurePersistence(), rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
      },
      thunk: {
        extraArgument: {
          api: ApiService.instance
        }
      }
    }).concat(configureMiddleware(process.env.NODE_ENV === 'development')),
  devTools: process.env.NODE_ENV === 'development'
    ? configureDevTools()
    : false,
  preloadedState: undefined,
  enhancers: []
});

/**
 * Configure the persistor with encryption
 */
export const persistor = persistStore(store, null, () => {
  // Validate store integrity after rehydration
  const state = store.getState();
  if (!state || !state.auth) {
    persistor.purge(); // Clear persistence on corruption
  }
});

// Type definitions for store
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
export { RootState };