/**
 * @fileoverview Core TypeScript type definitions for API communication
 * @version 1.0.0
 * 
 * Comprehensive type definitions for API interactions including:
 * - Request/Response interfaces
 * - Error handling
 * - HTTP/gRPC methods
 * - Security features
 * - Streaming capabilities
 */

import { API_CONFIG } from '../config/api.config';
import { AxiosResponse, AxiosError } from 'axios'; // version: ^1.4.0

/**
 * Enhanced HTTP method types including gRPC support
 */
export type HttpMethod = 
  | 'GET' 
  | 'POST' 
  | 'PUT' 
  | 'DELETE' 
  | 'PATCH' 
  | 'HEAD' 
  | 'OPTIONS' 
  | 'CONNECT' 
  | 'TRACE'
  | 'GRPC_UNARY'
  | 'GRPC_SERVER_STREAM'
  | 'GRPC_CLIENT_STREAM'
  | 'GRPC_BIDI_STREAM';

/**
 * Comprehensive API error codes
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'
  | 'DEADLINE_EXCEEDED'
  | 'UNAVAILABLE'
  | 'CANCELLED'
  | 'ALREADY_EXISTS'
  | 'RESOURCE_EXHAUSTED'
  | 'FAILED_PRECONDITION'
  | 'ABORTED'
  | 'OUT_OF_RANGE'
  | 'UNIMPLEMENTED'
  | 'DATA_LOSS';

/**
 * Enhanced API response content types
 */
export type ApiResponseType =
  | 'application/json'
  | 'multipart/form-data'
  | 'application/octet-stream'
  | 'application/grpc'
  | 'application/grpc-web'
  | 'application/grpc-web+proto'
  | 'text/event-stream'
  | 'application/x-protobuf';

/**
 * Comprehensive API status codes
 */
export enum ApiStatus {
  SUCCESS = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  PRECONDITION_FAILED = 412,
  PAYLOAD_TOO_LARGE = 413,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503
}

/**
 * Enhanced interface for API headers with security features
 */
export interface ApiHeaders {
  'Authorization'?: string;
  'Content-Type': ApiResponseType;
  'Accept': ApiResponseType;
  'X-Request-ID': string;
  'X-CSRF-Token'?: string;
  'X-API-Version': typeof API_CONFIG.API_VERSION;
  'X-Correlation-ID': string;
  'X-Client-ID': string;
}

/**
 * Generic API response interface
 */
export interface ApiResponse<T = unknown> {
  data: T;
  status: ApiStatus;
  message: string;
  metadata?: {
    timestamp: number;
    version: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
}

/**
 * Enhanced API error interface with correlation tracking
 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
  correlationId: string;
  timestamp: number;
  path: string;
  stack?: string;
  retryable: boolean;
}

/**
 * WebSocket message interface
 */
export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  sessionId: string;
  metadata?: {
    userId: string;
    deviceId: string;
    version: string;
  };
}

/**
 * Streaming response interface
 */
export interface StreamingResponse<T = unknown> {
  stream: ReadableStream<T>;
  totalChunks: number;
  chunkSize: number;
  contentType: ApiResponseType;
  metadata: {
    startTime: number;
    endTime?: number;
    compression?: string;
    encryption?: string;
  };
}

/**
 * API request configuration interface
 */
export interface ApiRequestConfig {
  method: HttpMethod;
  url: string;
  headers: Partial<ApiHeaders>;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  validateStatus?: (status: number) => boolean;
  withCredentials: boolean;
  responseType?: ApiResponseType;
  onUploadProgress?: (progressEvent: ProgressEvent) => void;
  onDownloadProgress?: (progressEvent: ProgressEvent) => void;
}

/**
 * API error response type with Axios integration
 */
export type ApiErrorResponse = AxiosError<ApiError> & {
  config: ApiRequestConfig;
  status?: number;
  correlationId: string;
};

/**
 * API success response type with Axios integration
 */
export type ApiSuccessResponse<T> = AxiosResponse<ApiResponse<T>> & {
  config: ApiRequestConfig;
  correlationId: string;
};

/**
 * Health data streaming message interface
 */
export interface HealthStreamMessage {
  type: 'metric' | 'alert' | 'status';
  deviceId: string;
  timestamp: number;
  data: {
    metricType: string;
    value: number;
    unit: string;
    confidence?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * API rate limit information interface
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * API batch operation response interface
 */
export interface BatchOperationResponse<T = unknown> {
  successful: Array<ApiResponse<T>>;
  failed: Array<ApiError>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    timestamp: number;
  };
}

/**
 * API health check response interface
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  version: string;
  services: Record<string, {
    status: string;
    latency: number;
    lastCheck: number;
  }>;
}