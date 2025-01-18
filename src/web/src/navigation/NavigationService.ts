/**
 * Navigation Service
 * Singleton service managing application navigation state and routing with enhanced security features
 * Implements role-based access control and navigation audit logging
 * @version 1.0.0
 */

import { BehaviorSubject, throttleTime } from 'rxjs'; // v7.0.0
import * as winston from 'winston'; // v3.0.0

import {
  NavigationRoutes,
  NavigationState,
  RouteParams,
  RoutePermissions,
  ROUTE_PERMISSIONS,
  MAX_HISTORY_SIZE
} from '../types/navigation.types';
import { User, UserRole } from '../types/auth.types';

// Global constants
const NAVIGATION_THROTTLE_MS = 1000;
const DEFAULT_NAVIGATION_STATE: NavigationState = {
  currentRoute: NavigationRoutes.LOGIN,
  params: {},
  previousRoute: null
};

/**
 * Singleton service for managing application navigation with enhanced security
 */
export class NavigationService {
  private static instance: NavigationService;
  private navigationState$: BehaviorSubject<NavigationState>;
  private navigationHistory: NavigationState[] = [];
  private logger: winston.Logger;
  private lastNavigationTime: number = 0;

  private constructor() {
    // Initialize navigation state
    this.navigationState$ = new BehaviorSubject<NavigationState>(DEFAULT_NAVIGATION_STATE);

    // Configure logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.File({ filename: 'navigation-audit.log' })
      ]
    });

    // Initialize navigation history
    this.navigationHistory = [];
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): NavigationService {
    if (!NavigationService.instance) {
      NavigationService.instance = new NavigationService();
    }
    return NavigationService.instance;
  }

  /**
   * Get current navigation state as observable
   */
  public getNavigationState$(): BehaviorSubject<NavigationState> {
    return this.navigationState$;
  }

  /**
   * Navigate to a new route with security checks and audit logging
   */
  public async navigate(
    route: NavigationRoutes,
    params: RouteParams = {},
    currentUser: User
  ): Promise<boolean> {
    try {
      // Check navigation throttling
      const now = Date.now();
      if (now - this.lastNavigationTime < NAVIGATION_THROTTLE_MS) {
        this.logger.warn('Navigation throttled', {
          userId: currentUser.id,
          route,
          timestamp: now
        });
        return false;
      }

      // Validate route permissions
      const canAccess = await this.canNavigate(route, currentUser);
      if (!canAccess) {
        this.logger.warn('Navigation access denied', {
          userId: currentUser.id,
          route,
          userRole: currentUser.role,
          timestamp: now
        });
        return false;
      }

      // Update navigation history
      const currentState = this.navigationState$.getValue();
      if (this.navigationHistory.length >= MAX_HISTORY_SIZE) {
        this.navigationHistory.shift();
      }
      this.navigationHistory.push(currentState);

      // Create new navigation state
      const newState: NavigationState = {
        currentRoute: route,
        params,
        previousRoute: currentState.currentRoute
      };

      // Update state and log
      this.navigationState$.next(newState);
      this.lastNavigationTime = now;

      this.logger.info('Navigation successful', {
        userId: currentUser.id,
        fromRoute: currentState.currentRoute,
        toRoute: route,
        params,
        timestamp: now
      });

      return true;

    } catch (error) {
      this.logger.error('Navigation error', {
        userId: currentUser.id,
        route,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }

  /**
   * Navigate back to previous route with security validation
   */
  public async goBack(currentUser: User): Promise<boolean> {
    try {
      if (this.navigationHistory.length === 0) {
        return false;
      }

      const previousState = this.navigationHistory.pop();
      if (!previousState) {
        return false;
      }

      // Validate permissions for previous route
      const canAccess = await this.canNavigate(previousState.currentRoute, currentUser);
      if (!canAccess) {
        this.logger.warn('Back navigation access denied', {
          userId: currentUser.id,
          route: previousState.currentRoute,
          timestamp: Date.now()
        });
        return false;
      }

      this.navigationState$.next(previousState);
      
      this.logger.info('Back navigation successful', {
        userId: currentUser.id,
        toRoute: previousState.currentRoute,
        timestamp: Date.now()
      });

      return true;

    } catch (error) {
      this.logger.error('Back navigation error', {
        userId: currentUser.id,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }

  /**
   * Check if user can navigate to specified route
   */
  public async canNavigate(route: NavigationRoutes, user: User): Promise<boolean> {
    try {
      const permissions = ROUTE_PERMISSIONS[route];
      if (!permissions) {
        return false;
      }

      // Check authentication requirement
      if (permissions.requiresAuth && !user?.id) {
        return false;
      }

      // Check role permissions
      if (permissions.allowedRoles.length > 0 && !permissions.allowedRoles.includes(user.role)) {
        return false;
      }

      // Check user-specific permissions override
      if (user.permissionsOverride) {
        const now = new Date();
        if (now > user.permissionsOverride.validUntil) {
          return false;
        }
        
        if (user.permissionsOverride.deniedActions.includes(route)) {
          return false;
        }
      }

      // Check security audit status
      if (user.failedLoginAttempts >= 3) {
        return false;
      }

      return true;

    } catch (error) {
      this.logger.error('Permission check error', {
        userId: user?.id,
        route,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }

  /**
   * Get current navigation state
   */
  public getCurrentState(): NavigationState {
    return this.navigationState$.getValue();
  }

  /**
   * Clear navigation history
   */
  public clearHistory(): void {
    this.navigationHistory = [];
  }
}

// Export singleton instance
export const navigationService = NavigationService.getInstance();