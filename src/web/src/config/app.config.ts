/**
 * Global application configuration file for PHRSAT web application
 * Implements core settings, environment variables, feature flags, and constants
 * @version 2.1.0
 */

import { z } from 'zod'; // v3.21.4
import { API_ROUTES } from '../constants/api.constants';
import { themeConfig } from './theme.config';

// Environment configuration validation schema
const environmentSchema = z.object({
  env: z.enum(['development', 'staging', 'production']),
  apiUrl: z.string().url(),
  debug: z.boolean(),
  region: z.string(),
  deploymentStage: z.enum(['dev', 'stage', 'prod']),
  isSecure: z.boolean(),
  corsOrigins: z.array(z.string().url())
});

// Feature flag configuration validation schema
const featureSchema = z.object({
  enableAnalytics: z.boolean(),
  enableHealthPlatforms: z.boolean(),
  enableDocumentOCR: z.boolean(),
  enableBiometricAuth: z.boolean(),
  enableRealTimeSync: z.boolean(),
  enableOfflineMode: z.boolean(),
  enableAIInsights: z.boolean(),
  enableHealthMetrics: z.boolean()
});

// API configuration validation schema
const apiConfigSchema = z.object({
  baseUrl: z.string().url(),
  timeout: z.number().min(1000).max(60000),
  retryAttempts: z.number().min(0).max(5),
  retryDelay: z.number().min(100).max(5000),
  errorHandling: z.enum(['silent', 'toast', 'modal']),
  rateLimiting: z.object({
    enabled: z.boolean(),
    maxRequests: z.number(),
    windowMs: z.number()
  }),
  caching: z.object({
    enabled: z.boolean(),
    ttl: z.number(),
    maxSize: z.number()
  })
});

// Application constants
export const APP_VERSION = '2.1.0';
export const DEFAULT_LANGUAGE = 'en';
export const API_TIMEOUT = 30000;
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Returns environment-specific configuration with validation
 */
const getEnvironmentConfig = (): z.infer<typeof environmentSchema> => {
  const config = {
    env: process.env.NODE_ENV || 'development',
    apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:3000',
    debug: process.env.REACT_APP_DEBUG === 'true',
    region: process.env.REACT_APP_REGION || 'us-east-1',
    deploymentStage: process.env.REACT_APP_STAGE || 'dev',
    isSecure: process.env.REACT_APP_SECURE === 'true',
    corsOrigins: (process.env.REACT_APP_CORS_ORIGINS || '').split(',').filter(Boolean)
  };

  return environmentSchema.parse(config);
};

/**
 * Feature flag configuration with persistence
 */
const getFeatureConfig = (): z.infer<typeof featureSchema> => {
  const config = {
    enableAnalytics: true,
    enableHealthPlatforms: true,
    enableDocumentOCR: true,
    enableBiometricAuth: true,
    enableRealTimeSync: true,
    enableOfflineMode: true,
    enableAIInsights: true,
    enableHealthMetrics: true
  };

  return featureSchema.parse(config);
};

/**
 * API configuration with retry and error handling
 */
const getApiConfig = (): z.infer<typeof apiConfigSchema> => {
  const config = {
    baseUrl: API_ROUTES.BASE_URL,
    timeout: API_TIMEOUT,
    retryAttempts: MAX_RETRY_ATTEMPTS,
    retryDelay: 1000,
    errorHandling: 'toast' as const,
    rateLimiting: {
      enabled: true,
      maxRequests: 1000,
      windowMs: 60000
    },
    caching: {
      enabled: true,
      ttl: 300000, // 5 minutes
      maxSize: 100 // Maximum number of cached items
    }
  };

  return apiConfigSchema.parse(config);
};

/**
 * Validates entire configuration object
 */
const validateConfig = (config: typeof appConfig): boolean => {
  try {
    environmentSchema.parse(config.environment);
    featureSchema.parse(config.features);
    apiConfigSchema.parse(config.api);
    return true;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    return false;
  }
};

/**
 * Global application configuration object
 */
export const appConfig = {
  environment: getEnvironmentConfig(),
  features: getFeatureConfig(),
  api: getApiConfig(),
  theme: themeConfig,
  version: APP_VERSION,
  defaultLanguage: DEFAULT_LANGUAGE
} as const;

// Validate configuration on initialization
if (!validateConfig(appConfig)) {
  throw new Error('Invalid application configuration');
}

// Type definitions for configuration
export type EnvironmentConfig = z.infer<typeof environmentSchema>;
export type FeatureConfig = z.infer<typeof featureSchema>;
export type APIConfig = z.infer<typeof apiConfigSchema>;