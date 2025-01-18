"""
Unit tests for external health platform integration services with security and HIPAA compliance validation.
Tests cover secure platform connections, OAuth token management, and data synchronization.

Version: 1.0.0
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch
from freezegun import freeze_time  # freezegun v1.2+
from cryptography.fernet import Fernet  # cryptography v41.0+

from api.integration.services import IntegrationService
from core.security import SecurityManager
from core.config import Settings

# Test constants
TEST_USER_ID = "test_user_123"
TEST_PLATFORM_TYPE = "google_fit"
TEST_ENCRYPTION_KEY = Fernet.generate_key()

MOCK_OAUTH_TOKENS = {
    "access_token": "mock_access_token_12345",
    "refresh_token": "mock_refresh_token_67890",
    "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
}

MOCK_PLATFORM_CONFIG = {
    "platform_type": TEST_PLATFORM_TYPE,
    "data_types": ["steps", "heart_rate"],
    "sync_frequency": "daily"
}

SECURITY_CONFIG = {
    "encryption_key": TEST_ENCRYPTION_KEY,
    "hipaa_enabled": True,
    "audit_level": "detailed"
}

@pytest.fixture
def security_context():
    """Fixture for security context with HIPAA compliance settings."""
    settings = Settings()
    settings.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    return SecurityManager(settings)

@pytest.fixture
def integration_service(security_context):
    """Fixture for integration service with security configuration."""
    service = IntegrationService(TEST_USER_ID)
    service._security_manager = security_context
    return service

@pytest.mark.security
@pytest.mark.hipaa
class TestIntegrationSecurity:
    """Test suite for integration service security features and HIPAA compliance."""

    def setup_method(self):
        """Set up test environment with security configurations."""
        self.encryption_key = TEST_ENCRYPTION_KEY
        self.audit_events = []

    async def test_connect_platform_security(self, integration_service, security_context):
        """Test secure platform connection with HIPAA compliance validation."""
        with patch('api.integration.services.PlatformIntegration') as mock_integration:
            # Configure mock integration
            mock_integration.validate_platform_type.return_value = True
            mock_integration.return_value.save.return_value = None

            # Test platform connection with security validation
            result = await integration_service.connect_platform(
                TEST_PLATFORM_TYPE,
                MOCK_OAUTH_TOKENS,
                MOCK_PLATFORM_CONFIG
            )

            # Verify token encryption
            assert mock_integration.call_count == 1
            call_args = mock_integration.call_args[1]
            assert "encrypted_tokens" in str(call_args)
            
            # Validate HIPAA compliance metadata
            assert "HIPAA-2023" in str(call_args.get("metadata", {}))
            assert "encryption_algorithm" in str(call_args.get("metadata", {}))

            # Verify audit logging
            assert mock_integration.return_value.save.called
            assert "platform_connection" in str(mock_integration.mock_calls)

    @pytest.mark.asyncio
    async def test_oauth_token_security(self, integration_service, security_context):
        """Test OAuth token security and encryption."""
        with patch('api.integration.services.OAuthCredential') as mock_oauth:
            # Configure mock OAuth credential
            mock_oauth.return_value.save.return_value = None
            
            # Test token encryption
            encrypted_tokens = await integration_service._encrypt_oauth_tokens(
                MOCK_OAUTH_TOKENS
            )
            
            # Verify token encryption
            assert isinstance(encrypted_tokens["access_token"], bytes)
            assert isinstance(encrypted_tokens["refresh_token"], bytes)
            
            # Test token decryption
            decrypted_access = security_context.decrypt_phi(
                encrypted_tokens["access_token"]
            )
            assert decrypted_access == MOCK_OAUTH_TOKENS["access_token"]

    @pytest.mark.asyncio
    async def test_sync_security_context(self, integration_service):
        """Test security context validation during data synchronization."""
        with patch('api.integration.services.PlatformIntegration') as mock_integration:
            mock_integration.objects.get.return_value = Mock(
                platform_type=TEST_PLATFORM_TYPE,
                platform_config=MOCK_PLATFORM_CONFIG
            )

            # Test sync with security context
            success, results = await integration_service.sync_platform_data(
                "test_integration_id",
                {"security_level": "hipaa"}
            )

            # Verify security context validation
            assert mock_integration.objects.get.called
            assert "security_context" in str(mock_integration.mock_calls)

    @freeze_time("2023-01-01 12:00:00")
    @pytest.mark.asyncio
    async def test_token_rotation_security(self, integration_service):
        """Test secure token rotation and audit logging."""
        with patch('api.integration.services.OAuthCredential') as mock_oauth:
            mock_oauth.return_value.is_token_valid.return_value = False
            
            # Test token rotation
            new_tokens = {
                "access_token": "new_access_token",
                "refresh_token": "new_refresh_token",
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            }
            
            await integration_service._refresh_oauth_tokens(
                "test_integration_id",
                mock_oauth.return_value,
                new_tokens
            )
            
            # Verify token update and audit logging
            assert mock_oauth.return_value.update_tokens.called
            assert "token_rotation" in str(mock_oauth.mock_calls)

    @pytest.mark.asyncio
    async def test_hipaa_compliance_validation(self, integration_service):
        """Test HIPAA compliance validation for data operations."""
        with patch('api.integration.services.PlatformIntegration') as mock_integration:
            mock_integration.objects.get.return_value = Mock(
                platform_type=TEST_PLATFORM_TYPE,
                platform_config=MOCK_PLATFORM_CONFIG
            )

            # Test HIPAA compliance checks
            await integration_service.validate_security_context({
                "hipaa_enabled": True,
                "phi_access": True
            })

            # Verify compliance validation
            assert mock_integration.objects.get.called
            assert "hipaa_validation" in str(mock_integration.mock_calls)

    def test_encryption_key_rotation(self, integration_service, security_context):
        """Test encryption key rotation and version management."""
        # Initial key version
        initial_version = security_context._current_key_version
        
        # Perform key rotation
        with freeze_time(datetime.now(timezone.utc) + timedelta(days=91)):
            success = security_context.rotate_keys()
            
            # Verify key rotation
            assert success
            assert security_context._current_key_version > initial_version
            assert len(security_context._key_versions) <= 3

    @pytest.mark.asyncio
    async def test_audit_logging_compliance(self, integration_service):
        """Test audit logging compliance for security operations."""
        with patch('api.integration.services.PlatformIntegration') as mock_integration:
            # Perform audited operation
            await integration_service.connect_platform(
                TEST_PLATFORM_TYPE,
                MOCK_OAUTH_TOKENS,
                MOCK_PLATFORM_CONFIG
            )
            
            # Verify audit log entries
            audit_calls = [
                call for call in mock_integration.mock_calls 
                if "audit_log" in str(call)
            ]
            assert len(audit_calls) > 0
            assert "platform_connection" in str(audit_calls)

    @pytest.mark.asyncio
    async def test_error_handling_security(self, integration_service):
        """Test secure error handling and logging."""
        with patch('api.integration.services.PlatformIntegration') as mock_integration:
            mock_integration.objects.get.side_effect = Exception("Security violation")
            
            # Test error handling
            with pytest.raises(Exception):
                await integration_service.sync_platform_data("test_integration_id")
            
            # Verify secure error logging
            assert mock_integration.objects.get.called
            assert "security_violation" in str(mock_integration.mock_calls)