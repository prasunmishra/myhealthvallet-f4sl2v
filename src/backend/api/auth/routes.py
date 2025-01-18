"""
Authentication router module for PHRSAT implementing HIPAA-compliant endpoints
with comprehensive security monitoring and device trust verification.

Version: 1.0.0
"""

from datetime import datetime
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status  # fastapi v0.100+
from fastapi_limiter import RateLimiter  # fastapi-limiter v0.1.5+
from device_trust_verification import DeviceFingerprint  # device-trust-verification v2.0.0+
from security_audit_logger import SecurityAuditLogger  # python-security-audit-logger v1.0.0+

from api.auth.services import AuthenticationService
from api.auth.models import UserCreate, UserLogin, TokenResponse, MFAVerification
from core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Error messages
AUTH_FAILED_MESSAGE = "Invalid credentials or account not found"
MFA_FAILED_MESSAGE = "Invalid MFA code provided"
OAUTH_FAILED_MESSAGE = "OAuth authentication failed"
DEVICE_TRUST_FAILED_MESSAGE = "Device verification failed"
RATE_LIMIT_MESSAGE = "Too many authentication attempts"

# Rate limiting configuration
RATE_LIMIT_ATTEMPTS = 5
RATE_LIMIT_WINDOW = 300  # 5 minutes

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserCreate,
    device_info: DeviceFingerprint,
    auth_service: AuthenticationService = Depends(),
    audit_logger: SecurityAuditLogger = Depends(),
    rate_limiter: RateLimiter = Depends()
) -> Dict:
    """
    Register new user with enhanced security checks and device verification.
    
    Args:
        user_data: User registration information
        device_info: Device fingerprint data
        auth_service: Authentication service instance
        audit_logger: Security audit logger instance
        rate_limiter: Rate limiting service
        
    Returns:
        TokenResponse containing JWT tokens and device verification status
    """
    try:
        # Check rate limiting
        if not await rate_limiter.check_rate_limit(
            f"register:{device_info.ip_address}",
            RATE_LIMIT_ATTEMPTS,
            RATE_LIMIT_WINDOW
        ):
            audit_logger.log_security_event(
                "registration_rate_limit_exceeded",
                {"ip_address": device_info.ip_address}
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=RATE_LIMIT_MESSAGE
            )

        # Register user and get tokens
        registration_result = await auth_service.register_user(
            user_data=user_data,
            device_info=device_info
        )

        # Log successful registration
        audit_logger.log_security_event(
            "user_registered",
            {
                "user_id": registration_result["user_id"],
                "device_fingerprint": device_info.fingerprint,
                "timestamp": datetime.utcnow().isoformat()
            }
        )

        return registration_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )

@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    device_info: DeviceFingerprint,
    auth_service: AuthenticationService = Depends(),
    audit_logger: SecurityAuditLogger = Depends(),
    rate_limiter: RateLimiter = Depends()
) -> Dict:
    """
    Authenticate user with MFA and device trust verification.
    
    Args:
        credentials: User login credentials
        device_info: Device fingerprint data
        auth_service: Authentication service instance
        audit_logger: Security audit logger instance
        rate_limiter: Rate limiting service
        
    Returns:
        TokenResponse containing JWT tokens or MFA requirement status
    """
    try:
        # Check rate limiting
        if not await rate_limiter.check_rate_limit(
            f"login:{credentials.email}",
            RATE_LIMIT_ATTEMPTS,
            RATE_LIMIT_WINDOW
        ):
            audit_logger.log_security_event(
                "login_rate_limit_exceeded",
                {"email": credentials.email}
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=RATE_LIMIT_MESSAGE
            )

        # Authenticate user
        auth_result = await auth_service.authenticate_user(
            email=credentials.email,
            password=credentials.password,
            device_info=device_info
        )

        # Log authentication attempt
        audit_logger.log_security_event(
            "login_attempt",
            {
                "email": credentials.email,
                "device_fingerprint": device_info.fingerprint,
                "success": bool(auth_result),
                "timestamp": datetime.utcnow().isoformat()
            }
        )

        return auth_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

@router.post("/verify-mfa", response_model=TokenResponse)
async def verify_mfa(
    verification: MFAVerification,
    device_info: DeviceFingerprint,
    auth_service: AuthenticationService = Depends(),
    audit_logger: SecurityAuditLogger = Depends(),
    rate_limiter: RateLimiter = Depends()
) -> Dict:
    """
    Verify MFA code and complete authentication process.
    
    Args:
        verification: MFA verification data
        device_info: Device fingerprint data
        auth_service: Authentication service instance
        audit_logger: Security audit logger instance
        rate_limiter: Rate limiting service
        
    Returns:
        TokenResponse containing JWT tokens
    """
    try:
        # Check rate limiting
        if not await rate_limiter.check_rate_limit(
            f"mfa:{verification.user_id}",
            RATE_LIMIT_ATTEMPTS,
            RATE_LIMIT_WINDOW
        ):
            audit_logger.log_security_event(
                "mfa_rate_limit_exceeded",
                {"user_id": verification.user_id}
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=RATE_LIMIT_MESSAGE
            )

        # Verify MFA code
        mfa_result = await auth_service.verify_mfa(
            user_id=verification.user_id,
            mfa_code=verification.code,
            device_info=device_info
        )

        # Log MFA verification attempt
        audit_logger.log_security_event(
            "mfa_verification",
            {
                "user_id": verification.user_id,
                "device_fingerprint": device_info.fingerprint,
                "success": bool(mfa_result),
                "timestamp": datetime.utcnow().isoformat()
            }
        )

        return mfa_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MFA verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MFA verification failed"
        )

@router.post("/oauth/{provider}", response_model=TokenResponse)
async def oauth_callback(
    provider: str,
    code: str,
    device_info: DeviceFingerprint,
    auth_service: AuthenticationService = Depends(),
    audit_logger: SecurityAuditLogger = Depends()
) -> Dict:
    """
    Handle OAuth authentication callback with device verification.
    
    Args:
        provider: OAuth provider name
        code: OAuth authorization code
        device_info: Device fingerprint data
        auth_service: Authentication service instance
        audit_logger: Security audit logger instance
        
    Returns:
        TokenResponse containing JWT tokens
    """
    try:
        # Authenticate with OAuth provider
        oauth_result = await auth_service.oauth_authenticate(
            provider=provider,
            code=code,
            device_info=device_info
        )

        # Log OAuth authentication
        audit_logger.log_security_event(
            "oauth_authentication",
            {
                "provider": provider,
                "device_fingerprint": device_info.fingerprint,
                "success": bool(oauth_result),
                "timestamp": datetime.utcnow().isoformat()
            }
        )

        return oauth_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=OAUTH_FAILED_MESSAGE
        )

@router.post("/verify-device", response_model=TokenResponse)
async def verify_device(
    device_info: DeviceFingerprint,
    auth_service: AuthenticationService = Depends(),
    audit_logger: SecurityAuditLogger = Depends()
) -> Dict:
    """
    Verify device trust level and update device fingerprint status.
    
    Args:
        device_info: Device fingerprint data
        auth_service: Authentication service instance
        audit_logger: Security audit logger instance
        
    Returns:
        TokenResponse containing updated JWT tokens
    """
    try:
        # Verify device trust level
        verification_result = await auth_service.verify_device_trust(
            device_info=device_info
        )

        # Log device verification
        audit_logger.log_security_event(
            "device_verification",
            {
                "device_fingerprint": device_info.fingerprint,
                "trust_level": verification_result.get("trust_level"),
                "timestamp": datetime.utcnow().isoformat()
            }
        )

        return verification_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Device verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=DEVICE_TRUST_FAILED_MESSAGE
        )