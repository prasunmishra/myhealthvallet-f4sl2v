"""
Middleware initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Configures and exports API middleware components with comprehensive security, monitoring,
and HIPAA compliance features.

Version: 1.0.0
"""

from typing import Dict, List, Optional

from fastapi import FastAPI
from prometheus_client import Counter, Histogram
import structlog

from api.middleware.auth import AuthMiddleware, get_auth_middleware
from api.middleware.cors import get_cors_middleware
from api.middleware.rate_limit import RateLimiter
from api.middleware.security import SecurityMiddleware, get_security_middleware
from api.middleware.tracing import TracingMiddleware

# Configure structured logging
logger = structlog.get_logger(__name__)

# Prometheus metrics for middleware monitoring
MIDDLEWARE_LATENCY = Histogram(
    "middleware_processing_seconds",
    "Middleware processing time in seconds",
    ["middleware_name"]
)

MIDDLEWARE_ERRORS = Counter(
    "middleware_errors_total",
    "Total middleware processing errors",
    ["middleware_name", "error_type"]
)

# Default middleware order for optimal security and performance
MIDDLEWARE_ORDER = [
    "security",    # Security headers and WAF protection first
    "cors",        # CORS validation before authentication
    "auth",        # Authentication and authorization
    "rate_limit",  # Rate limiting after authentication
    "tracing"      # Request tracing last
]

# HIPAA compliance headers
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'",
    "X-XSS-Protection": "1; mode=block",
    "X-HIPAA-Compliance": "enforced"
}

def configure_middleware(app: FastAPI, config: Dict) -> FastAPI:
    """
    Configure and register all middleware for the FastAPI application with comprehensive
    security, monitoring, and HIPAA compliance features.

    Args:
        app: FastAPI application instance
        config: Middleware configuration dictionary

    Returns:
        Configured FastAPI application with middleware stack
    """
    try:
        logger.info("Initializing middleware stack with security controls")

        # Initialize security middleware first
        security_middleware = get_security_middleware(config.get("security", {}))
        app.add_middleware(
            SecurityMiddleware,
            security_headers=SECURITY_HEADERS,
            waf_enabled=True
        )

        # Configure CORS with strict security policies
        cors_middleware = get_cors_middleware()
        app.add_middleware(
            cors_middleware.__class__,
            **cors_middleware.get_middleware_config()
        )

        # Initialize authentication middleware
        auth_middleware = get_auth_middleware()
        app.add_middleware(
            AuthMiddleware,
            auth_required=True,
            token_verification=True
        )

        # Configure rate limiting
        rate_limiter = RateLimiter(
            rate_limit=config.get("rate_limit", {}).get("requests_per_minute", 60),
            window_seconds=config.get("rate_limit", {}).get("window_seconds", 60)
        )
        app.add_middleware(
            rate_limiter.__class__,
            enable_monitoring=True
        )

        # Add distributed tracing
        app.add_middleware(
            TracingMiddleware,
            sampling_rate=config.get("tracing", {}).get("sampling_rate", 0.1)
        )

        # Register middleware monitoring
        @app.middleware("http")
        async def monitor_middleware(request, call_next):
            start_time = time.time()
            try:
                response = await call_next(request)
                MIDDLEWARE_LATENCY.labels(
                    middleware_name="all"
                ).observe(time.time() - start_time)
                return response
            except Exception as e:
                MIDDLEWARE_ERRORS.labels(
                    middleware_name="all",
                    error_type=type(e).__name__
                ).inc()
                raise

        logger.info("Middleware stack configured successfully")
        return app

    except Exception as e:
        logger.error(f"Failed to configure middleware: {str(e)}")
        raise RuntimeError("Middleware configuration failed") from e

# Export middleware components
__all__ = [
    "configure_middleware",
    "AuthMiddleware",
    "SecurityMiddleware",
    "RateLimiter",
    "TracingMiddleware",
    "MIDDLEWARE_ORDER",
    "SECURITY_HEADERS"
]