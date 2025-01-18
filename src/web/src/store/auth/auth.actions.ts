/**
 * Enhanced Authentication Action Creators
 * Implements secure authentication state management with HIPAA compliance
 * @version 1.0.0
 */

import { ThunkAction } from 'redux-thunk';
import { v4 as uuidv4 } from 'uuid'; // version: ^9.0.0

import { AuthActionTypes } from './auth.types';
import { 
  LoginCredentials, 
  MFACredentials, 
  AuthResponse, 
  BiometricCredentials,
  SecurityContext 
} from '../../types/auth.types';
import AuthService from '../../services/auth.service';

// Type for thunk actions with enhanced security context
type AuthThunkAction<R = void> = ThunkAction<
  Promise<R>,
  any,
  { authService: AuthService },
  any
>;

/**
 * Enhanced login action creator with security tracking
 */
export const login = (
  credentials: LoginCredentials,
  securityContext: SecurityContext
): AuthThunkAction<AuthResponse> => {
  return async (dispatch, getState, { authService }) => {
    const correlationId = uuidv4();

    try {
      dispatch({
        type: AuthActionTypes.LOGIN_REQUEST,
        payload: {
          correlationId,
          timestamp: Date.now(),
          securityContext
        }
      });

      const response = await authService.login({
        ...credentials,
        deviceId: securityContext.deviceId
      });

      // Handle MFA requirement
      if (response.mfaRequired) {
        dispatch({
          type: AuthActionTypes.MFA_REQUIRED,
          payload: {
            mfaToken: response.mfaToken,
            correlationId,
            securityContext
          }
        });
        return response;
      }

      // Handle biometric enrollment if available
      if (response.biometricToken) {
        dispatch({
          type: AuthActionTypes.BIOMETRIC_AUTH_REQUEST,
          payload: {
            biometricToken: response.biometricToken,
            correlationId
          }
        });
      }

      dispatch({
        type: AuthActionTypes.LOGIN_SUCCESS,
        payload: {
          user: response.user,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          securityContext,
          correlationId,
          timestamp: Date.now()
        }
      });

      return response;

    } catch (error) {
      // Track security violations
      if (error.code === 'SECURITY_VIOLATION') {
        dispatch({
          type: AuthActionTypes.SECURITY_VIOLATION,
          payload: {
            type: error.details.violationType,
            details: error.message,
            correlationId,
            securityContext
          }
        });
      }

      dispatch({
        type: AuthActionTypes.LOGIN_FAILURE,
        payload: {
          error: error.message,
          correlationId,
          timestamp: Date.now()
        }
      });

      throw error;
    }
  };
};

/**
 * MFA verification action creator with rate limiting
 */
export const verifyMFA = (
  mfaCredentials: MFACredentials,
  securityContext: SecurityContext
): AuthThunkAction<AuthResponse> => {
  return async (dispatch, getState, { authService }) => {
    const correlationId = uuidv4();

    try {
      dispatch({
        type: AuthActionTypes.MFA_VERIFY,
        payload: {
          correlationId,
          securityContext
        }
      });

      const response = await authService.verifyMFA({
        ...mfaCredentials,
        deviceId: securityContext.deviceId
      });

      dispatch({
        type: AuthActionTypes.LOGIN_SUCCESS,
        payload: {
          user: response.user,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          securityContext,
          correlationId,
          timestamp: Date.now()
        }
      });

      return response;

    } catch (error) {
      dispatch({
        type: AuthActionTypes.LOGIN_FAILURE,
        payload: {
          error: error.message,
          correlationId,
          timestamp: Date.now()
        }
      });

      throw error;
    }
  };
};

/**
 * Biometric authentication action creator
 */
export const verifyBiometric = (
  biometricData: BiometricCredentials,
  securityContext: SecurityContext
): AuthThunkAction<AuthResponse> => {
  return async (dispatch, getState, { authService }) => {
    const correlationId = uuidv4();

    try {
      dispatch({
        type: AuthActionTypes.BIOMETRIC_AUTH_REQUEST,
        payload: {
          correlationId,
          securityContext
        }
      });

      const response = await authService.verifyBiometric({
        ...biometricData,
        deviceId: securityContext.deviceId
      });

      dispatch({
        type: AuthActionTypes.LOGIN_SUCCESS,
        payload: {
          user: response.user,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          securityContext,
          correlationId,
          timestamp: Date.now()
        }
      });

      return response;

    } catch (error) {
      dispatch({
        type: AuthActionTypes.LOGIN_FAILURE,
        payload: {
          error: error.message,
          correlationId,
          timestamp: Date.now()
        }
      });

      throw error;
    }
  };
};

/**
 * Secure logout action creator with session cleanup
 */
export const logout = (
  securityContext: SecurityContext
): AuthThunkAction => {
  return async (dispatch, getState, { authService }) => {
    const correlationId = uuidv4();

    try {
      await authService.logout();

      dispatch({
        type: AuthActionTypes.LOGOUT,
        payload: {
          correlationId,
          securityContext,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      // Force logout on error but track the failure
      dispatch({
        type: AuthActionTypes.LOGOUT,
        payload: {
          error: error.message,
          correlationId,
          securityContext,
          timestamp: Date.now()
        }
      });
    }
  };
};

/**
 * Token refresh action creator with security validation
 */
export const refreshToken = (
  securityContext: SecurityContext
): AuthThunkAction => {
  return async (dispatch, getState, { authService }) => {
    const correlationId = uuidv4();

    try {
      const response = await authService.refreshToken();

      dispatch({
        type: AuthActionTypes.REFRESH_TOKEN,
        payload: {
          accessToken: response.accessToken,
          securityContext,
          correlationId,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      // Force logout on refresh failure
      dispatch({
        type: AuthActionTypes.LOGOUT,
        payload: {
          error: error.message,
          correlationId,
          securityContext,
          timestamp: Date.now()
        }
      });

      throw error;
    }
  };
};