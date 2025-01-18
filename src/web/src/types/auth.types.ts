/**
 * Authentication Types
 * Defines core TypeScript types and interfaces for authentication and authorization
 * Implements HIPAA-compliant security features and role-based access control
 * @version 1.0.0
 */

import { AUTH_TOKEN_TYPES } from '../constants/auth.constants';

/**
 * Available user roles in the system with granular access control
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  HEALTHCARE_PROVIDER = 'HEALTHCARE_PROVIDER',
  PATIENT = 'PATIENT',
  FAMILY_CAREGIVER = 'FAMILY_CAREGIVER'
}

/**
 * Security audit log entry interface for tracking security-related events
 */
export interface SecurityAuditEntry {
  timestamp: Date;
  action: string;
  ipAddress: string;
  userAgent: string;
  deviceId: string;
  successful: boolean;
  failureReason?: string;
}

/**
 * Granular permission set interface for fine-grained access control
 */
export interface PermissionSet {
  allowedActions: string[];
  deniedActions: string[];
  resourcePermissions: Record<string, string[]>;
  validUntil: Date;
}

/**
 * Enhanced user interface with security and compliance fields
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isEmailVerified: boolean;
  isMFAEnabled: boolean;
  lastLogin: Date;
  lastPasswordChange: Date;
  failedLoginAttempts: number;
  permissionsOverride?: PermissionSet;
  securityAuditLog: SecurityAuditEntry[];
}

/**
 * Enhanced authentication token interface with security metadata
 */
export interface AuthToken {
  token: string;
  type: AUTH_TOKEN_TYPES;
  expiresAt: number;
  tokenId: string;
  issuedAt: number;
  deviceId: string;
  scope: string[];
}

/**
 * Enhanced authentication error interface with detailed error information
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  errorId: string;
  timestamp: string;
  details?: any;
  validationErrors?: string[];
}

/**
 * Standardized authentication error codes
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_locked'
  | 'mfa_required'
  | 'mfa_invalid'
  | 'token_expired'
  | 'token_invalid'
  | 'permission_denied'
  | 'rate_limited'
  | 'security_violation';

/**
 * Authentication status type for tracking auth flow state
 */
export type AuthStatus =
  | 'idle'
  | 'authenticating'
  | 'authenticated'
  | 'mfa_required'
  | 'mfa_validating'
  | 'locked'
  | 'error';

/**
 * Type alias for authentication token types
 */
export type TokenType = AUTH_TOKEN_TYPES;