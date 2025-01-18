/**
 * @fileoverview Enhanced Authentication Service Implementation for PHRSAT
 * @version 1.0.0
 * 
 * Implements HIPAA-compliant authentication with:
 * - OAuth 2.0 + OIDC integration
 * - Multi-factor authentication
 * - Biometric authentication support
 * - Secure session management
 * - Real-time permission tracking
 */

import { BehaviorSubject, Observable, timer, switchMap } from 'rxjs'; // version: ^7.0.0
import jwtDecode from 'jwt-decode'; // version: ^3.1.2
import { LocalAuthentication } from '@capacitor/biometric'; // version: ^4.0.0

import ApiService from './api.service';
import StorageService from './storage.service';
import { API_ROUTES } from '../constants/api.constants';
import { ApiResponse, ApiError } from '../types/api.types';

// Authentication interfaces
interface User {
  id: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  lastLogin: Date;
  biometricEnabled: boolean;
}

interface AuthPermissions {
  canUpload: boolean;
  canDelete: boolean;
  canShare: boolean;
  canExport: boolean;
  isAdmin: boolean;
}

interface LoginCredentials {
  email: string;
  password: string;
  deviceId?: string;
  biometricToken?: string;
}

interface MFACredentials {
  code: string;
  method: 'totp' | 'sms' | 'email';
  sessionToken: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  permissions: AuthPermissions;
  mfaRequired?: boolean;
  biometricToken?: string;
}

interface TokenPayload {
  sub: string;
  exp: number;
  permissions: string[];
  sessionId: string;
}

/**
 * Enhanced Authentication Service with HIPAA compliance
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_REFRESH_THRESHOLD = 300; // 5 minutes
  private readonly BIOMETRIC_CONFIG = {
    reason: 'Authenticate to access your health records',
    title: 'Biometric Authentication',
    subtitle: 'PHRSAT Security',
    cancelButtonTitle: 'Use Password Instead'
  };

  // Observable streams for auth state
  public currentUser$ = new BehaviorSubject<User | null>(null);
  public isAuthenticated$ = new BehaviorSubject<boolean>(false);
  public isMFARequired$ = new BehaviorSubject<boolean>(false);
  public userPermissions$ = new BehaviorSubject<AuthPermissions>({
    canUpload: false,
    canDelete: false,
    canShare: false,
    canExport: false,
    isAdmin: false
  });

  // Token refresh stream
  private tokenRefresh$: Observable<void>;

  constructor(
    private apiService: ApiService,
    private storageService: StorageService
  ) {
    this.initializeTokenRefresh();
    this.restoreSession();
  }

  /**
   * Enhanced login with MFA and biometric support
   */
  public async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      // Initial authentication
      const response = await this.apiService.post<AuthResponse>(
        API_ROUTES.AUTH.LOGIN,
        credentials,
        {
          headers: this.getSecurityHeaders(),
          timeout: 10000
        }
      );

      if (response.data.mfaRequired) {
        this.isMFARequired$.next(true);
        return response.data;
      }

      // Handle biometric enrollment if enabled
      if (credentials.biometricToken) {
        await this.storageService.setItem('biometric_token', credentials.biometricToken, {
          encrypt: true,
          namespace: 'auth'
        });
      }

      await this.handleAuthSuccess(response.data);
      return response.data;

    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * MFA verification with security logging
   */
  public async verifyMFA(mfaCredentials: MFACredentials): Promise<AuthResponse> {
    try {
      const response = await this.apiService.post<AuthResponse>(
        API_ROUTES.AUTH.VERIFY_MFA,
        mfaCredentials,
        {
          headers: this.getSecurityHeaders(),
          timeout: 10000
        }
      );

      await this.handleAuthSuccess(response.data);
      this.isMFARequired$.next(false);
      return response.data;

    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Biometric authentication support
   */
  public async authenticateWithBiometrics(): Promise<boolean> {
    try {
      const result = await LocalAuthentication.authenticate(this.BIOMETRIC_CONFIG);
      if (result.verified) {
        const biometricToken = await this.storageService.getItem<string>(
          'biometric_token',
          { encrypt: true, namespace: 'auth' }
        );
        if (biometricToken) {
          await this.login({
            biometricToken,
            deviceId: await this.getDeviceId()
          });
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return false;
    }
  }

  /**
   * Secure logout with session cleanup
   */
  public async logout(): Promise<void> {
    try {
      await this.apiService.post(API_ROUTES.AUTH.LOGOUT);
      await this.clearAuthState();
    } catch (error) {
      console.error('Logout error:', error);
      await this.clearAuthState();
    }
  }

  /**
   * Token refresh mechanism
   */
  private async refreshToken(): Promise<void> {
    try {
      const refreshToken = await this.storageService.getItem<string>(
        'refresh_token',
        { encrypt: true, namespace: 'auth' }
      );

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.apiService.post<AuthResponse>(
        API_ROUTES.AUTH.REFRESH,
        { refreshToken },
        { headers: this.getSecurityHeaders() }
      );

      await this.handleAuthSuccess(response.data);
    } catch (error) {
      await this.clearAuthState();
      throw this.handleAuthError(error);
    }
  }

  /**
   * Initialize automatic token refresh
   */
  private initializeTokenRefresh(): void {
    this.tokenRefresh$ = timer(0, 30000).pipe(
      switchMap(async () => {
        const token = await this.storageService.getItem<string>(
          'access_token',
          { encrypt: true, namespace: 'auth' }
        );

        if (token) {
          const payload = jwtDecode<TokenPayload>(token);
          const timeUntilExpiry = payload.exp * 1000 - Date.now();

          if (timeUntilExpiry < this.TOKEN_REFRESH_THRESHOLD * 1000) {
            await this.refreshToken();
          }
        }
      })
    );

    this.tokenRefresh$.subscribe();
  }

  /**
   * Restore previous session if valid
   */
  private async restoreSession(): Promise<void> {
    try {
      const token = await this.storageService.getItem<string>(
        'access_token',
        { encrypt: true, namespace: 'auth' }
      );

      if (token) {
        const payload = jwtDecode<TokenPayload>(token);
        if (payload.exp * 1000 > Date.now()) {
          await this.refreshToken();
        } else {
          await this.clearAuthState();
        }
      }
    } catch (error) {
      await this.clearAuthState();
    }
  }

  /**
   * Handle successful authentication
   */
  private async handleAuthSuccess(response: AuthResponse): Promise<void> {
    await Promise.all([
      this.storageService.setItem('access_token', response.accessToken, {
        encrypt: true,
        namespace: 'auth',
        expiresIn: response.expiresIn * 1000
      }),
      this.storageService.setItem('refresh_token', response.refreshToken, {
        encrypt: true,
        namespace: 'auth'
      }),
      this.storageService.setItem('user', response.user, {
        encrypt: true,
        namespace: 'auth'
      })
    ]);

    this.currentUser$.next(response.user);
    this.isAuthenticated$.next(true);
    this.userPermissions$.next(response.permissions);
  }

  /**
   * Clear authentication state
   */
  private async clearAuthState(): Promise<void> {
    await this.storageService.clear();
    this.currentUser$.next(null);
    this.isAuthenticated$.next(false);
    this.isMFARequired$.next(false);
    this.userPermissions$.next({
      canUpload: false,
      canDelete: false,
      canShare: false,
      canExport: false,
      isAdmin: false
    });
  }

  /**
   * Get security headers for requests
   */
  private getSecurityHeaders(): Record<string, string> {
    return {
      'X-Client-Version': '1.0.0',
      'X-Device-Type': 'web',
      'X-Request-ID': crypto.randomUUID()
    };
  }

  /**
   * Get device identifier
   */
  private async getDeviceId(): Promise<string> {
    let deviceId = await this.storageService.getItem<string>('device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      await this.storageService.setItem('device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(error: any): ApiError {
    const apiError: ApiError = {
      code: 'UNAUTHORIZED',
      message: 'Authentication failed',
      details: error,
      correlationId: error.correlationId || '',
      timestamp: Date.now(),
      path: 'auth.service.ts',
      retryable: false
    };

    if (error.response?.status === 401) {
      this.clearAuthState();
    }

    return apiError;
  }
}

export default AuthService;