"""
Authentication service initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides comprehensive security features including JWT authentication, OAuth 2.0 integration,
multi-factor authentication, role-based access control, and security monitoring.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional

# prometheus-client v0.16.0
from prometheus_client import Counter, Histogram, Gauge
# sentry-sdk v1.28.1
import sentry_sdk

from services.auth.jwt import JWTManager, get_token_payload
from services.auth.oauth import OAuthManager, generate_oauth_state
from services.auth.permissions import PermissionManager, require_permission
from core.config import Settings
from core.security import SecurityManager
from core.logging import get_logger

# Configure logging
logger = get_logger(__name__)

# Version tracking
VERSION = "1.0.0"

# Authentication provider configuration
AUTH_PROVIDERS = {
    "google": "google",
    "apple": "apple",
    "email": "email"
}

# Security configuration
SECURITY_CONFIG = {
    "max_attempts": 5,
    "lockout_duration": 300,  # 5 minutes
    "token_expiry": 3600,     # 1 hour
    "mfa_required": True
}

# Prometheus metrics
auth_requests = Counter(
    'phrsat_auth_requests_total',
    'Total authentication requests',
    ['provider', 'status']
)

auth_latency = Histogram(
    'phrsat_auth_latency_seconds',
    'Authentication request latency',
    ['provider']
)

active_sessions = Gauge(
    'phrsat_active_sessions',
    'Number of active user sessions'
)

class AuthenticationService:
    """
    Core authentication service providing comprehensive security features and monitoring.
    """

    def __init__(self, settings: Settings):
        """Initialize authentication service with security configurations."""
        self._settings = settings
        self._security_manager = SecurityManager(settings)
        
        # Initialize authentication managers
        self._jwt_manager = JWTManager(
            settings=settings,
            redis_client=settings.get_redis_client(),
            audit_logger=get_logger("jwt_audit")
        )
        
        self._oauth_manager = OAuthManager(
            settings=settings,
            redis_client=settings.get_redis_client(),
            security_auditor=self._security_manager
        )
        
        self._permission_manager = PermissionManager(
            cache_ttl=300,  # 5 minutes
            enable_audit=True
        )

        logger.info("Authentication service initialized with secure configuration")

    def authenticate_user(
        self,
        provider: str,
        credentials: Dict,
        device_info: Optional[Dict] = None
    ) -> Dict:
        """
        Authenticate user with specified provider and credentials.
        Implements rate limiting, security monitoring, and audit logging.
        """
        try:
            # Validate provider
            if provider not in AUTH_PROVIDERS:
                raise ValueError(f"Unsupported authentication provider: {provider}")

            # Track authentication metrics
            with auth_latency.labels(provider).time():
                if provider == "google":
                    result = self._oauth_manager.verify_google_token(
                        credentials.get("token"),
                        device_info or {}
                    )
                elif provider == "apple":
                    result = self._oauth_manager.verify_apple_token(
                        credentials.get("token"),
                        device_info or {}
                    )
                else:  # email authentication
                    result = self._jwt_manager.verify_token(
                        credentials.get("token"),
                        device_info.get("device_id") if device_info else None
                    )

            # Update metrics
            auth_requests.labels(provider=provider, status="success").inc()
            active_sessions.inc()

            return result

        except Exception as e:
            # Log failure and update metrics
            logger.error(f"Authentication failed: {str(e)}")
            auth_requests.labels(provider=provider, status="failure").inc()
            
            # Report to Sentry if configured
            if self._settings.SENTRY_DSN:
                sentry_sdk.capture_exception(e)
            
            raise

    def verify_permissions(self, user_id: str, required_permissions: list) -> bool:
        """Verify user permissions with caching and audit logging."""
        try:
            for permission in required_permissions:
                if not self._permission_manager.has_permission(
                    user_id,
                    permission,
                    bypass_cache=False
                ):
                    return False
            return True
        except Exception as e:
            logger.error(f"Permission verification failed: {str(e)}")
            return False

# Export authentication components
__all__ = [
    'AuthenticationService',
    'JWTManager',
    'OAuthManager',
    'PermissionManager',
    'require_permission',
    'generate_oauth_state',
    'get_token_payload',
    'VERSION',
    'AUTH_PROVIDERS',
    'SECURITY_CONFIG'
]