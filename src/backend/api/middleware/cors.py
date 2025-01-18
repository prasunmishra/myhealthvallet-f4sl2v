"""
CORS (Cross-Origin Resource Sharing) middleware configuration for PHRSAT API.
Implements secure cross-origin request handling with HIPAA compliance, enhanced security features,
audit logging, and strict origin validation.

Version: 1.0.0
"""

from typing import Dict, List, Optional, Tuple
from functools import lru_cache

from fastapi import Request, Response  # fastapi v0.100+
from fastapi.middleware.cors import CORSMiddleware  # fastapi v0.100+
from fastapi_cache import cache  # fastapi-cache v0.1.0+

from core.config import Settings
from api.settings import get_api_settings
from core.logging import get_logger

# Initialize logger with security context
logger = get_logger(
    __name__,
    {"module": "cors_middleware", "security_context": "api_security"}
)

class CORSConfiguration:
    """Enhanced CORS configuration manager with HIPAA compliance and security controls."""

    def __init__(self):
        """Initialize enhanced CORS configuration with security settings."""
        self.api_settings = get_api_settings()
        self.allowed_origins: List[str] = self.api_settings.CORS_ORIGINS
        self.allowed_methods: List[str] = [
            "GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"
        ]
        self.allowed_headers: List[str] = [
            "Authorization",
            "Content-Type",
            "X-API-Key",
            "X-Request-ID",
            "X-CSRF-Token",
            "X-HIPAA-Compliance"
        ]
        self.allow_credentials: bool = True
        self.max_age: int = 600  # 10 minutes
        self.security_headers: Dict[str, str] = {
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "X-Permitted-Cross-Domain-Policies": "none"
        }
        self.origin_cache: Dict[str, bool] = {}

    def get_middleware_config(self) -> Dict:
        """Get enhanced CORS middleware configuration with security settings."""
        config = {
            "allow_origins": self.allowed_origins,
            "allow_methods": self.allowed_methods,
            "allow_headers": self.allowed_headers,
            "allow_credentials": self.allow_credentials,
            "max_age": self.max_age,
            "expose_headers": [
                "X-Request-ID",
                "X-HIPAA-Compliance",
                "X-Content-Type-Options"
            ]
        }

        # Add additional security headers for production
        if Settings.ENV_STATE == "production":
            config["expose_headers"].extend([
                "Content-Security-Policy",
                "Strict-Transport-Security"
            ])

        return config

    @cache(expire=300)  # Cache validation results for 5 minutes
    async def is_origin_allowed(self, origin: str) -> bool:
        """Enhanced origin validation with caching and security checks."""
        if not origin:
            return False

        # Check cache first
        if origin in self.origin_cache:
            return self.origin_cache[origin]

        # Production requires HTTPS
        if Settings.ENV_STATE == "production" and not origin.startswith("https://"):
            logger.warning(f"Rejected non-HTTPS origin in production: {origin}")
            return False

        # Validate against allowed origins
        is_allowed = origin in self.allowed_origins
        self.origin_cache[origin] = is_allowed

        # Log validation result for audit
        logger.info(
            f"Origin validation: {origin}",
            extra={
                "event_type": "cors_validation",
                "origin": origin,
                "allowed": is_allowed
            }
        )

        return is_allowed

    async def validate_request_headers(
        self, headers: Dict[str, str]
    ) -> Tuple[bool, Optional[str]]:
        """Validate incoming request headers for security compliance."""
        required_headers = ["Origin", "Host"]
        
        # Check required headers
        for header in required_headers:
            if header not in headers:
                return False, f"Missing required header: {header}"

        # Check for prohibited headers
        prohibited_headers = ["X-Forwarded-Host", "X-Forwarded-Proto"]
        for header in prohibited_headers:
            if header in headers:
                logger.warning(f"Prohibited header detected: {header}")
                return False, f"Prohibited header detected: {header}"

        return True, None

def get_cors_middleware() -> CORSMiddleware:
    """Create configured CORS middleware instance with enhanced security."""
    cors_config = CORSConfiguration()
    middleware_config = cors_config.get_middleware_config()
    
    return CORSMiddleware(
        app=None,  # Will be set by FastAPI
        **middleware_config
    )

async def validate_cors(request: Request, response: Response) -> Response:
    """Enhanced middleware function to validate CORS requests with security controls."""
    cors_config = CORSConfiguration()
    
    # Get and validate origin
    origin = request.headers.get("Origin")
    if origin:
        is_allowed = await cors_config.is_origin_allowed(origin)
        if not is_allowed:
            logger.warning(
                f"Blocked request from unauthorized origin: {origin}",
                extra={"security_event": "unauthorized_cors_request"}
            )
            response.status_code = 403
            return response

    # Validate request headers
    valid_headers, error_message = await cors_config.validate_request_headers(
        dict(request.headers)
    )
    if not valid_headers:
        logger.warning(
            f"Invalid request headers: {error_message}",
            extra={"security_event": "invalid_headers"}
        )
        response.status_code = 400
        return response

    # Add security headers
    for header, value in cors_config.security_headers.items():
        response.headers[header] = value

    # Add HIPAA compliance header
    response.headers["X-HIPAA-Compliance"] = "enforced"

    return response

# Export CORS-related components
__all__ = [
    "CORSConfiguration",
    "get_cors_middleware",
    "validate_cors"
]