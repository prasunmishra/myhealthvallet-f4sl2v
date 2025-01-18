import React from 'react'; // ^18.0.0
import { v4 as uuidv4 } from 'uuid'; // ^9.0.0
import winston from 'winston'; // ^3.8.0
import { Card } from './Card';
import { Toast } from './Toast';
import { useTheme } from '../../hooks/useTheme';

// Initialize HIPAA-compliant logger
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'error-boundary' },
  transports: [
    new winston.transports.Console(),
    // Additional secure transports would be configured in production
  ]
});

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo, errorId: string) => void;
  retryable?: boolean;
  maxRetries?: number;
  sanitizeErrors?: boolean;
  logToAnalytics?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  retryCount: number;
  lastErrorTimestamp: number | null;
}

const sanitizeErrorMessage = (error: Error): string => {
  let message = error.message;

  // Remove potential PHI patterns (e.g., SSN, email, phone numbers)
  message = message.replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[REDACTED-SSN]');
  message = message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED-EMAIL]');
  message = message.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED-PHONE]');

  // Remove potential stack trace paths that might contain sensitive info
  message = message.replace(/(?:file|directory):.+[\\/]([^\\/]+)$/g, 'file:[REDACTED]/$1');

  // Ensure message doesn't contain any JSON/Object strings that might have sensitive data
  try {
    JSON.parse(message);
    message = '[REDACTED-OBJECT]';
  } catch {
    // Not JSON, continue
  }

  return message;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0,
      lastErrorTimestamp: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const errorId = uuidv4();
    return {
      hasError: true,
      error,
      errorId,
      retryCount: 0,
      lastErrorTimestamp: Date.now()
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { onError, sanitizeErrors = true, logToAnalytics = true } = this.props;
    const { errorId } = this.state;

    // Sanitize error details for HIPAA compliance
    const sanitizedError = sanitizeErrors ? {
      message: sanitizeErrorMessage(error),
      stack: error.stack?.replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[REDACTED]')
    } : error;

    // Log error with HIPAA-compliant logger
    logger.error('React Error Boundary caught an error', {
      errorId,
      error: sanitizedError,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });

    // Send anonymized error to analytics if enabled
    if (logToAnalytics) {
      // Implementation would depend on analytics service
      // Ensure only sanitized data is sent
      console.info('Sending anonymized error to analytics', {
        errorId,
        type: error.name,
        timestamp: Date.now()
      });
    }

    // Execute custom error handler if provided
    if (onError) {
      onError(sanitizedError as Error, errorInfo, errorId as string);
    }

    // Handle retry logic if enabled
    if (this.props.retryable) {
      this.handleRetry();
    }
  }

  componentWillUnmount(): void {
    if (this.retryTimeoutId) {
      window.clearTimeout(this.retryTimeoutId);
    }
  }

  handleRetry = (): void => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount < maxRetries) {
      // Implement exponential backoff
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);

      this.retryTimeoutId = window.setTimeout(() => {
        this.setState(prevState => ({
          hasError: false,
          error: null,
          errorId: null,
          retryCount: prevState.retryCount + 1,
          lastErrorTimestamp: null
        }));
      }, backoffDelay);

      logger.info('Retrying after error', {
        retryCount: retryCount + 1,
        backoffDelay,
        errorId: this.state.errorId
      });
    }
  };

  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, retryable = false } = this.props;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return fallback;
    }

    // Default error UI
    return (
      <>
        <Card
          elevation={2}
          padding={24}
          testId="error-boundary-fallback"
          ariaLabel="Error occurred"
        >
          <h2>Something went wrong</h2>
          <p>{sanitizeErrorMessage(error as Error)}</p>
          {retryable && (
            <button
              onClick={this.handleRetry}
              aria-label="Retry"
              data-testid="error-retry-button"
            >
              Retry
            </button>
          )}
        </Card>
        <Toast
          message="An error occurred. Our team has been notified."
          type="error"
          duration={5000}
          position="top-right"
          onClose={() => {}}
        />
      </>
    );
  }
}

export type { ErrorBoundaryProps, ErrorBoundaryState };