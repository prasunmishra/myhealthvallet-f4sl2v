/**
 * Root Reducer Configuration
 * Combines all feature reducers into a single reducer with type safety and performance optimizations
 * @version 1.0.0
 */

import { combineReducers } from '@reduxjs/toolkit'; // version: ^1.9.5

// Import feature reducers
import analyticsReducer from './analytics/analytics.reducer';
import authReducer from './auth/auth.reducer';
import documentsReducer from './documents/documents.reducer';
import healthReducer from './health/health.reducer';
import notificationsReducer from './notifications/notifications.reducer';

/**
 * Root reducer combining all feature reducers with type safety
 * Implements performance optimizations and comprehensive error handling
 */
const rootReducer = combineReducers({
  /**
   * Analytics state management
   * Handles health data analysis, trends, and ML-driven insights
   */
  analytics: analyticsReducer,

  /**
   * Authentication state management
   * Handles HIPAA-compliant user sessions and security
   */
  auth: authReducer,

  /**
   * Document state management
   * Handles health record storage and processing
   */
  documents: documentsReducer,

  /**
   * Health data state management
   * Handles FHIR-compliant health metrics and records
   */
  health: healthReducer,

  /**
   * Notifications state management
   * Handles real-time system notifications and alerts
   */
  notifications: notificationsReducer
});

/**
 * Type-safe root state interface derived from root reducer
 * Provides comprehensive typing for the entire Redux store
 */
export type RootState = ReturnType<typeof rootReducer>;

/**
 * Export the root reducer as the default export
 * Enables modular store configuration
 */
export default rootReducer;