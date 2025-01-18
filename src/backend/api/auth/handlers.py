"""
Authentication handlers module for PHRSAT implementing secure authentication endpoints
with enhanced security features including MFA, device fingerprinting, and audit logging.

Version: 1.0.0
"""

import logging
from datetime import datetime
from typing import Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi_limiter import RateLimiter
from fastapi_limiter.depends import RateLimiter as RateLimiterDependency
from pydantic import BaseModel, EmailStr, constr

from api.auth.services import AuthenticationService
from core.config import settings
from core.security import SecurityManager

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Rate limiting configuration
RATE_LIMIT_CONFIG = {
    "login": {"max_requests": 10, "window_seconds": 300},
    "register": {"max_requests": 5, "window_seconds": 300},
    "mfa": {"max_requests": 3, "window_seconds": 300}
}

# Request/Response Models
class UserCreate(BaseModel):
    email: EmailStr
    password: constr(min_length=12)
    first_name: str
    last_name: str
    device_info: Dict

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_info: Dict

class MFAVerify(BaseModel):
    user_id: str
    mfa_code: str
    device_info: Dict

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str]
    token_type: str = "bearer"
    requires_mfa: Optional[bool]
    device_trusted: Optional[bool]
    user_id: Optional[str]

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    request: Request,
    user_data: UserCreate,
    auth_service: AuthenticationService = Depends(),
    rate_limiter: RateLimiterDependency = Depends(
        RateLimiter(
            key_func=lambda r: f"{r.client.host}:register",
            **RATE_LIMIT_CONFIG["register"]
        )
    )
) -> TokenResponse:
    """
    Handle user registration with enhanced security validation and device fingerprinting.
    Implements comprehensive security checks and audit logging.
    """
    correlation_id = str(uuid4())
    logger.info(f"Starting user registration process. Correlation ID: {correlation_id}")

    try:
        # Validate device fingerprint
        device_fingerprint = await auth_service.validate_device_fingerprint(
            user_data.device_info,
            request.headers
        )

        # Register user with enhanced security context
        registration_result = await auth_service.register_user(
            email=user_data.email,
            password=user_data.password,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            device_fingerprint=device_fingerprint,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent"),
            correlation_id=correlation_id
        )

        logger.info(f"User registration successful. User ID: {registration_result['user_id']}")

        return TokenResponse(
            access_token=registration_result["access_token"],
            refresh_token=registration_result["refresh_token"],
            token_type="bearer",
            user_id=registration_result["user_id"],
            device_trusted=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration failed. Correlation ID: {correlation_id}. Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed due to internal error"
        )

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    credentials: UserLogin,
    auth_service: AuthenticationService = Depends(),
    rate_limiter: RateLimiterDependency = Depends(
        RateLimiter(
            key_func=lambda r: f"{r.client.host}:{r.json().get('email', '')}:login",
            **RATE_LIMIT_CONFIG["login"]
        )
    )
) -> TokenResponse:
    """
    Handle user login with MFA, device validation, and enhanced security logging.
    Implements comprehensive authentication flow with security checks.
    """
    correlation_id = str(uuid4())
    logger.info(f"Starting login process. Correlation ID: {correlation_id}")

    try:
        # Validate device fingerprint
        device_fingerprint = await auth_service.validate_device_fingerprint(
            credentials.device_info,
            request.headers
        )

        # Authenticate user with enhanced security context
        auth_result = await auth_service.authenticate_user(
            email=credentials.email,
            password=credentials.password,
            device_fingerprint=device_fingerprint,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent"),
            correlation_id=correlation_id
        )

        if auth_result.get("requires_mfa"):
            logger.info(f"MFA required for user. Correlation ID: {correlation_id}")
            return TokenResponse(
                access_token="",
                requires_mfa=True,
                user_id=auth_result["user_id"]
            )

        logger.info(f"Login successful. User ID: {auth_result['user_id']}")
        
        return TokenResponse(
            access_token=auth_result["access_token"],
            refresh_token=auth_result["refresh_token"],
            token_type="bearer",
            user_id=auth_result["user_id"],
            device_trusted=auth_result.get("device_trusted", False)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login failed. Correlation ID: {correlation_id}. Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed due to internal error"
        )

@router.post("/mfa/verify", response_model=TokenResponse)
async def verify_mfa(
    request: Request,
    mfa_data: MFAVerify,
    auth_service: AuthenticationService = Depends(),
    rate_limiter: RateLimiterDependency = Depends(
        RateLimiter(
            key_func=lambda r: f"{r.client.host}:{r.json().get('user_id', '')}:mfa",
            **RATE_LIMIT_CONFIG["mfa"]
        )
    )
) -> TokenResponse:
    """
    Handle MFA verification with enhanced security logging and device trust management.
    Implements secure MFA validation flow with comprehensive audit logging.
    """
    correlation_id = str(uuid4())
    logger.info(f"Starting MFA verification. Correlation ID: {correlation_id}")

    try:
        # Validate device fingerprint
        device_fingerprint = await auth_service.validate_device_fingerprint(
            mfa_data.device_info,
            request.headers
        )

        # Verify MFA with enhanced security context
        mfa_result = await auth_service.verify_mfa(
            user_id=mfa_data.user_id,
            mfa_code=mfa_data.mfa_code,
            device_fingerprint=device_fingerprint,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent"),
            correlation_id=correlation_id
        )

        logger.info(f"MFA verification successful. User ID: {mfa_data.user_id}")

        return TokenResponse(
            access_token=mfa_result["access_token"],
            refresh_token=mfa_result["refresh_token"],
            token_type="bearer",
            user_id=mfa_data.user_id,
            device_trusted=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MFA verification failed. Correlation ID: {correlation_id}. Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MFA verification failed due to internal error"
        )

@router.post("/oauth/{provider}/callback", response_model=TokenResponse)
async def oauth_callback(
    request: Request,
    provider: str,
    auth_service: AuthenticationService = Depends()
) -> TokenResponse:
    """
    Handle OAuth authentication callback with enhanced security validation.
    Implements secure OAuth flow with device binding and audit logging.
    """
    correlation_id = str(uuid4())
    logger.info(f"Starting OAuth callback for provider: {provider}. Correlation ID: {correlation_id}")

    try:
        # Validate device fingerprint from OAuth context
        device_info = {
            "user_agent": request.headers.get("user-agent"),
            "ip_address": request.client.host
        }
        device_fingerprint = await auth_service.validate_device_fingerprint(
            device_info,
            request.headers
        )

        # Process OAuth callback with enhanced security context
        oauth_result = await auth_service.oauth_authenticate(
            provider=provider,
            request=request,
            device_fingerprint=device_fingerprint,
            correlation_id=correlation_id
        )

        logger.info(f"OAuth authentication successful. User ID: {oauth_result['user_id']}")

        return TokenResponse(
            access_token=oauth_result["access_token"],
            refresh_token=oauth_result["refresh_token"],
            token_type="bearer",
            user_id=oauth_result["user_id"],
            device_trusted=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth callback failed. Correlation ID: {correlation_id}. Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth authentication failed due to internal error"
        )