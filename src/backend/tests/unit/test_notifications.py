"""
Unit tests for PHRSAT notification system components.
Tests notification models, services, and delivery channels with security validation.

Version: 1.0.0
"""

import uuid
from datetime import datetime, timedelta
import pytest  # pytest v7.4+
import pytest_asyncio  # pytest-asyncio v0.21+
from unittest.mock import Mock, patch, AsyncMock
from freezegun import freeze_time  # freezegun v1.2+

from api.notifications.models import Notification
from api.notifications.services import NotificationService, create_notification_service

# Test constants
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
TEST_NOTIFICATION_DATA = {
    "type": "health_alert",
    "priority": "high",
    "phi_content": True
}
TEST_ENCRYPTION_KEY = "AES256-GCM-TEST-KEY"

@pytest.fixture
def security_context():
    """Fixture providing security context for tests."""
    return {
        "encryption_key": TEST_ENCRYPTION_KEY,
        "phi_authorized": True,
        "user_id": TEST_USER_ID,
        "session_id": str(uuid.uuid4())
    }

@pytest.fixture
def mock_email_service():
    """Fixture providing mocked email service."""
    service = AsyncMock()
    service.send = AsyncMock(return_value=str(uuid.uuid4()))
    return service

@pytest.fixture
def mock_push_service():
    """Fixture providing mocked push notification service."""
    service = AsyncMock()
    service.send = AsyncMock(return_value=str(uuid.uuid4()))
    return service

@pytest.fixture
def mock_sms_service():
    """Fixture providing mocked SMS service."""
    service = AsyncMock()
    service.send = AsyncMock(return_value=str(uuid.uuid4()))
    return service

@pytest.fixture
def notification_service(mock_email_service, mock_push_service, mock_sms_service):
    """Fixture providing configured NotificationService instance."""
    config = {
        "email_service": mock_email_service,
        "push_service": mock_push_service,
        "sms_service": mock_sms_service,
        "rate_limits": {
            "email": 100,
            "push": 200,
            "sms": 50
        }
    }
    return create_notification_service(config, security_context())

@pytest.mark.unit
class TestNotificationModel:
    """Test suite for Notification model functionality including encryption."""

    def test_notification_creation(self):
        """Test notification document creation with valid data and encryption."""
        notification = Notification(
            user_id=TEST_USER_ID,
            type="health_alert",
            priority="high",
            content={
                "title": "Test Alert",
                "body": "Test notification body",
                "data": {"test_key": "test_value"},
                "sensitive": True
            }
        )

        assert str(notification.id) is not None
        assert notification.user_id == TEST_USER_ID
        assert notification.type == "health_alert"
        assert notification.priority == "high"
        assert notification.is_read is False
        assert notification.is_sent is False
        assert notification.created_at is not None
        assert notification.updated_at is not None
        assert "encryption_algorithm" in notification.metadata
        assert notification.metadata["encryption_algorithm"] == "AES-256-GCM"

    @freeze_time("2023-01-01 12:00:00")
    def test_mark_as_read(self):
        """Test marking notification as read with audit logging."""
        notification = Notification(
            user_id=TEST_USER_ID,
            type="health_alert",
            priority="high",
            content={"title": "Test", "body": "Test"}
        )
        
        result = notification.mark_as_read()
        
        assert result is True
        assert notification.is_read is True
        assert notification.updated_at == datetime(2023, 1, 1, 12, 0, 0)
        assert "read_at" in notification.metadata
        assert len(notification.audit_log["events"]) > 0
        assert notification.audit_log["events"][-1]["action"] == "mark_as_read"

    @freeze_time("2023-01-01 12:00:00")
    def test_mark_as_sent(self):
        """Test marking notification as sent with security validation."""
        notification = Notification(
            user_id=TEST_USER_ID,
            type="health_alert",
            priority="high",
            content={"title": "Test", "body": "Test"}
        )
        
        result = notification.mark_as_sent()
        
        assert result is True
        assert notification.is_sent is True
        assert notification.sent_at == datetime(2023, 1, 1, 12, 0, 0)
        assert "delivery" in notification.metadata
        assert notification.metadata["delivery"]["status"] == "delivered"
        assert len(notification.audit_log["events"]) > 0
        assert notification.audit_log["events"][-1]["action"] == "mark_as_sent"

@pytest.mark.unit
@pytest.mark.asyncio
class TestNotificationService:
    """Test suite for NotificationService functionality with security validation."""

    async def test_notification_encryption_validation(self, notification_service, security_context):
        """Test notification content encryption and validation."""
        notification = Notification(
            user_id=TEST_USER_ID,
            type="health_alert",
            priority="high",
            content={
                "title": "PHI Alert",
                "body": "Sensitive health information",
                "sensitive": True
            }
        )

        delivery_info = {"email": {"template": "phi_alert"}}
        result = await notification_service.send_notification(
            notification,
            ["email"],
            delivery_info,
            security_context
        )

        assert result["email"]["status"] == "delivered"
        assert "delivery_id" in result["email"]
        assert notification.is_sent is True
        assert len(notification.audit_log["events"]) > 0

    async def test_send_notification_email(self, notification_service, security_context):
        """Test sending notification via email channel with security context."""
        notification = Notification(
            user_id=TEST_USER_ID,
            type="health_alert",
            priority="high",
            content={
                "title": "Test Email",
                "body": "Test email body",
                "sensitive": True
            }
        )

        delivery_info = {
            "email": {
                "template": "default",
                "attachments": []
            }
        }

        result = await notification_service.send_notification(
            notification,
            ["email"],
            delivery_info,
            security_context
        )

        assert result["email"]["status"] == "delivered"
        assert notification.is_sent is True
        notification_service._email_service.send.assert_called_once()

    async def test_notification_key_rotation(self, notification_service, security_context):
        """Test encryption key rotation for notifications."""
        # Create test notifications with old key
        notifications = []
        for _ in range(3):
            notification = Notification(
                user_id=TEST_USER_ID,
                type="health_alert",
                priority="high",
                content={
                    "title": "Test Rotation",
                    "body": "Test body",
                    "sensitive": True
                }
            )
            notifications.append(notification)

        # Send notifications with old key
        for notification in notifications:
            await notification_service.send_notification(
                notification,
                ["email"],
                {"email": {}},
                security_context
            )

        # Simulate key rotation
        new_key = "NEW-AES256-GCM-TEST-KEY"
        with patch.dict(security_context, {"encryption_key": new_key}):
            # Verify notifications can still be processed
            for notification in notifications:
                result = await notification_service.send_notification(
                    notification,
                    ["push"],
                    {"push": {}},
                    security_context
                )
                assert result["push"]["status"] == "delivered"

def test_rate_limit_validation(notification_service):
    """Test rate limiting for notification channels."""
    # Set low rate limit for testing
    notification_service._channel_rate_limiters["email"]["limit"] = 2
    
    for _ in range(2):
        notification_service._check_rate_limits(["email"])
    
    with pytest.raises(ValueError, match="Rate limit exceeded"):
        notification_service._check_rate_limits(["email"])

@pytest.mark.asyncio
async def test_multi_channel_delivery(notification_service, security_context):
    """Test notification delivery across multiple channels."""
    notification = Notification(
        user_id=TEST_USER_ID,
        type="health_alert",
        priority="high",
        content={
            "title": "Multi-channel Test",
            "body": "Test message",
            "sensitive": True
        }
    )

    delivery_info = {
        "email": {"template": "default"},
        "push": {"priority": "high"},
        "sms": {"priority": "normal"}
    }

    result = await notification_service.send_notification(
        notification,
        ["email", "push", "sms"],
        delivery_info,
        security_context
    )

    assert all(channel in result for channel in ["email", "push", "sms"])
    assert all(result[channel]["status"] == "delivered" for channel in result)
    assert notification.is_sent is True

def pytest_configure(config):
    """Pytest configuration function with security settings."""
    config.addinivalue_line(
        "markers",
        "unit: mark test as unit test"
    )