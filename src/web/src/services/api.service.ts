/**
 * @fileoverview Enhanced API Service Implementation
 * @version 1.0.0
 * 
 * Provides centralized HTTP client functionality with advanced features:
 * - Circuit breaker pattern implementation
 * - gRPC support with REST fallback
 * - Comprehensive security headers
 * - Request/response correlation tracking
 * - Advanced retry logic with monitoring
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'; // version: ^1.4.0
import CircuitBreaker from 'circuit-breaker-js'; // version: ^0.5.0
import * as grpc from '@grpc/grpc-js'; // version: ^1.8.0
import { v4 as uuidv4 } from 'uuid'; // version: ^9.0.0

import { API_CONFIG } from '../config/api.config';
import { 
  ApiResponse, 
  ApiError, 
  ApiRequestConfig, 
  ApiHeaders,
  ApiStatus,
  HttpMethod,
  RateLimitInfo
} from '../types/api.types';

/**
 * Enhanced API Service with advanced security and communication features
 */
@injectable()
export class ApiService {
  private instance: AxiosInstance;
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;
  private grpcClient: grpc.Client;
  private correlationId: string;
  private csrfToken: string;

  constructor(
    @inject('CircuitBreakerConfig') private circuitBreakerConfig: any,
    @inject('GrpcConfig') private grpcConfig: any
  ) {
    this.baseUrl = API_CONFIG.BASE_URL;
    this.setupAxiosInstance();
    this.initializeCircuitBreaker();
    this.setupGrpcClient();
  }

  /**
   * Initialize Axios instance with enhanced configuration
   */
  private setupAxiosInstance(): void {
    this.instance = axios.create({
      baseURL: this.baseUrl,
      timeout: API_CONFIG.TIMEOUT.default,
      withCredentials: true,
      headers: this.getDefaultHeaders()
    });

    this.setupInterceptors();
  }

  /**
   * Initialize circuit breaker with configuration
   */
  private initializeCircuitBreaker(): void {
    this.circuitBreaker = new CircuitBreaker({
      windowDuration: API_CONFIG.SECURITY.circuitBreaker.monitorInterval,
      failureThreshold: API_CONFIG.SECURITY.circuitBreaker.failureThreshold,
      resetTimeout: API_CONFIG.SECURITY.circuitBreaker.resetTimeout
    });
  }

  /**
   * Setup gRPC client with fallback configuration
   */
  private setupGrpcClient(): void {
    const credentials = grpc.credentials.createSsl();
    this.grpcClient = new grpc.Client(
      this.grpcConfig.address,
      credentials,
      this.grpcConfig.options
    );
  }

  /**
   * Configure request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        this.correlationId = uuidv4();
        config.headers = {
          ...config.headers,
          ...this.createSecurityHeaders(this.correlationId, this.csrfToken)
        };
        return config;
      },
      (error) => Promise.reject(this.handleRequestError(error))
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => this.handleResponse(response),
      (error) => this.handleResponseError(error)
    );
  }

  /**
   * Create enhanced security headers
   */
  private createSecurityHeaders(correlationId: string, csrfToken: string): ApiHeaders {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-ID': uuidv4(),
      'X-API-Version': API_CONFIG.API_VERSION,
      'X-Correlation-ID': correlationId,
      'X-Client-ID': 'web-client',
      'X-CSRF-Token': csrfToken,
      ...API_CONFIG.SECURITY.headers
    };
  }

  /**
   * Enhanced generic request method with circuit breaker
   */
  public async request<T>(
    method: HttpMethod,
    url: string,
    data?: any,
    config: Partial<ApiRequestConfig> = {}
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      this.circuitBreaker.run(
        async () => {
          try {
            // Attempt gRPC if available
            if (this.isGrpcMethod(method)) {
              return await this.makeGrpcRequest<T>(method, url, data);
            }

            // Fallback to REST
            const response = await this.makeRestRequest<T>(method, url, data, config);
            return this.processResponse<T>(response);
          } catch (error) {
            throw this.handleRequestError(error);
          }
        },
        (error) => reject(error),
        () => reject(new Error('Circuit breaker is open'))
      );
    });
  }

  /**
   * Make REST request with enhanced error handling
   */
  private async makeRestRequest<T>(
    method: HttpMethod,
    url: string,
    data?: any,
    config: Partial<ApiRequestConfig> = {}
  ): Promise<AxiosResponse<ApiResponse<T>>> {
    const requestConfig: AxiosRequestConfig = {
      method,
      url,
      ...config,
      headers: {
        ...this.createSecurityHeaders(this.correlationId, this.csrfToken),
        ...config.headers
      }
    };

    if (data) {
      requestConfig.data = data;
    }

    return this.instance.request<ApiResponse<T>>(requestConfig);
  }

  /**
   * Make gRPC request with fallback handling
   */
  private async makeGrpcRequest<T>(
    method: HttpMethod,
    url: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + API_CONFIG.TIMEOUT.default / 1000);

      this.grpcClient.waitForReady(deadline, (error) => {
        if (error) {
          return reject(this.handleGrpcError(error));
        }

        // Implementation of gRPC method call
        const metadata = new grpc.Metadata();
        metadata.add('correlation-id', this.correlationId);

        // Handle different gRPC method types
        switch (method) {
          case 'GRPC_UNARY':
            this.handleUnaryCall<T>(url, data, metadata, resolve, reject);
            break;
          case 'GRPC_SERVER_STREAM':
            this.handleServerStream<T>(url, data, metadata, resolve, reject);
            break;
          default:
            reject(new Error('Unsupported gRPC method type'));
        }
      });
    });
  }

  /**
   * Handle unary gRPC calls
   */
  private handleUnaryCall<T>(
    url: string,
    data: any,
    metadata: grpc.Metadata,
    resolve: (value: ApiResponse<T>) => void,
    reject: (reason: any) => void
  ): void {
    this.grpcClient.makeUnaryRequest(
      url,
      data,
      metadata,
      (error, response) => {
        if (error) {
          reject(this.handleGrpcError(error));
        } else {
          resolve(this.processGrpcResponse<T>(response));
        }
      }
    );
  }

  /**
   * Advanced retry mechanism with exponential backoff
   */
  private async handleRetry(
    error: ApiError,
    attempt: number
  ): Promise<boolean> {
    if (attempt >= API_CONFIG.RETRY_POLICY.attempts) {
      return false;
    }

    const isRetryable = API_CONFIG.ERROR_HANDLING.retryableErrors.includes(error.code);
    if (!isRetryable) {
      return false;
    }

    const delay = Math.min(
      API_CONFIG.RETRY_POLICY.initialDelay * Math.pow(API_CONFIG.RETRY_POLICY.backoffFactor, attempt),
      API_CONFIG.RETRY_POLICY.maxDelay
    );

    await new Promise(resolve => setTimeout(resolve, delay));
    return true;
  }

  /**
   * Process API response with enhanced error handling
   */
  private processResponse<T>(response: AxiosResponse<ApiResponse<T>>): ApiResponse<T> {
    return {
      data: response.data.data,
      status: response.status as ApiStatus,
      message: response.data.message,
      metadata: {
        timestamp: Date.now(),
        version: API_CONFIG.API_VERSION,
        ...response.data.metadata
      }
    };
  }

  /**
   * Handle request errors with monitoring
   */
  private handleRequestError(error: any): ApiError {
    const apiError: ApiError = {
      code: this.getErrorCode(error),
      message: this.getErrorMessage(error),
      details: this.getErrorDetails(error),
      correlationId: this.correlationId,
      timestamp: Date.now(),
      path: error.config?.url || '',
      retryable: this.isRetryableError(error)
    };

    if (process.env.NODE_ENV !== 'production') {
      apiError.stack = error.stack;
    }

    return apiError;
  }

  /**
   * Get rate limit information from response headers
   */
  private getRateLimitInfo(headers: any): RateLimitInfo {
    return {
      limit: parseInt(headers['x-ratelimit-limit'] || '0', 10),
      remaining: parseInt(headers['x-ratelimit-remaining'] || '0', 10),
      reset: parseInt(headers['x-ratelimit-reset'] || '0', 10),
      retryAfter: parseInt(headers['retry-after'] || '0', 10)
    };
  }
}

export default ApiService;