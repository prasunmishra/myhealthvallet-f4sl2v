"""
Authentication service module for PHRSAT providing enhanced security features including
device fingerprinting, rate limiting, and comprehensive audit logging.

Version: 1.0.0
"""

from datetime import datetime, timedelta
import logging
from typing import Dict, Optional

from fastapi import HTTPException  # fastapi v0.100+
from fastapi_limiter import RateLimiter  # fastapi-limiter v0.1.5+
from device_detector import DeviceFingerprint  # device-detector v5.0.0+
from security_audit_logger import SecurityAuditLogger  # security-audit-logger v2.0.0+
from jwt_token_manager import TokenManager  # jwt-token-manager v1.0.0+

from api.auth.models import User
from core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Error messages
AUTH_FAILED_MESSAGE = "Invalid credentials or account not found"
MFA_FAILED_MESSAGE = "Invalid MFA code or backup code provided"
RATE_LIMIT_EXCEEDED = "Too many authentication attempts, please try again later"
DEVICE_TRUST_REQUIRED = "Device verification required for this account"

class AuthenticationService:
    """Enhanced service class handling user authentication operations with advanced security features."""

    def __init__(
        self,
        token_manager: TokenManager,
        audit_logger: SecurityAuditLogger,
        rate_limiter: RateLimiter,
        device_detector: DeviceFingerprint
    ):
        """Initialize authentication service with enhanced security components."""
        self._token_manager = token_manager
        self._audit_logger = audit_logger
        self._rate_limiter = rate_limiter
        self._device_detector = device_detector

    async def authenticate_user(
        self,
        email: str,
        password: str,
        device_info: Dict
    ) -> Dict:
        """
        Authenticate user with enhanced security checks including device fingerprinting
        and rate limiting.
        """
        try:
            # Check rate limiting
            if not await self._rate_limiter.check_rate_limit(email):
                self._audit_logger.log_security_event(
                    "rate_limit_exceeded",
                    {"email": email, "device_info": device_info}
                )
                raise HTTPException(status_code=429, detail=RATE_LIMIT_EXCEEDED)

            # Generate device fingerprint
            device_fingerprint = self._device_detector.generate_fingerprint(device_info)

            # Find and validate user
            user = User.objects(email=email).first()
            if not user or not user.verify_password(password):
                self._audit_logger.log_security_event(
                    "failed_login_attempt",
                    {"email": email, "device_fingerprint": device_fingerprint}
                )
                raise HTTPException(status_code=401, detail=AUTH_FAILED_MESSAGE)

            # Check device trust status
            device_trusted = device_fingerprint in user.device_fingerprints.values()
            
            # Handle MFA requirement
            if user.mfa_enabled and not device_trusted:
                self._audit_logger.log_security_event(
                    "mfa_required",
                    {"user_id": str(user.id), "device_fingerprint": device_fingerprint}
                )
                return {
                    "requires_mfa": True,
                    "user_id": str(user.id),
                    "device_fingerprint": device_fingerprint
                }

            # Generate enhanced JWT with security claims
            access_token = self._token_manager.create_access_token(
                user_id=str(user.id),
                roles=user.roles,
                device_fingerprint=device_fingerprint
            )
            refresh_token = self._token_manager.create_refresh_token(
                user_id=str(user.id),
                device_fingerprint=device_fingerprint
            )

            # Update user's last login and device info
            user.last_login = datetime.utcnow()
            user.last_ip_address = device_info.get("ip_address")
            if device_trusted:
                user.device_fingerprints[device_fingerprint] = {
                    "last_used": datetime.utcnow(),
                    "device_info": device_info
                }
            user.save()

            # Log successful authentication
            self._audit_logger.log_security_event(
                "successful_login",
                {
                    "user_id": str(user.id),
                    "device_fingerprint": device_fingerprint,
                    "device_trusted": device_trusted
                }
            )

            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "user_id": str(user.id),
                "roles": user.roles,
                "requires_device_verification": not device_trusted
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Authentication error: {str(e)}")
            raise HTTPException(status_code=500, detail="Authentication service error")

    async def verify_mfa(
        self,
        user_id: str,
        mfa_code: str,
        device_info: Dict
    ) -> Dict:
        """Enhanced MFA verification with backup codes support and device trust management."""
        try:
            user = User.objects(id=user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            # Generate device fingerprint
            device_fingerprint = self._device_detector.generate_fingerprint(device_info)

            # Verify MFA code
            if not user.verify_mfa_code(mfa_code):
                self._audit_logger.log_security_event(
                    "failed_mfa_verification",
                    {
                        "user_id": user_id,
                        "device_fingerprint": device_fingerprint
                    }
                )
                raise HTTPException(status_code=401, detail=MFA_FAILED_MESSAGE)

            # Update device trust status
            user.device_fingerprints[device_fingerprint] = {
                "last_used": datetime.utcnow(),
                "device_info": device_info,
                "trusted": True
            }
            user.save()

            # Generate enhanced JWT with MFA claims
            access_token = self._token_manager.create_access_token(
                user_id=str(user.id),
                roles=user.roles,
                device_fingerprint=device_fingerprint,
                mfa_verified=True
            )
            refresh_token = self._token_manager.create_refresh_token(
                user_id=str(user.id),
                device_fingerprint=device_fingerprint
            )

            # Log successful MFA verification
            self._audit_logger.log_security_event(
                "successful_mfa_verification",
                {
                    "user_id": user_id,
                    "device_fingerprint": device_fingerprint
                }
            )

            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "device_trusted": True
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"MFA verification error: {str(e)}")
            raise HTTPException(status_code=500, detail="MFA verification service error")

def get_auth_service(
    token_manager: TokenManager,
    audit_logger: SecurityAuditLogger,
    rate_limiter: RateLimiter,
    device_detector: DeviceFingerprint
) -> AuthenticationService:
    """Enhanced dependency injection provider for AuthenticationService."""
    return AuthenticationService(
        token_manager=token_manager,
        audit_logger=audit_logger,
        rate_limiter=rate_limiter,
        device_detector=device_detector
    )