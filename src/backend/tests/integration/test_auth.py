"""
Integration tests for authentication endpoints and flows in the PHRSAT system.
Tests user registration, login, MFA verification, OAuth authentication, and RBAC validation
with comprehensive security measures.

Version: 1.0.0
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

import pytest  # pytest v7.4+
import pytest_asyncio  # pytest-asyncio v0.24+
import httpx  # httpx v0.24+
from jose import jwt  # python-jose v3.3+
from device_detector import DeviceFingerprint  # device-detector v5.0.0+
from rate_limiter import RateLimiter  # rate-limiter v2.0+

from api.auth.models import User
from api.auth.services import AuthenticationService
from core.config import settings
from core.security import SecurityManager

# Configure logging
logger = logging.getLogger(__name__)

# Test constants
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "Test123!@#"
TEST_OAUTH_CODE = "test_oauth_code"
MAX_LOGIN_ATTEMPTS = 3
RATE_LIMIT_WINDOW = 300
DEVICE_TRUST_THRESHOLD = 0.8

class AuthenticationTestCase:
    """Enhanced base test class for authentication tests with security validation."""

    def __init__(self):
        """Initialize test case with security components."""
        self.test_user_data = {
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "first_name": "Test",
            "last_name": "User",
            "roles": ["user"]
        }
        self.device_info = {
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "ip_address": "127.0.0.1",
            "screen_resolution": "1920x1080",
            "timezone": "UTC",
            "language": "en-US"
        }
        self.security_manager = SecurityManager(settings)
        self.rate_limiter = RateLimiter(
            max_attempts=MAX_LOGIN_ATTEMPTS,
            window_seconds=RATE_LIMIT_WINDOW
        )
        self.device_detector = DeviceFingerprint()

    async def verify_security_measures(self, response_data: Dict, security_context: str) -> bool:
        """Verify security controls and measures."""
        try:
            # Validate JWT token structure and claims
            if "access_token" in response_data:
                token_data = jwt.decode(
                    response_data["access_token"],
                    settings.JWT_SECRET,
                    algorithms=[settings.JWT_ALGORITHM]
                )
                assert "user_id" in token_data
                assert "roles" in token_data
                assert "device_fingerprint" in token_data
                assert "exp" in token_data

            # Verify rate limiting
            rate_limit_key = f"{security_context}:{self.device_info['ip_address']}"
            assert await self.rate_limiter.check_rate_limit(rate_limit_key)

            # Validate device trust score
            if "device_fingerprint" in response_data:
                device_score = self.device_detector.calculate_trust_score(
                    response_data["device_fingerprint"]
                )
                assert device_score >= DEVICE_TRUST_THRESHOLD

            return True
        except Exception as e:
            logger.error(f"Security validation failed: {str(e)}")
            return False

@pytest.mark.asyncio
@pytest.mark.integration
async def test_user_registration(client: httpx.AsyncClient, db, rate_limiter: RateLimiter):
    """Test user registration with enhanced security validation."""
    test_case = AuthenticationTestCase()
    
    # Verify rate limit not exceeded
    assert await rate_limiter.check_rate_limit(TEST_USER_EMAIL)

    # Send registration request
    response = await client.post(
        f"{settings.API_V1_PREFIX}/auth/register",
        json={
            **test_case.test_user_data,
            "device_info": test_case.device_info
        }
    )

    assert response.status_code == 201
    response_data = response.json()

    # Verify security measures
    assert await test_case.verify_security_measures(
        response_data,
        "registration"
    )

    # Verify user creation
    user = User.objects(email=TEST_USER_EMAIL).first()
    assert user is not None
    assert user.roles == ["user"]
    assert user.is_active
    assert not user.is_verified  # Requires email verification
    assert len(user.security_events) > 0

@pytest.mark.asyncio
@pytest.mark.integration
async def test_user_login_with_mfa(client: httpx.AsyncClient, db):
    """Test user login flow with MFA verification."""
    test_case = AuthenticationTestCase()

    # Create test user with MFA enabled
    user = User(
        email=TEST_USER_EMAIL,
        first_name="Test",
        last_name="User",
        roles=["user"],
        mfa_enabled=True
    )
    user.set_password(TEST_USER_PASSWORD)
    mfa_data = user.generate_mfa_secret()
    user.save()

    # Attempt login
    response = await client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "device_info": test_case.device_info
        }
    )

    assert response.status_code == 200
    response_data = response.json()
    assert response_data["requires_mfa"] is True

    # Verify MFA
    mfa_code = pyotp.TOTP(mfa_data["secret"]).now()
    mfa_response = await client.post(
        f"{settings.API_V1_PREFIX}/auth/verify-mfa",
        json={
            "user_id": str(user.id),
            "mfa_code": mfa_code,
            "device_info": test_case.device_info
        }
    )

    assert mfa_response.status_code == 200
    mfa_data = mfa_response.json()
    assert "access_token" in mfa_data
    assert "device_trusted" in mfa_data

    # Verify security measures
    assert await test_case.verify_security_measures(mfa_data, "mfa_verification")

@pytest.mark.asyncio
@pytest.mark.integration
async def test_oauth_authentication(client: httpx.AsyncClient, db):
    """Test OAuth authentication flow."""
    test_case = AuthenticationTestCase()

    # Initialize OAuth flow
    response = await client.post(
        f"{settings.API_V1_PREFIX}/auth/oauth/initialize",
        json={
            "provider": "google",
            "device_info": test_case.device_info
        }
    )

    assert response.status_code == 200
    init_data = response.json()
    assert "auth_url" in init_data

    # Complete OAuth flow
    response = await client.post(
        f"{settings.API_V1_PREFIX}/auth/oauth/callback",
        json={
            "code": TEST_OAUTH_CODE,
            "state": init_data["state"],
            "device_info": test_case.device_info
        }
    )

    assert response.status_code == 200
    oauth_data = response.json()
    assert "access_token" in oauth_data
    assert "user_id" in oauth_data

    # Verify security measures
    assert await test_case.verify_security_measures(oauth_data, "oauth_authentication")

@pytest.mark.asyncio
@pytest.mark.integration
async def test_rbac_validation(client: httpx.AsyncClient, db):
    """Test role-based access control validation."""
    test_case = AuthenticationTestCase()

    # Create users with different roles
    admin_user = User(
        email="admin@example.com",
        first_name="Admin",
        last_name="User",
        roles=["admin", "user"]
    )
    admin_user.set_password(TEST_USER_PASSWORD)
    admin_user.save()

    provider_user = User(
        email="provider@example.com",
        first_name="Provider",
        last_name="User",
        roles=["healthcare_provider", "user"]
    )
    provider_user.set_password(TEST_USER_PASSWORD)
    provider_user.save()

    # Test admin access
    admin_response = await client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={
            "email": "admin@example.com",
            "password": TEST_USER_PASSWORD,
            "device_info": test_case.device_info
        }
    )

    assert admin_response.status_code == 200
    admin_data = admin_response.json()
    admin_token = admin_data["access_token"]

    # Test provider access
    provider_response = await client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={
            "email": "provider@example.com",
            "password": TEST_USER_PASSWORD,
            "device_info": test_case.device_info
        }
    )

    assert provider_response.status_code == 200
    provider_data = provider_response.json()
    provider_token = provider_data["access_token"]

    # Verify admin privileges
    admin_access = await client.get(
        f"{settings.API_V1_PREFIX}/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert admin_access.status_code == 200

    # Verify provider restrictions
    provider_access = await client.get(
        f"{settings.API_V1_PREFIX}/admin/users",
        headers={"Authorization": f"Bearer {provider_token}"}
    )
    assert provider_access.status_code == 403

@pytest.mark.asyncio
@pytest.mark.integration
async def test_security_audit_logging(client: httpx.AsyncClient, db):
    """Test security audit logging functionality."""
    test_case = AuthenticationTestCase()

    # Create test user
    user = User(
        email=TEST_USER_EMAIL,
        first_name="Test",
        last_name="User",
        roles=["user"]
    )
    user.set_password(TEST_USER_PASSWORD)
    user.save()

    # Test failed login attempts
    for _ in range(MAX_LOGIN_ATTEMPTS + 1):
        response = await client.post(
            f"{settings.API_V1_PREFIX}/auth/login",
            json={
                "email": TEST_USER_EMAIL,
                "password": "wrong_password",
                "device_info": test_case.device_info
            }
        )

    # Verify user security events
    updated_user = User.objects(email=TEST_USER_EMAIL).first()
    security_events = updated_user.security_events

    assert len(security_events) >= MAX_LOGIN_ATTEMPTS
    assert any(event["event"] == "failed_login_attempt" for event in security_events)
    assert any(
        event["ip_address"] == test_case.device_info["ip_address"]
        for event in security_events
    )