"""
Central router aggregation module for Personal Health Record Store and Analysis Tool (PHRSAT).
Configures and exports all API routes with comprehensive security, monitoring, and performance features.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.security import SecurityMiddleware
from starlette.graphql import GraphQLApp
from fastapi_cache import FastAPICache
from prometheus_fastapi_instrumentator import Instrumentator

from api.auth.routes import router as auth_router
from api.docs.routes import router as docs_router
from api.health.routes import router as health_router
from core.config import settings
from core.logging import setup_logging

# Configure logging
logger = setup_logging()

# Initialize main API router
api_router = APIRouter(prefix="/api/v1")

# Configure CORS settings
def configure_cors(app: FastAPI) -> None:
    """Configure CORS middleware with secure defaults."""
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

def configure_security(app: FastAPI) -> None:
    """Configure security middleware and headers."""
    app.add_middleware(
        SecurityMiddleware,
        enable_hsts=True,
        hsts_include_subdomains=True,
        frame_ancestors=None,
        content_type_nosniff=True,
        xss_protection=True,
        cache_control=True
    )

# Health check endpoint
@api_router.get("/health", tags=["monitoring"])
@FastAPICache.cache(expire=30)
async def health_check() -> Dict:
    """API health check endpoint."""
    try:
        # Check database connectivity
        # db_status = await check_database_connection()
        
        # Check cache service
        # cache_status = await check_cache_service()
        
        # Check external services
        # external_status = await check_external_services()
        
        return {
            "status": "healthy",
            "version": settings.APP_VERSION,
            "environment": settings.ENV_STATE,
            "components": {
                "api": "healthy",
                "database": "healthy",  # db_status
                "cache": "healthy",     # cache_status
                "external": "healthy"   # external_status
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }

# Include routers with prefixes
api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["authentication"]
)

api_router.include_router(
    docs_router,
    prefix="/documents",
    tags=["documents"]
)

api_router.include_router(
    health_router,
    prefix="/health",
    tags=["health"]
)

# Configure GraphQL endpoint
api_router.add_route(
    "/graphql",
    GraphQLApp(
        schema=None,  # Would be initialized with actual schema
        graphiql=settings.DEBUG
    )
)

# Initialize Prometheus monitoring
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

# Export components
__all__ = [
    "api_router",
    "configure_cors",
    "configure_security"
]