/**
 * Authentication Types for Redux Store
 * Defines TypeScript types and interfaces for secure authentication state management
 * Implements HIPAA-compliant security features and enhanced session tracking
 * @version 1.0.0
 */

import { User, AuthToken } from '../../types/auth.types';
import { AUTH_TOKEN_TYPES } from '../../constants/auth.constants';

/**
 * Enum defining all possible authentication action types
 * Supports comprehensive auth flows including OAuth, MFA, and biometric
 */
export enum AuthActionTypes {
  LOGIN_REQUEST = '@auth/LOGIN_REQUEST',
  LOGIN_SUCCESS = '@auth/LOGIN_SUCCESS',
  LOGIN_FAILURE = '@auth/LOGIN_FAILURE',
  LOGOUT = '@auth/LOGOUT',
  MFA_REQUIRED = '@auth/MFA_REQUIRED',
  MFA_VERIFY = '@auth/MFA_VERIFY',
  REFRESH_TOKEN = '@auth/REFRESH_TOKEN',
  SESSION_TIMEOUT = '@auth/SESSION_TIMEOUT',
  SECURITY_VIOLATION = '@auth/SECURITY_VIOLATION',
  BIOMETRIC_AUTH = '@auth/BIOMETRIC_AUTH'
}

/**
 * Type defining all possible authentication status states
 */
export type AuthStatus = 
  | 'idle'
  | 'authenticating'
  | 'authenticated'
  | 'mfa_required'
  | 'error'
  | 'session_expired'
  | 'security_violation'
  | 'token_refresh_required'
  | 'biometric_required';

/**
 * Type defining supported authentication methods
 */
export type AuthMethod = 
  | 'password'
  | 'oauth'
  | 'mfa'
  | 'biometric';

/**
 * Interface for tracking security context of authentication
 */
export interface SecurityContext {
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  lastVerifiedAt: number;
}

/**
 * Type defining possible security violation scenarios
 */
export type SecurityViolation = {
  type: 'ip_change' | 'device_change' | 'suspicious_activity';
  details: string;
};

/**
 * Interface for login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
  deviceId?: string;
}

/**
 * Interface defining the authentication state in Redux store
 */
export interface AuthState {
  // User and token data
  user: User | null;
  accessToken: AuthToken | null;
  refreshToken: AuthToken | null;
  mfaToken: string | null;
  biometricToken: string | null;

  // Authentication state
  status: AuthStatus;
  error: string | null;
  lastActivity: number;
  
  // Security context
  securityContext: SecurityContext;
  authMethod: AuthMethod;
}

/**
 * Action interfaces for type-safe Redux actions
 */
export interface LoginRequestAction {
  type: typeof AuthActionTypes.LOGIN_REQUEST;
  payload: LoginCredentials;
}

export interface LoginSuccessAction {
  type: typeof AuthActionTypes.LOGIN_SUCCESS;
  payload: {
    user: User;
    accessToken: AuthToken;
    refreshToken: AuthToken;
  };
}

export interface LoginFailureAction {
  type: typeof AuthActionTypes.LOGIN_FAILURE;
  payload: string;
}

export interface LogoutAction {
  type: typeof AuthActionTypes.LOGOUT;
}

export interface MFARequiredAction {
  type: typeof AuthActionTypes.MFA_REQUIRED;
  payload: {
    mfaToken: string;
  };
}

export interface MFAVerifyAction {
  type: typeof AuthActionTypes.MFA_VERIFY;
  payload: {
    code: string;
    mfaToken: string;
  };
}

export interface RefreshTokenAction {
  type: typeof AuthActionTypes.REFRESH_TOKEN;
  payload: {
    accessToken: AuthToken;
  };
}

export interface SessionTimeoutAction {
  type: typeof AuthActionTypes.SESSION_TIMEOUT;
  payload: {
    lastActivity: number;
  };
}

export interface SecurityViolationAction {
  type: typeof AuthActionTypes.SECURITY_VIOLATION;
  payload: SecurityViolation;
}

export interface BiometricAuthAction {
  type: typeof AuthActionTypes.BIOMETRIC_AUTH;
  payload: {
    biometricToken: string;
  };
}

/**
 * Union type of all possible authentication actions
 */
export type AuthActionUnion = 
  | LoginRequestAction
  | LoginSuccessAction
  | LoginFailureAction
  | LogoutAction
  | MFARequiredAction
  | MFAVerifyAction
  | RefreshTokenAction
  | SessionTimeoutAction
  | SecurityViolationAction
  | BiometricAuthAction;