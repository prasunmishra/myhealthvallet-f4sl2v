"""
Enhanced JWT token management service for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements secure token generation, validation, and lifecycle management with HIPAA compliance
and comprehensive security monitoring.

Version: 1.0.0
"""

from datetime import datetime, timedelta
import logging
import uuid
from typing import Dict, Optional

import jwt  # python-jose v3.3+
import redis  # redis v4.5+

from core.config import Settings
from core.security import SecurityManager
from api.auth.models import User
from core.logging import AuditLogger

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
ALGORITHM = "RS256"
REFRESH_TOKEN_EXPIRE_DAYS = 30
TOKEN_BLACKLIST_PREFIX = "token_blacklist:"
MAX_TOKEN_VERSION = 1000

class JWTManager:
    """Enhanced manager class for JWT token operations with security monitoring and HIPAA compliance."""

    def __init__(self, settings: Settings, redis_client: redis.Redis, audit_logger: AuditLogger):
        """Initialize JWT manager with configuration and dependencies."""
        self._jwt_secret = settings.JWT_SECRET
        self._token_expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        self._algorithm = settings.JWT_ALGORITHM or ALGORITHM
        self._blacklist_client = redis_client
        self._audit_logger = audit_logger

        # Validate configuration
        if not self._jwt_secret or len(self._jwt_secret) < 32:
            raise ValueError("JWT secret must be at least 32 characters long")
        if not self._token_expire_minutes or self._token_expire_minutes < 5:
            raise ValueError("Token expiration must be at least 5 minutes")

        logger.info("JWTManager initialized with secure configuration")

    def create_access_token(
        self, 
        data: Dict,
        expires_delta: Optional[timedelta] = None,
        device_id: str = None
    ) -> str:
        """Create new JWT access token with enhanced security claims."""
        if not data:
            raise ValueError("Token data cannot be empty")

        try:
            # Create copy of data to avoid mutations
            token_data = data.copy()
            
            # Add security claims
            token_data.update({
                "jti": str(uuid.uuid4()),  # Unique token ID
                "iat": datetime.utcnow(),  # Issued at time
                "nbf": datetime.utcnow(),  # Not valid before
                "type": "access"
            })

            # Add device fingerprint if provided
            if device_id:
                token_data["device_id"] = device_id

            # Set token expiration
            expire = datetime.utcnow() + (
                expires_delta if expires_delta
                else timedelta(minutes=self._token_expire_minutes)
            )
            token_data["exp"] = expire

            # Encode token with RS256 algorithm
            encoded_token = jwt.encode(
                token_data,
                self._jwt_secret,
                algorithm=self._algorithm
            )

            # Log token creation
            self._audit_logger.log_token_event(
                event_type="token_creation",
                token_id=token_data["jti"],
                user_id=str(data.get("sub")),
                device_id=device_id,
                expiry=expire
            )

            return encoded_token

        except Exception as e:
            logger.error(f"Error creating access token: {str(e)}")
            raise RuntimeError("Token creation failed") from e

    def create_refresh_token(self, user: User, device_id: str = None) -> str:
        """Create new refresh token with rotation support."""
        try:
            # Generate secure refresh token
            refresh_token = SecurityManager.generate_secure_token()
            
            # Set token expiration
            expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
            
            # Increment user token version
            user.token_version = (user.token_version + 1) % MAX_TOKEN_VERSION
            
            # Hash token for storage
            hashed_token = SecurityManager.hash_token(refresh_token)
            
            # Update user refresh token fields
            user.refresh_token = hashed_token
            user.refresh_token_expires_at = expires_at
            user.save()

            # Log refresh token creation
            self._audit_logger.log_token_event(
                event_type="refresh_token_creation",
                user_id=str(user.id),
                device_id=device_id,
                expiry=expires_at
            )

            return refresh_token

        except Exception as e:
            logger.error(f"Error creating refresh token: {str(e)}")
            raise RuntimeError("Refresh token creation failed") from e

    def verify_token(self, token: str, device_id: str = None) -> Dict:
        """Verify and decode JWT token with comprehensive validation."""
        try:
            # Check token blacklist
            if self._is_token_blacklisted(token):
                raise jwt.JWTError("Token has been revoked")

            # Decode and verify token
            payload = jwt.decode(
                token,
                self._jwt_secret,
                algorithms=[self._algorithm]
            )

            # Verify device fingerprint if provided
            if device_id and payload.get("device_id") != device_id:
                raise jwt.JWTError("Invalid device fingerprint")

            # Log token verification
            self._audit_logger.log_token_event(
                event_type="token_verification",
                token_id=payload.get("jti"),
                user_id=str(payload.get("sub")),
                device_id=device_id,
                success=True
            )

            return payload

        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            raise
        except jwt.JWTError as e:
            logger.error(f"Token verification failed: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during token verification: {str(e)}")
            raise RuntimeError("Token verification failed") from e

    def verify_refresh_token(self, refresh_token: str, user: User, device_id: str = None) -> bool:
        """Verify refresh token with enhanced security checks."""
        try:
            # Verify token hash matches
            if not SecurityManager.hash_token(refresh_token) == user.refresh_token:
                return False

            # Check token expiration
            if not user.refresh_token_expires_at or \
               user.refresh_token_expires_at < datetime.utcnow():
                return False

            # Log verification attempt
            self._audit_logger.log_token_event(
                event_type="refresh_token_verification",
                user_id=str(user.id),
                device_id=device_id,
                success=True
            )

            return True

        except Exception as e:
            logger.error(f"Error verifying refresh token: {str(e)}")
            return False

    def revoke_token(self, token: str, token_type: str = "access") -> bool:
        """Revoke active token."""
        try:
            # Decode token without verification to get expiration
            payload = jwt.decode(
                token,
                self._jwt_secret,
                algorithms=[self._algorithm],
                options={"verify_signature": False}
            )

            # Add to blacklist with expiration
            blacklist_key = f"{TOKEN_BLACKLIST_PREFIX}{payload['jti']}"
            expiration = payload.get("exp")
            
            if expiration:
                ttl = expiration - datetime.utcnow().timestamp()
                if ttl > 0:
                    self._blacklist_client.setex(
                        blacklist_key,
                        int(ttl),
                        "1"
                    )

            # Log token revocation
            self._audit_logger.log_token_event(
                event_type="token_revocation",
                token_id=payload.get("jti"),
                user_id=str(payload.get("sub")),
                token_type=token_type
            )

            return True

        except Exception as e:
            logger.error(f"Error revoking token: {str(e)}")
            return False

    def _is_token_blacklisted(self, token: str) -> bool:
        """Check if token is blacklisted."""
        try:
            payload = jwt.decode(
                token,
                self._jwt_secret,
                algorithms=[self._algorithm],
                options={"verify_signature": False}
            )
            blacklist_key = f"{TOKEN_BLACKLIST_PREFIX}{payload['jti']}"
            return bool(self._blacklist_client.exists(blacklist_key))
        except Exception:
            return False

def get_token_payload(user: User, device_id: str = None) -> Dict:
    """Extract enhanced claims from user for token payload."""
    return {
        "sub": str(user.id),
        "email": user.email,
        "roles": user.roles,
        "permissions": list(user.get_effective_permissions()),
        "token_version": user.token_version,
        "device_id": device_id,
        "iss": "PHRSAT",
        "aud": "PHRSAT_API"
    }