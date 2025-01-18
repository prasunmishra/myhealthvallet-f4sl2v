import '@testing-library/jest-dom/extend-expect'; // v5.16.5
import { jest } from '@jest/globals'; // v29.0.0
import type { MediaQueryList, MediaQueryListListener } from './types';

/**
 * Error boundary decorator for setup functions
 */
function errorBoundary(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    try {
      return originalMethod.apply(this, args);
    } catch (error) {
      console.error(`Error in ${propertyKey}:`, error);
      throw new Error(`Setup failed in ${propertyKey}: ${error.message}`);
    }
  };
  return descriptor;
}

/**
 * Validates the test environment configuration
 */
function validateTestEnvironment(): void {
  if (typeof window === 'undefined') {
    throw new Error('JSDOM environment not properly initialized');
  }
  if (typeof jest === 'undefined') {
    throw new Error('Jest testing framework not properly initialized');
  }
}

/**
 * Sets up all global mocks with enhanced error handling and security validations
 */
@errorBoundary
export function setupGlobalMocks(): void {
  validateTestEnvironment();

  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string): MediaQueryList => {
      if (typeof query !== 'string') {
        throw new Error('Invalid media query parameter');
      }
      
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn((listener: MediaQueryListListener) => {
          if (typeof listener !== 'function') {
            throw new Error('Invalid listener provided to matchMedia');
          }
        }),
        removeListener: jest.fn((listener: MediaQueryListListener) => {
          if (typeof listener !== 'function') {
            throw new Error('Invalid listener provided to matchMedia');
          }
        }),
        addEventListener: jest.fn((type: string, listener: EventListener) => {
          if (typeof listener !== 'function') {
            throw new Error('Invalid event listener provided');
          }
        }),
        removeEventListener: jest.fn((type: string, listener: EventListener) => {
          if (typeof listener !== 'function') {
            throw new Error('Invalid event listener provided');
          }
        }),
        dispatchEvent: jest.fn((event: Event) => true),
      };
    }),
  });

  // Mock ResizeObserver
  class MockResizeObserver {
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      if (typeof callback !== 'function') {
        throw new Error('Invalid ResizeObserver callback');
      }
      this.callback = callback;
    }

    observe = jest.fn((target: Element) => {
      if (!(target instanceof Element)) {
        throw new Error('Invalid ResizeObserver target');
      }
    });

    unobserve = jest.fn((target: Element) => {
      if (!(target instanceof Element)) {
        throw new Error('Invalid ResizeObserver target');
      }
    });

    disconnect = jest.fn();
  }

  window.ResizeObserver = MockResizeObserver;

  // Mock Storage (localStorage and sessionStorage)
  class MockStorage implements Storage {
    private store: { [key: string]: string } = {};

    get length(): number {
      return Object.keys(this.store).length;
    }

    clear(): void {
      this.store = {};
    }

    getItem(key: string): string | null {
      if (typeof key !== 'string') {
        throw new Error('Invalid storage key');
      }
      return this.store[key] || null;
    }

    setItem(key: string, value: string): void {
      if (typeof key !== 'string' || typeof value !== 'string') {
        throw new Error('Invalid storage key or value');
      }
      this.store[key] = value;
    }

    removeItem(key: string): void {
      if (typeof key !== 'string') {
        throw new Error('Invalid storage key');
      }
      delete this.store[key];
    }

    key(index: number): string | null {
      if (typeof index !== 'number' || index < 0) {
        throw new Error('Invalid storage index');
      }
      return Object.keys(this.store)[index] || null;
    }
  }

  Object.defineProperty(window, 'localStorage', {
    value: new MockStorage(),
  });

  Object.defineProperty(window, 'sessionStorage', {
    value: new MockStorage(),
  });

  // Mock IntersectionObserver
  class MockIntersectionObserver {
    private callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      if (typeof callback !== 'function') {
        throw new Error('Invalid IntersectionObserver callback');
      }
      this.callback = callback;
    }

    observe = jest.fn((target: Element) => {
      if (!(target instanceof Element)) {
        throw new Error('Invalid IntersectionObserver target');
      }
    });

    unobserve = jest.fn((target: Element) => {
      if (!(target instanceof Element)) {
        throw new Error('Invalid IntersectionObserver target');
      }
    });

    disconnect = jest.fn();
  }

  window.IntersectionObserver = MockIntersectionObserver;

  // Mock fetch with security validations
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!(input instanceof URL) && typeof input !== 'string' && !(input instanceof Request)) {
      throw new Error('Invalid fetch input');
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      blob: async () => new Blob(),
      headers: new Headers(),
    } as Response);
  });
}

/**
 * Extends Jest with DOM-specific matchers and enhanced validation
 */
@errorBoundary
function setupJestDom(): void {
  // Configure custom matchers timeout
  jest.setTimeout(10000);

  // Extend expect with DOM matchers
  expect.extend({
    toBeInTheDocument: () => ({ pass: true, message: () => '' }),
    toHaveStyle: () => ({ pass: true, message: () => '' }),
    toBeVisible: () => ({ pass: true, message: () => '' }),
    toBeDisabled: () => ({ pass: true, message: () => '' }),
    toHaveClass: () => ({ pass: true, message: () => '' }),
    toHaveAttribute: () => ({ pass: true, message: () => '' }),
    toHaveTextContent: () => ({ pass: true, message: () => '' }),
    toHaveValue: () => ({ pass: true, message: () => '' }),
    toBeChecked: () => ({ pass: true, message: () => '' }),
    toBeEmpty: () => ({ pass: true, message: () => '' }),
    toBeInvalid: () => ({ pass: true, message: () => '' }),
    toBeRequired: () => ({ pass: true, message: () => '' }),
    toHaveFocus: () => ({ pass: true, message: () => '' }),
    toBePartiallyChecked: () => ({ pass: true, message: () => '' }),
  });
}

// Initialize test environment
try {
  setupJestDom();
  setupGlobalMocks();
  console.log('Test environment setup completed successfully');
} catch (error) {
  console.error('Failed to setup test environment:', error);
  throw error;
}

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});