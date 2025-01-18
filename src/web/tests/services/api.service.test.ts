import { describe, expect, jest, beforeAll, beforeEach, afterEach, test } from '@jest/globals'; // version: ^29.0.0
import axios from 'axios'; // version: ^1.4.0
import MockAdapter from 'axios-mock-adapter'; // version: ^1.21.5
import { MetricsCollector } from 'jest-mock-metrics'; // version: ^1.2.0

import ApiService from '../../src/services/api.service';
import { API_CONFIG } from '../../src/config/api.config';
import { ApiStatus, ApiError, HttpMethod } from '../../src/types/api.types';

describe('ApiService Tests', () => {
  let apiService: ApiService;
  let mockAxios: MockAdapter;
  let metricsCollector: jest.Mocked<MetricsCollector>;

  // Mock configuration objects
  const mockCircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 30000,
    monitorInterval: 10000
  };

  const mockGrpcConfig = {
    address: 'localhost:50051',
    options: { 'grpc.keepalive_timeout_ms': 10000 }
  };

  beforeAll(() => {
    // Initialize metrics collector mock
    metricsCollector = {
      recordMetric: jest.fn(),
      getMetrics: jest.fn(),
      clearMetrics: jest.fn()
    };
    
    // Set test environment variables
    process.env.REACT_APP_API_BASE_URL = 'http://test-api.phrsat.com';
    process.env.REACT_APP_ENV = 'test';
  });

  beforeEach(() => {
    // Create new API service instance for each test
    apiService = new ApiService(mockCircuitBreakerConfig, mockGrpcConfig);
    mockAxios = new MockAdapter(axios);
    
    // Reset circuit breaker state
    apiService['circuitBreaker'].reset();
    
    // Clear metrics
    metricsCollector.clearMetrics();
  });

  afterEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
  });

  describe('ApiService Constructor', () => {
    test('should initialize with correct base URL and version', () => {
      expect(apiService['baseUrl']).toBe(process.env.REACT_APP_API_BASE_URL);
      expect(apiService['instance'].defaults.baseURL).toBe(process.env.REACT_APP_API_BASE_URL);
    });

    test('should configure request interceptors with correlation ID', () => {
      const request = apiService['instance'].interceptors.request.handlers[0];
      expect(request).toBeDefined();
      expect(typeof request.fulfilled).toBe('function');
      expect(typeof request.rejected).toBe('function');
    });

    test('should configure response interceptors with metrics', () => {
      const response = apiService['instance'].interceptors.response.handlers[0];
      expect(response).toBeDefined();
      expect(typeof response.fulfilled).toBe('function');
      expect(typeof response.rejected).toBe('function');
    });

    test('should set up circuit breaker with config', () => {
      expect(apiService['circuitBreaker']).toBeDefined();
      expect(apiService['circuitBreaker'].state).toBe('closed');
    });

    test('should initialize security headers', () => {
      const headers = apiService['createSecurityHeaders']('test-correlation', 'test-csrf');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-API-Version']).toBe(API_CONFIG.API_VERSION);
      expect(headers['X-CSRF-Token']).toBe('test-csrf');
    });
  });

  describe('Circuit Breaker Behavior', () => {
    test('should open circuit after threshold failures', async () => {
      const url = '/test';
      mockAxios.onGet(url).reply(500);

      // Generate failures to trigger circuit breaker
      for (let i = 0; i < mockCircuitBreakerConfig.failureThreshold; i++) {
        try {
          await apiService.request('GET', url);
        } catch (error) {
          // Expected errors
        }
      }

      expect(apiService['circuitBreaker'].state).toBe('open');
    });

    test('should half-open circuit after timeout', async () => {
      // Set circuit breaker to open state
      apiService['circuitBreaker'].forceOpen();
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, mockCircuitBreakerConfig.resetTimeout));
      
      expect(apiService['circuitBreaker'].state).toBe('half-open');
    });

    test('should close circuit after successful requests', async () => {
      // Set circuit breaker to half-open state
      apiService['circuitBreaker'].forceHalfOpen();
      
      const url = '/test';
      mockAxios.onGet(url).reply(200, { data: 'success' });
      
      await apiService.request('GET', url);
      expect(apiService['circuitBreaker'].state).toBe('closed');
    });
  });

  describe('Security Features', () => {
    test('should include CSRF token in requests', async () => {
      const url = '/test';
      const csrfToken = 'test-csrf-token';
      apiService['csrfToken'] = csrfToken;

      mockAxios.onPost(url).reply(config => {
        expect(config.headers['X-CSRF-Token']).toBe(csrfToken);
        return [200, { data: 'success' }];
      });

      await apiService.request('POST', url, { data: 'test' });
    });

    test('should track correlation IDs', async () => {
      const url = '/test';
      mockAxios.onGet(url).reply(config => {
        expect(config.headers['X-Correlation-ID']).toBeDefined();
        return [200, { data: 'success' }];
      });

      await apiService.request('GET', url);
    });

    test('should implement rate limiting', async () => {
      const url = '/test';
      mockAxios.onGet(url).reply(429, {}, {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '60',
        'retry-after': '30'
      });

      try {
        await apiService.request('GET', url);
      } catch (error) {
        const rateLimitInfo = apiService['getRateLimitInfo'](error.response.headers);
        expect(rateLimitInfo.limit).toBe(100);
        expect(rateLimitInfo.remaining).toBe(0);
        expect(rateLimitInfo.retryAfter).toBe(30);
      }
    });
  });

  describe('Monitoring Integration', () => {
    test('should collect request duration metrics', async () => {
      const url = '/test';
      mockAxios.onGet(url).reply(200, { data: 'success' });

      await apiService.request('GET', url);
      expect(metricsCollector.recordMetric).toHaveBeenCalledWith(
        'api_request_duration',
        expect.any(Number),
        { method: 'GET', path: url }
      );
    });

    test('should track error rates', async () => {
      const url = '/test';
      mockAxios.onGet(url).reply(500);

      try {
        await apiService.request('GET', url);
      } catch (error) {
        expect(metricsCollector.recordMetric).toHaveBeenCalledWith(
          'api_error_count',
          1,
          { method: 'GET', path: url, status: 500 }
        );
      }
    });

    test('should monitor circuit breaker states', () => {
      apiService['circuitBreaker'].forceOpen();
      expect(metricsCollector.recordMetric).toHaveBeenCalledWith(
        'circuit_breaker_state',
        1,
        { state: 'open' }
      );
    });

    test('should track retry attempts', async () => {
      const url = '/test';
      mockAxios.onGet(url).reply(503);

      try {
        await apiService.request('GET', url);
      } catch (error) {
        expect(metricsCollector.recordMetric).toHaveBeenCalledWith(
          'api_retry_count',
          expect.any(Number),
          { method: 'GET', path: url }
        );
      }
    });
  });
});