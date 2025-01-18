/**
 * Navigation Types
 * Defines core TypeScript types and interfaces for application navigation
 * Implements role-based access control and comprehensive route management
 * @version 1.0.0
 */

import { UserRole } from '../types/auth.types';

/**
 * Enum defining all available navigation routes in the application
 */
export enum NavigationRoutes {
  // Authentication routes
  LOGIN = '/login',
  SIGNUP = '/signup',

  // Core application routes
  DASHBOARD = '/dashboard',
  ANALYTICS = '/analytics',
  DOCUMENTS = '/documents',
  HEALTH_DATA = '/health-data',
  SETTINGS = '/settings',
  PROFILE = '/profile',
  NOTIFICATIONS = '/notifications',
  HELP = '/help',

  // Administrative routes
  AUDIT_LOG = '/admin/audit-log',

  // Healthcare provider routes
  PROVIDER_DASHBOARD = '/provider/dashboard'
}

/**
 * Interface defining the structure of navigation state
 */
export interface NavigationState {
  currentRoute: NavigationRoutes;
  params: RouteParams;
  previousRoute: NavigationRoutes | null;
}

/**
 * Interface defining route parameters for navigation
 */
export interface RouteParams {
  id?: string;
  type?: string;
  filter?: string;
  view?: string;
  section?: string;
  period?: string;
}

/**
 * Interface defining permission requirements for routes
 */
export interface RoutePermissions {
  route: NavigationRoutes;
  allowedRoles: UserRole[];
  requiresAuth: boolean;
}

/**
 * Interface defining structure for breadcrumb navigation
 */
export interface BreadcrumbItem {
  label: string;
  route: NavigationRoutes;
  params?: RouteParams;
}

/**
 * Interface for managing navigation history
 */
export interface NavigationHistory {
  stack: NavigationState[];
  maxSize: number;
  currentIndex: number;
}

/**
 * Global route permissions configuration
 * Maps each route to its permission requirements
 */
export const ROUTE_PERMISSIONS: Record<NavigationRoutes, RoutePermissions> = {
  [NavigationRoutes.LOGIN]: {
    route: NavigationRoutes.LOGIN,
    allowedRoles: [],
    requiresAuth: false
  },
  [NavigationRoutes.SIGNUP]: {
    route: NavigationRoutes.SIGNUP,
    allowedRoles: [],
    requiresAuth: false
  },
  [NavigationRoutes.DASHBOARD]: {
    route: NavigationRoutes.DASHBOARD,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    requiresAuth: true
  },
  [NavigationRoutes.ANALYTICS]: {
    route: NavigationRoutes.ANALYTICS,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT],
    requiresAuth: true
  },
  [NavigationRoutes.DOCUMENTS]: {
    route: NavigationRoutes.DOCUMENTS,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    requiresAuth: true
  },
  [NavigationRoutes.HEALTH_DATA]: {
    route: NavigationRoutes.HEALTH_DATA,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT],
    requiresAuth: true
  },
  [NavigationRoutes.SETTINGS]: {
    route: NavigationRoutes.SETTINGS,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    requiresAuth: true
  },
  [NavigationRoutes.PROFILE]: {
    route: NavigationRoutes.PROFILE,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    requiresAuth: true
  },
  [NavigationRoutes.NOTIFICATIONS]: {
    route: NavigationRoutes.NOTIFICATIONS,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    requiresAuth: true
  },
  [NavigationRoutes.HELP]: {
    route: NavigationRoutes.HELP,
    allowedRoles: [UserRole.ADMIN, UserRole.HEALTHCARE_PROVIDER, UserRole.PATIENT, UserRole.FAMILY_CAREGIVER],
    requiresAuth: true
  },
  [NavigationRoutes.AUDIT_LOG]: {
    route: NavigationRoutes.AUDIT_LOG,
    allowedRoles: [UserRole.ADMIN],
    requiresAuth: true
  },
  [NavigationRoutes.PROVIDER_DASHBOARD]: {
    route: NavigationRoutes.PROVIDER_DASHBOARD,
    allowedRoles: [UserRole.HEALTHCARE_PROVIDER],
    requiresAuth: true
  }
};

/**
 * Maximum size of navigation history stack
 */
export const MAX_HISTORY_SIZE = 50;

/**
 * Default route for authenticated users
 */
export const DEFAULT_ROUTE = NavigationRoutes.DASHBOARD;