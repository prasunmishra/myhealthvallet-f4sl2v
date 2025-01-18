"""
API-specific settings module for Personal Health Record Store and Analysis Tool (PHRSAT).
Configures FastAPI application settings, middleware, and API-level configurations
with enhanced security and HIPAA compliance features.

Version: 1.0.0
"""

from typing import Dict, List, Optional
from functools import lru_cache

from fastapi import FastAPI  # fastapi v0.100+
from fastapi.middleware.cors import CORSMiddleware  # fastapi v0.100+
from pydantic import BaseSettings, Field  # pydantic v1.10+

from core.config import Settings, ENV_STATE, get_mongodb_url, validate_security_config
from core.constants import API_VERSION, DEFAULT_PAGE_SIZE

class APISettings(Settings):
    """
    Enhanced API-specific settings extending core application settings with
    comprehensive security and compliance features for HIPAA compliance.
    """

    # API Documentation Settings
    API_TITLE: str = Field(
        default="PHRSAT API",
        description="API title for OpenAPI documentation"
    )
    API_DESCRIPTION: str = Field(
        default="Personal Health Record Store and Analysis Tool API",
        description="API description for OpenAPI documentation"
    )
    API_VERSION: str = Field(default=API_VERSION)
    OPENAPI_URL: str = Field(default="/openapi.json")
    DOCS_URL: str = Field(default="/docs")

    # Rate Limiting Settings
    RATE_LIMIT_PER_MINUTE: int = Field(
        default=60,
        ge=1,
        description="Maximum requests per minute per client"
    )
    RATE_LIMIT_CONFIG: Dict = Field(
        default={
            "default_limit": 60,
            "healthcare_provider_limit": 120,
            "burst_multiplier": 2,
            "timeframe_minutes": 1
        }
    )

    # Security and CORS Settings
    ALLOWED_HOSTS: List[str] = Field(
        default=["localhost", "127.0.0.1"],
        description="List of allowed hosts"
    )
    CORS_CONFIG: Dict = Field(
        default={
            "allow_credentials": True,
            "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": [
                "Authorization",
                "Content-Type",
                "X-API-Key",
                "X-Request-ID"
            ],
            "expose_headers": ["X-Request-ID"],
            "max_age": 600
        }
    )

    # Security Headers
    SECURITY_HEADERS: Dict = Field(
        default={
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        }
    )

    # Audit Configuration
    AUDIT_CONFIG: Dict = Field(
        default={
            "enabled": True,
            "log_requests": True,
            "log_responses": True,
            "exclude_paths": ["/health", "/metrics"],
            "mask_sensitive_data": True,
            "retention_days": 90
        }
    )

    def __init__(self, **kwargs):
        """Initialize API settings with enhanced security defaults and environment overrides."""
        super().__init__(**kwargs)
        
        # Production-specific security enhancements
        if self.ENV_STATE == "production":
            self.DOCS_URL = None  # Disable Swagger UI in production
            self.OPENAPI_URL = None  # Disable OpenAPI schema in production
            self.RATE_LIMIT_PER_MINUTE = 30  # Stricter rate limiting
            self.CORS_CONFIG["allow_origins"] = [
                origin for origin in self.CORS_ORIGINS
                if origin.startswith("https://")
            ]
            self.AUDIT_CONFIG["enabled"] = True
            self.AUDIT_CONFIG["log_responses"] = True

    def get_cors_config(self) -> Dict:
        """Get enhanced CORS middleware configuration with security headers."""
        cors_config = {
            "allow_origins": self.CORS_ORIGINS,
            **self.CORS_CONFIG,
            "allow_origin_regex": None
        }

        # Add HIPAA compliance headers
        if self.ENV_STATE == "production":
            cors_config.update({
                "expose_headers": [
                    *self.CORS_CONFIG["expose_headers"],
                    "X-HIPAA-Compliance"
                ]
            })

        return cors_config

    def get_middleware_config(self) -> Dict:
        """Get comprehensive API middleware configuration."""
        return {
            "cors": {
                "class": CORSMiddleware,
                "config": self.get_cors_config()
            },
            "trusted_hosts": {
                "allowed_hosts": self.ALLOWED_HOSTS,
                "www_redirect": False
            },
            "security_headers": self.SECURITY_HEADERS,
            "rate_limit": {
                "rate_limit": self.RATE_LIMIT_PER_MINUTE,
                "timeframe": 60,
                "config": self.RATE_LIMIT_CONFIG
            },
            "audit": self.AUDIT_CONFIG
        }

@lru_cache()
def get_api_settings() -> APISettings:
    """Get API settings singleton instance with validation."""
    settings = APISettings()
    settings.validate_security_settings()
    return settings

def create_application() -> FastAPI:
    """Create and configure FastAPI application instance with enhanced security."""
    settings = get_api_settings()
    
    app = FastAPI(
        title=settings.API_TITLE,
        description=settings.API_DESCRIPTION,
        version=settings.API_VERSION,
        docs_url=settings.DOCS_URL,
        openapi_url=settings.OPENAPI_URL,
        default_response_class=None,  # Disable default JSON response for security
        redoc_url=None  # Disable ReDoc
    )

    # Configure middleware stack
    middleware_config = settings.get_middleware_config()
    app.add_middleware(CORSMiddleware, **middleware_config["cors"]["config"])

    # Add security headers middleware
    @app.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        for header, value in settings.SECURITY_HEADERS.items():
            response.headers[header] = value
        return response

    return app

# Global instances
api_settings = get_api_settings()
app = create_application()

# Exports
__all__ = [
    "APISettings",
    "get_api_settings",
    "create_application",
    "app"
]