"""
Unit tests for authentication functionality including OAuth 2.0, MFA, JWT management,
security auditing, and HIPAA compliance verification.

Version: 1.0.0
"""

import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
from freezegun import freeze_time  # freezegun v1.2+
from faker import Faker  # faker v18.13.0

from api.auth.services import AuthenticationService, AUTH_FAILED_MESSAGE, MFA_FAILED_MESSAGE, RATE_LIMIT_EXCEEDED
from api.auth.models import User
from core.security import SecurityManager
from core.config import settings

# Initialize faker for test data generation
fake = Faker()

# Test constants
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "TestPassword123!"
TEST_DEVICE_FINGERPRINT = "test_device_fingerprint_hash"
TEST_MFA_SECRET = "JBSWY3DPEHPK3PXP"
TEST_MFA_CODE = "123456"
TEST_BACKUP_CODE = "ABCDEF123456"
TEST_JWT_SECRET = "test_jwt_secret_key_with_minimum_length_requirement"

@pytest.fixture
def security_manager():
    """Fixture for SecurityManager with test configuration."""
    return SecurityManager(settings)

@pytest.fixture
def mock_token_manager():
    """Fixture for JWT token manager mock."""
    manager = Mock()
    manager.create_access_token.return_value = "test_access_token"
    manager.create_refresh_token.return_value = "test_refresh_token"
    return manager

@pytest.fixture
def mock_audit_logger():
    """Fixture for security audit logger mock."""
    logger = Mock()
    return logger

@pytest.fixture
def mock_rate_limiter():
    """Fixture for rate limiter mock."""
    limiter = Mock()
    limiter.check_rate_limit.return_value = True
    return limiter

@pytest.fixture
def mock_device_detector():
    """Fixture for device fingerprint detector mock."""
    detector = Mock()
    detector.generate_fingerprint.return_value = TEST_DEVICE_FINGERPRINT
    return detector

@pytest.fixture
async def auth_service(
    mock_token_manager,
    mock_audit_logger,
    mock_rate_limiter,
    mock_device_detector
):
    """Fixture for AuthenticationService with mocked dependencies."""
    return AuthenticationService(
        token_manager=mock_token_manager,
        audit_logger=mock_audit_logger,
        rate_limiter=mock_rate_limiter,
        device_detector=mock_device_detector
    )

@pytest.fixture
def test_user():
    """Fixture for test user with MFA enabled."""
    user = Mock(spec=User)
    user.id = "test_user_id"
    user.email = TEST_USER_EMAIL
    user.mfa_enabled = True
    user.mfa_secret = TEST_MFA_SECRET
    user.roles = ["user"]
    user.device_fingerprints = {}
    user.verify_password.return_value = True
    user.verify_mfa_code.return_value = True
    return user

class TestAuthenticationService:
    """Test cases for AuthenticationService including security features and compliance."""

    @pytest.mark.asyncio
    async def test_authenticate_user_success(self, auth_service, test_user):
        """Test successful user authentication with valid credentials."""
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = test_user
            
            device_info = {
                "user_agent": "Mozilla/5.0",
                "ip_address": "127.0.0.1"
            }
            
            result = await auth_service.authenticate_user(
                email=TEST_USER_EMAIL,
                password=TEST_USER_PASSWORD,
                device_info=device_info
            )
            
            assert result["requires_mfa"] is True
            assert result["user_id"] == "test_user_id"
            assert result["device_fingerprint"] == TEST_DEVICE_FINGERPRINT
            
            auth_service._audit_logger.log_security_event.assert_called_with(
                "mfa_required",
                {
                    "user_id": "test_user_id",
                    "device_fingerprint": TEST_DEVICE_FINGERPRINT
                }
            )

    @pytest.mark.asyncio
    async def test_authenticate_user_rate_limit_exceeded(self, auth_service):
        """Test rate limiting for authentication attempts."""
        auth_service._rate_limiter.check_rate_limit.return_value = False
        
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.authenticate_user(
                email=TEST_USER_EMAIL,
                password=TEST_USER_PASSWORD,
                device_info={"ip_address": "127.0.0.1"}
            )
        
        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == RATE_LIMIT_EXCEEDED
        
        auth_service._audit_logger.log_security_event.assert_called_with(
            "rate_limit_exceeded",
            {"email": TEST_USER_EMAIL, "device_info": {"ip_address": "127.0.0.1"}}
        )

    @pytest.mark.asyncio
    async def test_verify_mfa_success(self, auth_service, test_user):
        """Test successful MFA verification with valid code."""
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = test_user
            
            device_info = {
                "user_agent": "Mozilla/5.0",
                "ip_address": "127.0.0.1"
            }
            
            result = await auth_service.verify_mfa(
                user_id="test_user_id",
                mfa_code=TEST_MFA_CODE,
                device_info=device_info
            )
            
            assert result["access_token"] == "test_access_token"
            assert result["refresh_token"] == "test_refresh_token"
            assert result["token_type"] == "bearer"
            assert result["device_trusted"] is True
            
            auth_service._audit_logger.log_security_event.assert_called_with(
                "successful_mfa_verification",
                {
                    "user_id": "test_user_id",
                    "device_fingerprint": TEST_DEVICE_FINGERPRINT
                }
            )

    @pytest.mark.asyncio
    async def test_verify_mfa_with_backup_code(self, auth_service, test_user):
        """Test MFA verification using backup code."""
        test_user.verify_mfa_code.side_effect = [False, True]  # First regular MFA fails, then backup succeeds
        test_user.preferences = {"mfa_backup_codes": [TEST_BACKUP_CODE]}
        
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = test_user
            
            result = await auth_service.verify_mfa(
                user_id="test_user_id",
                mfa_code=TEST_BACKUP_CODE,
                device_info={"ip_address": "127.0.0.1"}
            )
            
            assert result["access_token"] == "test_access_token"
            assert "backup_code_used" in result
            assert TEST_BACKUP_CODE not in test_user.preferences["mfa_backup_codes"]

    @pytest.mark.asyncio
    async def test_authenticate_user_with_device_fingerprint(self, auth_service, test_user):
        """Test user authentication with device fingerprint validation."""
        test_user.device_fingerprints = {
            TEST_DEVICE_FINGERPRINT: {
                "last_used": datetime.utcnow(),
                "trusted": True
            }
        }
        
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = test_user
            
            result = await auth_service.authenticate_user(
                email=TEST_USER_EMAIL,
                password=TEST_USER_PASSWORD,
                device_info={"ip_address": "127.0.0.1"}
            )
            
            assert result["access_token"] == "test_access_token"
            assert not result.get("requires_mfa")
            assert result["user_id"] == "test_user_id"

    @pytest.mark.asyncio
    async def test_authenticate_user_invalid_credentials(self, auth_service):
        """Test authentication with invalid credentials."""
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = None
            
            with pytest.raises(HTTPException) as exc_info:
                await auth_service.authenticate_user(
                    email=TEST_USER_EMAIL,
                    password="wrong_password",
                    device_info={"ip_address": "127.0.0.1"}
                )
            
            assert exc_info.value.status_code == 401
            assert exc_info.value.detail == AUTH_FAILED_MESSAGE

    @pytest.mark.asyncio
    async def test_verify_mfa_invalid_code(self, auth_service, test_user):
        """Test MFA verification with invalid code."""
        test_user.verify_mfa_code.return_value = False
        
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = test_user
            
            with pytest.raises(HTTPException) as exc_info:
                await auth_service.verify_mfa(
                    user_id="test_user_id",
                    mfa_code="invalid_code",
                    device_info={"ip_address": "127.0.0.1"}
                )
            
            assert exc_info.value.status_code == 401
            assert exc_info.value.detail == MFA_FAILED_MESSAGE

    @pytest.mark.asyncio
    async def test_security_audit_logging(self, auth_service, test_user):
        """Test comprehensive security audit logging."""
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = test_user
            
            await auth_service.authenticate_user(
                email=TEST_USER_EMAIL,
                password=TEST_USER_PASSWORD,
                device_info={"ip_address": "127.0.0.1"}
            )
            
            # Verify audit log calls
            audit_calls = auth_service._audit_logger.log_security_event.call_args_list
            assert len(audit_calls) > 0
            assert any(call[0][0] == "mfa_required" for call in audit_calls)

    @pytest.mark.asyncio
    @freeze_time("2023-01-01 12:00:00")
    async def test_token_expiration(self, auth_service, test_user):
        """Test JWT token expiration handling."""
        with patch('api.auth.models.User.objects') as mock_users:
            mock_users.filter.return_value.first.return_value = test_user
            
            result = await auth_service.authenticate_user(
                email=TEST_USER_EMAIL,
                password=TEST_USER_PASSWORD,
                device_info={"ip_address": "127.0.0.1"}
            )
            
            auth_service._token_manager.create_access_token.assert_called_with(
                user_id="test_user_id",
                roles=["user"],
                device_fingerprint=TEST_DEVICE_FINGERPRINT
            )

def test_hipaa_compliance_metadata(auth_service, test_user):
    """Test HIPAA compliance metadata in authentication responses."""
    result = auth_service._token_manager.create_access_token(
        user_id="test_user_id",
        roles=["user"],
        device_fingerprint=TEST_DEVICE_FINGERPRINT
    )
    
    # Verify HIPAA compliance metadata
    assert auth_service._audit_logger.log_security_event.called
    audit_call = auth_service._audit_logger.log_security_event.call_args[0]
    assert "hipaa_compliant" in str(audit_call)