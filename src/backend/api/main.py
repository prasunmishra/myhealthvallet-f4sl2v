"""
Main FastAPI application entry point for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements HIPAA-compliant API with comprehensive security, monitoring, and health checks.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from structlog import get_logger
from secure import SecureHeaders, SecurityHeaders

from api.routers import auth_router, docs_router, health_router
from api.middleware.security import SecurityMiddleware, get_security_middleware
from api.middleware.rate_limit import rate_limit_middleware
from api.middleware.auth import AuthMiddleware, get_auth_middleware
from core.config import settings
from core.logging import setup_logging
from core.exceptions import PHRSATBaseException

# Configure logging
logger = setup_logging()

# Security headers configuration
SECURITY_HEADERS = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
}

def create_application() -> FastAPI:
    """
    Create and configure the FastAPI application with HIPAA compliance.
    
    Returns:
        FastAPI: Configured FastAPI application instance
    """
    # Initialize FastAPI with enhanced security settings
    app = FastAPI(
        title="PHRSAT API",
        description="Personal Health Record Store and Analysis Tool API",
        version="1.0.0",
        docs_url="/api/docs" if settings.DEBUG else None,
        redoc_url="/api/redoc" if settings.DEBUG else None,
        openapi_url="/api/openapi.json" if settings.DEBUG else None
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Client-ID",
            "X-Correlation-ID",
            "X-Device-ID",
            "X-MFA-Token"
        ],
        expose_headers=[
            "X-Rate-Limit-Limit",
            "X-Rate-Limit-Remaining",
            "X-Rate-Limit-Reset"
        ],
        max_age=3600
    )

    # Add security middleware
    app.add_middleware(SecurityMiddleware)
    
    # Add rate limiting middleware
    app.middleware("http")(rate_limit_middleware)

    # Configure Prometheus metrics
    instrumentator = Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        should_instrument_requests_inprogress=True,
        excluded_handlers=[".*admin.*", "/metrics"],
        env_var_name="ENABLE_METRICS",
        inprogress_name="http_requests_inprogress",
        inprogress_labels=True
    )
    instrumentator.instrument(app)

    # Include routers
    app.include_router(
        auth_router,
        prefix="/api/v1/auth",
        tags=["authentication"]
    )
    app.include_router(
        docs_router,
        prefix="/api/v1/documents",
        tags=["documents"]
    )
    app.include_router(
        health_router,
        prefix="/api/v1/health",
        tags=["health"]
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next) -> Response:
        """Add security headers to all responses."""
        response = await call_next(request)
        secure_headers = SecureHeaders()
        secure_headers.update(response.headers)
        return response

    @app.middleware("http")
    async def log_requests(request: Request, call_next) -> Response:
        """Log all requests with correlation ID."""
        correlation_id = request.headers.get("X-Correlation-ID")
        logger.info(
            "Request started",
            correlation_id=correlation_id,
            path=request.url.path,
            method=request.method
        )
        response = await call_next(request)
        logger.info(
            "Request completed",
            correlation_id=correlation_id,
            status_code=response.status_code
        )
        return response

    @app.exception_handler(PHRSATBaseException)
    async def phrsat_exception_handler(request: Request, exc: PHRSATBaseException) -> Response:
        """Handle custom PHRSAT exceptions."""
        logger.error(
            "Application error",
            error_code=exc.error_code,
            error_message=exc.message,
            request_id=exc.request_id
        )
        return Response(
            content=exc.to_dict(),
            status_code=exc.status_code,
            media_type="application/json"
        )

    @app.get("/health")
    async def health_check() -> Dict:
        """API health check endpoint."""
        return {
            "status": "healthy",
            "version": settings.APP_VERSION,
            "environment": settings.ENV_STATE
        }

    return app

# Create application instance
app = create_application()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        ssl_keyfile=settings.SSL_KEYFILE if not settings.DEBUG else None,
        ssl_certfile=settings.SSL_CERTFILE if not settings.DEBUG else None,
        ssl_version=2  # TLS 1.3
    )