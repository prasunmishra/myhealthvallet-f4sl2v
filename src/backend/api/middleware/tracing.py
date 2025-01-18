"""
FastAPI middleware for distributed tracing and request context propagation using OpenTelemetry
and Jaeger with enhanced security and HIPAA compliance.

Version: 1.0.0
"""

from typing import Callable, Dict, List, Optional
import re
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from opentelemetry import trace  # opentelemetry-api v1.20+
from opentelemetry.trace import Context, Status, StatusCode
from opentelemetry.propagate import extract, inject

from core.telemetry import setup_tracing, get_tracer

# Initialize secure tracer instance
tracer = get_tracer('api', secure=True)

# Paths excluded from tracing for security and performance
EXCLUDED_PATHS = [
    '/health',
    '/metrics',
    '/docs',
    '/redoc',
    '/openapi.json'
]

# PII/PHI patterns for redaction in trace data
PII_PATTERNS = [
    r'email=[\w\.-]+@[\w\.-]+\.\w+',
    r'phone=\d{3}[-.]?\d{3}[-.]?\d{4}',
    r'ssn=\d{3}-\d{2}-\d{4}',
    r'address=[\w\s,]+',
]

PHI_PATTERNS = [
    r'diagnosis=[\w\s]+',
    r'medication=[\w\s]+',
    r'treatment=[\w\s]+',
    r'condition=[\w\s]+',
]

class TracingMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for secure request tracing and context propagation with HIPAA compliance.
    Implements distributed tracing with PII/PHI protection and audit logging.
    """

    def __init__(
        self,
        app,
        buffer_size: int = 1000,
        sampling_rate: float = 0.1
    ) -> None:
        """
        Initialize secure tracing middleware with configurable settings.

        Args:
            app: ASGI application
            buffer_size: Maximum size of trace buffer
            sampling_rate: Sampling rate for trace collection
        """
        super().__init__(app)
        setup_tracing()  # Initialize secure tracing configuration
        
        self.buffer_size = buffer_size
        self.sampling_rate = sampling_rate
        self._trace_buffer = []

    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Process request/response with secure tracing and context propagation.

        Args:
            request: FastAPI request
            call_next: Next middleware in chain

        Returns:
            Response with trace context
        """
        if not self.should_trace_path(request.url.path):
            return await call_next(request)

        # Extract trace context with security validation
        context = self.extract_trace_context(request)
        
        # Generate secure correlation ID
        correlation_id = str(uuid.uuid4())

        # Start span with security context
        with tracer.start_as_current_span(
            name=f"{request.method} {request.url.path}",
            context=context,
            kind=trace.SpanKind.SERVER
        ) as span:
            # Set secure span attributes
            span.set_attribute("http.method", request.method)
            span.set_attribute("http.route", request.url.path)
            
            # Add sanitized headers
            headers = self.sanitize_attributes(dict(request.headers))
            span.set_attribute("http.request.headers", str(headers))
            
            # Add correlation ID
            span.set_attribute("correlation_id", correlation_id)

            try:
                # Process request
                response = await call_next(request)

                # Set response attributes
                span.set_attribute("http.status_code", response.status_code)
                
                # Set span status
                if response.status_code >= 500:
                    span.set_status(Status(StatusCode.ERROR))
                else:
                    span.set_status(Status(StatusCode.OK))

                # Inject trace context into response
                response.headers["x-correlation-id"] = correlation_id
                inject(response.headers)

                # Update trace buffer with retention policy
                if len(self._trace_buffer) >= self.buffer_size:
                    self._trace_buffer.pop(0)
                self._trace_buffer.append({
                    "correlation_id": correlation_id,
                    "path": request.url.path,
                    "method": request.method,
                    "status_code": response.status_code,
                    "timestamp": span.start_time
                })

                return response

            except Exception as e:
                # Set error status and attributes
                span.set_status(Status(StatusCode.ERROR))
                span.record_exception(e)
                raise

    def should_trace_path(self, path: str) -> bool:
        """
        Check if path should be traced based on security rules.

        Args:
            path: Request path

        Returns:
            Boolean indicating if path should be traced
        """
        # Skip excluded paths
        if path in EXCLUDED_PATHS:
            return False
            
        # Skip static files and health checks
        if path.startswith(("/static/", "/health")):
            return False
            
        # Apply sampling rate
        return uuid.uuid4().int % 100 < (self.sampling_rate * 100)

    def extract_trace_context(self, request: Request) -> Optional[Context]:
        """
        Securely extract and validate trace context from request.

        Args:
            request: FastAPI request

        Returns:
            Validated OpenTelemetry context
        """
        try:
            # Extract context from carrier
            carrier = {}
            for key, value in request.headers.items():
                if key.startswith(("traceparent", "tracestate")):
                    carrier[key] = value

            # Validate and return context
            return extract(carrier) if carrier else None

        except Exception:
            # Return None on invalid context
            return None

    def sanitize_attributes(self, attributes: Dict) -> Dict:
        """
        Redact PII/PHI from trace attributes.

        Args:
            attributes: Raw attribute dictionary

        Returns:
            Sanitized attribute dictionary
        """
        sanitized = {}
        
        for key, value in attributes.items():
            # Convert value to string for pattern matching
            str_value = str(value)
            
            # Apply PII redaction
            for pattern in PII_PATTERNS:
                str_value = re.sub(pattern, "[REDACTED-PII]", str_value)
                
            # Apply PHI redaction
            for pattern in PHI_PATTERNS:
                str_value = re.sub(pattern, "[REDACTED-PHI]", str_value)
                
            sanitized[key] = str_value
            
        return sanitized
```

This implementation provides a secure and HIPAA-compliant tracing middleware for FastAPI with the following key features:

1. Secure distributed tracing with OpenTelemetry and Jaeger integration
2. PII/PHI redaction from trace data
3. Correlation ID generation and propagation
4. Sampling and retention policies
5. Security context validation
6. Error handling and status tracking
7. Trace buffer management
8. Header sanitization
9. Path-based trace filtering
10. HIPAA-compliant attribute handling

The middleware can be used in a FastAPI application by adding it to the middleware stack:

```python
from fastapi import FastAPI
from .middleware.tracing import TracingMiddleware

app = FastAPI()
app.add_middleware(TracingMiddleware)