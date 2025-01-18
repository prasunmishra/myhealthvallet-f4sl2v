"""
Integration tests for external health platform integrations.
Tests OAuth flows, data synchronization, platform connectivity, and security validations.

Version: 1.0.0
"""

import pytest
import pytest_asyncio  # v0.21+
from datetime import datetime, timedelta, timezone
from freezegun import freeze_time  # v1.2+
from aioresponses import aioresponses  # v0.7+
from cryptography.fernet import Fernet  # v41.0+

from api.integration.services import IntegrationService
from api.integration.models import PlatformIntegration, OAuthCredential

# Test constants
TEST_USER_ID = "test_user_123"
TEST_PLATFORM_TYPE = "google_fit"
TEST_OAUTH_TOKENS = {
    "access_token": "test_access_token_secure",
    "refresh_token": "test_refresh_token_secure",
    "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
}
SECURITY_CONFIG = {
    "encryption_key": "test_encryption_key_32_bytes_secure_k",
    "hipaa_compliance_level": "strict"
}

class IntegrationTestBase:
    """
    Enhanced base class for secure integration testing with HIPAA compliance validation.
    """
    
    def __init__(self):
        """Initialize secure test environment with monitoring."""
        self._service = None
        self._user_id = TEST_USER_ID
        self._test_tokens = TEST_OAUTH_TOKENS.copy()
        self._mock_responses = {}
        self._encryption_key = Fernet.generate_key()

    async def setup_secure_platform(self, platform_type: str, platform_config: dict) -> PlatformIntegration:
        """
        Set up secure test platform integration with encryption validation.
        
        Args:
            platform_type: Type of health platform to test
            platform_config: Platform-specific configuration
            
        Returns:
            Configured test platform integration
        """
        # Validate platform type
        if not PlatformIntegration.validate_platform_type(platform_type):
            raise ValueError(f"Invalid platform type for testing: {platform_type}")

        # Create encrypted test tokens
        encrypted_tokens = {
            "access_token": Fernet(self._encryption_key).encrypt(
                self._test_tokens["access_token"].encode()
            ).decode(),
            "refresh_token": Fernet(self._encryption_key).encrypt(
                self._test_tokens["refresh_token"].encode()
            ).decode(),
            "expires_at": self._test_tokens["expires_at"]
        }

        # Create test OAuth credentials
        oauth_cred = OAuthCredential(
            user_id=self._user_id,
            platform_type=platform_type,
            **encrypted_tokens
        )
        await oauth_cred.save()

        # Create test platform integration
        integration = PlatformIntegration(
            user_id=self._user_id,
            platform_type=platform_type,
            platform_config=platform_config,
            metadata={
                "test_environment": True,
                "encryption_verified": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        )
        await integration.save()

        return integration

@pytest.mark.asyncio
@pytest.mark.integration
async def test_connect_platform_success(db_fixture, test_user_id: str):
    """
    Test successful connection to a health platform with HIPAA compliance validation.
    
    Args:
        db_fixture: Database fixture for testing
        test_user_id: Test user identifier
    """
    # Initialize test base
    test_base = IntegrationTestBase()
    
    # Configure test platform
    platform_config = {
        "scopes": ["activity.read", "body.read"],
        "compliance_mode": "hipaa",
        "encryption_enabled": True
    }
    
    try:
        # Initialize integration service
        service = IntegrationService(test_user_id)
        
        # Connect to platform with security validation
        integration = await service.connect_platform(
            TEST_PLATFORM_TYPE,
            TEST_OAUTH_TOKENS,
            platform_config
        )
        
        # Verify integration status
        assert integration is not None
        assert integration.user_id == test_user_id
        assert integration.platform_type == TEST_PLATFORM_TYPE
        assert integration.status == "pending"
        
        # Verify OAuth credentials encryption
        oauth_cred = await OAuthCredential.objects.get(
            user_id=test_user_id,
            platform_type=TEST_PLATFORM_TYPE
        )
        assert oauth_cred is not None
        assert oauth_cred.access_token != TEST_OAUTH_TOKENS["access_token"]
        assert oauth_cred.refresh_token != TEST_OAUTH_TOKENS["refresh_token"]
        
        # Verify platform configuration security
        assert integration.platform_config["encryption_enabled"] is True
        assert integration.platform_config["compliance_mode"] == "hipaa"
        assert "scopes" in integration.platform_config
        
        # Verify audit trail
        assert "created_at" in integration.metadata
        assert "encryption_algorithm" in integration.metadata
        assert integration.metadata["compliance_version"] == "HIPAA-2023"
        
    finally:
        # Cleanup test data securely
        await OAuthCredential.objects(user_id=test_user_id).delete()
        await PlatformIntegration.objects(user_id=test_user_id).delete()

@pytest.mark.asyncio
@pytest.mark.integration
async def test_sync_platform_data(db_fixture, test_user_id: str):
    """
    Test health data synchronization with security validation.
    
    Args:
        db_fixture: Database fixture for testing
        test_user_id: Test user identifier
    """
    # Initialize test environment
    test_base = IntegrationTestBase()
    
    # Configure mock responses
    with aioresponses() as mocked:
        # Mock platform API responses
        mocked.get(
            "https://api.health-platform.com/v1/data",
            payload={
                "metrics": [
                    {
                        "type": "heart_rate",
                        "value": 75,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                ]
            },
            status=200
        )
        
        try:
            # Set up secure test platform
            integration = await test_base.setup_secure_platform(
                TEST_PLATFORM_TYPE,
                {
                    "scopes": ["activity.read", "body.read"],
                    "encryption_enabled": True
                }
            )
            
            # Initialize service
            service = IntegrationService(test_user_id)
            
            # Perform secure data sync
            success, results = await service.sync_platform_data(
                integration.id,
                {
                    "metrics": ["heart_rate"],
                    "start_date": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
                    "end_date": datetime.now(timezone.utc).isoformat()
                }
            )
            
            # Verify sync results
            assert success is True
            assert "record_count" in results
            assert results["record_count"] > 0
            
            # Verify sync status
            integration = await PlatformIntegration.objects.get(id=integration.id)
            assert integration.status == "completed"
            assert integration.last_sync_at is not None
            
            # Verify data encryption
            assert integration.metadata["last_sync"]["encryption_verified"] is True
            
            # Verify audit trail
            assert len(integration.metadata["last_sync"]) > 0
            assert "end_time" in integration.metadata["last_sync"]
            assert "records_synced" in integration.metadata["last_sync"]
            
        finally:
            # Cleanup test data
            await OAuthCredential.objects(user_id=test_user_id).delete()
            await PlatformIntegration.objects(user_id=test_user_id).delete()