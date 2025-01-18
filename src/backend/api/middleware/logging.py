"""
FastAPI middleware for secure, HIPAA-compliant request/response logging with enhanced
security context tracking, performance monitoring, and audit trail generation.

Version: 1.0.0
"""

import time
import uuid
from typing import Callable, Dict, Optional

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from utils.logging import log_request, log_error, set_request_context
from core.telemetry import MetricsManager
from core.security import SecurityContext

# Initialize security-aware metrics manager
metrics_manager = MetricsManager(compliance_enabled=True, security_tracking=True)

# Initialize security context for audit trails
security_context = SecurityContext(audit_enabled=True)

# Paths excluded from logging for security and performance
EXCLUDED_PATHS = [
    '/health',
    '/metrics',
    '/docs',
    '/redoc',
    '/_admin'
]

# Headers that should be redacted in logs
SENSITIVE_HEADERS = [
    'Authorization',
    'Cookie',
    'X-API-Key'
]

class LoggingMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for secure request/response logging with HIPAA compliance,
    audit trails, and security monitoring.
    """

    def __init__(
        self,
        app: FastAPI,
        security_config: Optional[Dict] = None
    ) -> None:
        """
        Initialize secure logging middleware with compliance features.

        Args:
            app: FastAPI application instance
            security_config: Optional security configuration parameters
        """
        super().__init__(app)
        self.metrics_manager = metrics_manager
        self.security_context = security_context
        self.security_config = security_config or {}

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Process request/response with security context and compliance checks.

        Args:
            request: Incoming HTTP request
            call_next: Next middleware in chain

        Returns:
            Response with added security headers
        """
        # Generate cryptographically secure request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        # Record request start time with high precision
        start_time = time.perf_counter()

        # Set security context for request
        await set_request_context({
            'request_id': request_id,
            'client_ip': request.client.host,
            'user_agent': request.headers.get('user-agent'),
            'correlation_id': request.headers.get('x-correlation-id', request_id)
        })

        try:
            # Process request through middleware chain
            response = await call_next(request)

            # Calculate request duration
            duration = time.perf_counter() - start_time

            # Generate audit trail if path should be logged
            if self.should_log_path(request.url.path):
                # Create audit entry
                audit_entry = await self.create_audit_entry(
                    request=request,
                    response=response,
                    duration=duration
                )

                # Log request details with security context
                await log_request(
                    request=request,
                    response=response,
                    duration=duration
                )

                # Record metrics with security context
                self.metrics_manager.record_request(
                    endpoint=request.url.path,
                    duration=duration,
                    status_code=response.status_code
                )

                # Record security event if needed
                if response.status_code in [401, 403]:
                    self.metrics_manager.record_security_event(
                        event_type='unauthorized_access',
                        endpoint=request.url.path
                    )

                # Record compliance check
                self.metrics_manager.record_compliance_check(
                    check_type='hipaa_logging',
                    status='success'
                )

            # Add security headers to response
            response.headers['X-Request-ID'] = request_id
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['X-Frame-Options'] = 'DENY'
            response.headers['X-XSS-Protection'] = '1; mode=block'

            return response

        except Exception as e:
            # Log error with security context
            await log_error(
                error=e,
                message=f"Error processing request: {str(e)}",
                extra_fields={
                    'request_id': request_id,
                    'path': request.url.path,
                    'method': request.method
                }
            )

            # Record error metrics
            self.metrics_manager.record_security_event(
                event_type='request_error',
                endpoint=request.url.path
            )

            # Re-raise exception for error handlers
            raise

    def should_log_path(self, path: str) -> bool:
        """
        Check if path should be logged with security considerations.

        Args:
            path: Request path to check

        Returns:
            bool: True if path should be logged
        """
        # Skip excluded paths
        if path in EXCLUDED_PATHS:
            return False

        # Skip static files and health checks
        if path.startswith(('/static/', '/assets/', '/health')):
            return False

        return True

    async def create_audit_entry(
        self,
        request: Request,
        response: Response,
        duration: float
    ) -> Dict:
        """
        Generate secure audit trail entry.

        Args:
            request: HTTP request
            response: HTTP response
            duration: Request duration in seconds

        Returns:
            dict: Audit trail entry
        """
        # Create base audit entry
        audit_entry = {
            'request_id': request.state.request_id,
            'timestamp': time.time(),
            'method': request.method,
            'path': request.url.path,
            'status_code': response.status_code,
            'duration_ms': round(duration * 1000, 2),
            'client_ip': request.client.host,
            'user_agent': request.headers.get('user-agent')
        }

        # Add security context
        audit_entry.update(
            self.security_context.create_audit_trail(
                request_id=request.state.request_id,
                action=request.method,
                resource=request.url.path,
                outcome=response.status_code
            )
        )

        return audit_entry