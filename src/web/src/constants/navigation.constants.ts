/**
 * Navigation Constants
 * Defines secure navigation routes, permissions and configuration for the PHRSAT web application
 * Implements HIPAA-compliant access control and security auditing
 * @version 1.0.0
 */

import { NavigationRoutes, RoutePermissions, NavigationGuard } from '../types/navigation.types';
import { UserRole } from '../types/auth.types';

/**
 * Secure route path configurations with input sanitization and deep linking controls
 */
export const ROUTE_PATHS = {
  DASHBOARD: {
    path: '/dashboard',
    localizationKey: 'routes.dashboard',
    allowDeepLinking: true,
    sanitizationRules: ['xss', 'sql-injection']
  },
  DOCUMENTS: {
    path: '/documents/:type?/:id?',
    localizationKey: 'routes.documents',
    allowDeepLinking: true,
    sanitizationRules: ['xss', 'path-traversal']
  },
  HEALTH_DATA: {
    path: '/health-data/:category?',
    localizationKey: 'routes.healthData',
    allowDeepLinking: false,
    sanitizationRules: ['xss', 'sql-injection']
  },
  ANALYTICS: {
    path: '/analytics/:reportType?',
    localizationKey: 'routes.analytics',
    allowDeepLinking: true,
    sanitizationRules: ['xss']
  },
  APPOINTMENTS: {
    path: '/appointments/:view?',
    localizationKey: 'routes.appointments',
    allowDeepLinking: true,
    sanitizationRules: ['xss', 'sql-injection']
  },
  SETTINGS: {
    path: '/settings/:section?',
    localizationKey: 'routes.settings',
    allowDeepLinking: false,
    sanitizationRules: ['xss']
  }
} as const;

/**
 * Enhanced route permissions with HIPAA compliance and security auditing
 */
export const ROUTE_PERMISSIONS = {
  DASHBOARD: {
    route: NavigationRoutes.DASHBOARD,
    allowedRoles: [
      UserRole.ADMIN,
      UserRole.HEALTHCARE_PROVIDER,
      UserRole.PATIENT,
      UserRole.FAMILY_CAREGIVER
    ],
    requiresAuth: true,
    auditLevel: 'INFO',
    hipaaCompliant: true,
    accessRestrictions: {
      timeBasedAccess: false,
      geoFencing: false,
      mfaRequired: false
    }
  },
  DOCUMENTS: {
    route: NavigationRoutes.DOCUMENTS,
    allowedRoles: [
      UserRole.ADMIN,
      UserRole.HEALTHCARE_PROVIDER,
      UserRole.PATIENT,
      UserRole.FAMILY_CAREGIVER
    ],
    requiresAuth: true,
    auditLevel: 'HIGH',
    hipaaCompliant: true,
    accessRestrictions: {
      timeBasedAccess: true,
      geoFencing: true,
      mfaRequired: true
    }
  },
  HEALTH_DATA: {
    route: NavigationRoutes.HEALTH_DATA,
    allowedRoles: [
      UserRole.ADMIN,
      UserRole.HEALTHCARE_PROVIDER,
      UserRole.PATIENT
    ],
    requiresAuth: true,
    auditLevel: 'HIGH',
    hipaaCompliant: true,
    accessRestrictions: {
      timeBasedAccess: true,
      geoFencing: true,
      mfaRequired: true
    }
  },
  ANALYTICS: {
    route: NavigationRoutes.ANALYTICS,
    allowedRoles: [
      UserRole.ADMIN,
      UserRole.HEALTHCARE_PROVIDER,
      UserRole.PATIENT
    ],
    requiresAuth: true,
    auditLevel: 'MEDIUM',
    hipaaCompliant: true,
    accessRestrictions: {
      timeBasedAccess: false,
      geoFencing: false,
      mfaRequired: false
    }
  },
  APPOINTMENTS: {
    route: NavigationRoutes.APPOINTMENTS,
    allowedRoles: [
      UserRole.ADMIN,
      UserRole.HEALTHCARE_PROVIDER,
      UserRole.PATIENT,
      UserRole.FAMILY_CAREGIVER
    ],
    requiresAuth: true,
    auditLevel: 'MEDIUM',
    hipaaCompliant: true,
    accessRestrictions: {
      timeBasedAccess: false,
      geoFencing: false,
      mfaRequired: false
    }
  },
  SETTINGS: {
    route: NavigationRoutes.SETTINGS,
    allowedRoles: [
      UserRole.ADMIN,
      UserRole.HEALTHCARE_PROVIDER,
      UserRole.PATIENT,
      UserRole.FAMILY_CAREGIVER
    ],
    requiresAuth: true,
    auditLevel: 'HIGH',
    hipaaCompliant: true,
    accessRestrictions: {
      timeBasedAccess: false,
      geoFencing: false,
      mfaRequired: true
    }
  }
} as const;

/**
 * Secure navigation configuration with comprehensive guards
 */
export const NAVIGATION_CONFIG = {
  DEFAULT_ROUTE: NavigationRoutes.DASHBOARD,
  
  AUTH_ROUTES: [
    NavigationRoutes.LOGIN,
    NavigationRoutes.SIGNUP,
    NavigationRoutes.MFA
  ],
  
  PUBLIC_ROUTES: [
    NavigationRoutes.LOGIN,
    NavigationRoutes.SIGNUP,
    NavigationRoutes.FORGOT_PASSWORD,
    NavigationRoutes.RESET_PASSWORD
  ],
  
  NAVIGATION_GUARDS: [
    {
      name: 'AuthGuard',
      priority: 1,
      enforceOn: ['ALL_ROUTES'],
      excludeRoutes: ['PUBLIC_ROUTES']
    },
    {
      name: 'RoleGuard',
      priority: 2,
      enforceOn: ['PROTECTED_ROUTES'],
      excludeRoutes: []
    },
    {
      name: 'HipaaGuard',
      priority: 3,
      enforceOn: ['HEALTH_DATA', 'DOCUMENTS'],
      excludeRoutes: []
    }
  ]
} as const;