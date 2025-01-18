"""
Enhanced authentication middleware for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements secure JWT token validation, MFA verification, rate limiting, and comprehensive
security monitoring for HIPAA-compliant API authentication and authorization.

Version: 1.0.0
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple

from fastapi import Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from python_security_manager import SecurityManager  # version ^1.0.0
from python_audit_logger import AuditLogger  # version ^2.0.0

from services.auth.jwt import JWTManager

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
TOKEN_REFRESH_THRESHOLD_MINUTES = 15
AUTH_HEADER_NAME = "Authorization"
MAX_AUTH_ATTEMPTS = 5
RATE_LIMIT_WINDOW_MINUTES = 15
MFA_TIMEOUT_SECONDS = 300
PERMISSION_CACHE_TTL_SECONDS = 300

class AuthMiddleware:
    """Enhanced middleware class for secure authentication and authorization with MFA support."""

    def __init__(
        self,
        jwt_manager: JWTManager,
        security_manager: SecurityManager,
        audit_logger: AuditLogger
    ):
        """Initialize auth middleware with enhanced security services."""
        self._jwt_manager = jwt_manager
        self._security_manager = security_manager
        self._audit_logger = audit_logger
        self._auth_scheme = HTTPBearer(auto_error=True)
        
        # Initialize caches
        self._rate_limit_cache: Dict[str, Tuple[int, datetime]] = {}
        self._permission_cache: Dict[str, Dict] = {}
        
        logger.info("AuthMiddleware initialized with security services")

    async def authenticate(self, request: Request) -> Dict:
        """
        Enhanced authentication with MFA, rate limiting, and security monitoring.
        Implements comprehensive security checks and audit logging.
        """
        try:
            # Check rate limiting
            client_ip = request.client.host
            rate_limit_key = f"{client_ip}:auth"
            
            if not self._check_rate_limit(rate_limit_key):
                self._audit_logger.log_security_event(
                    event_type="rate_limit_exceeded",
                    ip_address=client_ip,
                    severity="WARNING"
                )
                raise ValueError("Rate limit exceeded")

            # Extract and validate Bearer token
            credentials: HTTPAuthorizationCredentials = await self._auth_scheme(request)
            if not credentials or not credentials.credentials:
                raise ValueError("Invalid authorization header")

            # Verify token format and signature
            token_payload = await self._jwt_manager.verify_token(
                credentials.credentials,
                device_id=request.headers.get("X-Device-ID")
            )

            # Validate device fingerprint if present
            device_id = request.headers.get("X-Device-ID")
            if device_id and not await self._jwt_manager.validate_device_fingerprint(
                token_payload, device_id
            ):
                raise ValueError("Invalid device fingerprint")

            # Verify MFA if required
            mfa_token = request.headers.get("X-MFA-Token")
            if token_payload.get("mfa_required", False):
                if not mfa_token or not await self._verify_mfa(
                    token_payload["sub"], mfa_token
                ):
                    raise ValueError("MFA verification failed")

            # Check token refresh threshold
            if self._should_refresh_token(token_payload):
                new_token = await self._jwt_manager.refresh_token(
                    credentials.credentials,
                    device_id=device_id
                )
                token_payload["new_token"] = new_token

            # Build enhanced security context
            security_context = {
                "user_id": token_payload["sub"],
                "roles": token_payload.get("roles", []),
                "permissions": token_payload.get("permissions", []),
                "device_id": device_id,
                "ip_address": client_ip,
                "session_id": request.headers.get("X-Session-ID"),
                "correlation_id": request.headers.get("X-Correlation-ID"),
                "mfa_verified": bool(mfa_token)
            }

            # Log successful authentication
            self._audit_logger.log_security_event(
                event_type="authentication_success",
                user_id=security_context["user_id"],
                ip_address=client_ip,
                details=security_context
            )

            return security_context

        except Exception as e:
            # Log authentication failure
            self._audit_logger.log_security_event(
                event_type="authentication_failure",
                ip_address=request.client.host,
                error=str(e),
                severity="ERROR"
            )
            raise

    async def authorize(self, security_context: Dict, resource: str, action: str) -> bool:
        """
        Enhanced authorization with hierarchical permissions and audit logging.
        Implements role-based access control with permission caching.
        """
        try:
            # Check permission cache
            cache_key = f"{security_context['user_id']}:{resource}:{action}"
            cached_result = self._permission_cache.get(cache_key)
            if cached_result and cached_result["expires_at"] > datetime.utcnow():
                return cached_result["authorized"]

            # Verify hierarchical permissions
            authorized = False
            user_permissions = security_context.get("permissions", [])
            required_permission = f"{resource}:{action}"

            if "*:*" in user_permissions:
                authorized = True
            elif f"{resource}:*" in user_permissions:
                authorized = True
            elif required_permission in user_permissions:
                authorized = True

            # Cache authorization result
            self._permission_cache[cache_key] = {
                "authorized": authorized,
                "expires_at": datetime.utcnow() + timedelta(seconds=PERMISSION_CACHE_TTL_SECONDS)
            }

            # Log authorization decision
            self._audit_logger.log_security_event(
                event_type="authorization_check",
                user_id=security_context["user_id"],
                resource=resource,
                action=action,
                authorized=authorized,
                details={
                    "roles": security_context.get("roles", []),
                    "required_permission": required_permission
                }
            )

            return authorized

        except Exception as e:
            logger.error(f"Authorization error: {str(e)}")
            return False

    async def verify_security_context(self, security_context: Dict) -> bool:
        """
        Verify complete security context including device and session integrity.
        Implements comprehensive security verification for the request context.
        """
        try:
            # Validate session freshness
            session_id = security_context.get("session_id")
            if session_id and not await self._verify_session(session_id):
                return False

            # Check device trust status
            device_id = security_context.get("device_id")
            if device_id and not await self._verify_device_trust(
                security_context["user_id"],
                device_id
            ):
                return False

            # Verify security parameters
            if not all([
                security_context.get("user_id"),
                security_context.get("roles"),
                security_context.get("ip_address")
            ]):
                return False

            # Log security verification
            self._audit_logger.log_security_event(
                event_type="security_context_verification",
                user_id=security_context["user_id"],
                details=security_context
            )

            return True

        except Exception as e:
            logger.error(f"Security context verification error: {str(e)}")
            return False

    def _check_rate_limit(self, key: str) -> bool:
        """Check rate limiting for authentication attempts."""
        now = datetime.utcnow()
        if key in self._rate_limit_cache:
            attempts, start_time = self._rate_limit_cache[key]
            if (now - start_time).total_seconds() > (RATE_LIMIT_WINDOW_MINUTES * 60):
                self._rate_limit_cache[key] = (1, now)
                return True
            if attempts >= MAX_AUTH_ATTEMPTS:
                return False
            self._rate_limit_cache[key] = (attempts + 1, start_time)
        else:
            self._rate_limit_cache[key] = (1, now)
        return True

    async def _verify_mfa(self, user_id: str, mfa_token: str) -> bool:
        """Verify MFA token with timeout."""
        try:
            return await self._security_manager.verify_mfa_token(
                user_id,
                mfa_token,
                timeout=MFA_TIMEOUT_SECONDS
            )
        except Exception as e:
            logger.error(f"MFA verification error: {str(e)}")
            return False

    def _should_refresh_token(self, token_payload: Dict) -> bool:
        """Check if token should be refreshed based on expiration threshold."""
        exp_timestamp = token_payload.get("exp")
        if not exp_timestamp:
            return False
        
        exp_time = datetime.fromtimestamp(exp_timestamp)
        refresh_threshold = datetime.utcnow() + timedelta(minutes=TOKEN_REFRESH_THRESHOLD_MINUTES)
        return exp_time <= refresh_threshold

    async def _verify_session(self, session_id: str) -> bool:
        """Verify session validity and freshness."""
        try:
            return await self._security_manager.verify_session(session_id)
        except Exception:
            return False

    async def _verify_device_trust(self, user_id: str, device_id: str) -> bool:
        """Verify device trust status for user."""
        try:
            return await self._security_manager.verify_device_trust(user_id, device_id)
        except Exception:
            return False

def get_auth_middleware() -> AuthMiddleware:
    """Factory function for creating enhanced AuthMiddleware instance."""
    from core.config import settings
    
    jwt_manager = JWTManager(settings)
    security_manager = SecurityManager()
    audit_logger = AuditLogger()
    
    return AuthMiddleware(jwt_manager, security_manager, audit_logger)

# Export middleware components
__all__ = ["AuthMiddleware", "get_auth_middleware"]