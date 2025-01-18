"""
Integration tests for PHRSAT notification system.
Validates end-to-end notification delivery with HIPAA compliance and security verification.

Version: 1.0.0
"""

import pytest
import pytest_asyncio  # version 0.21+
from datetime import datetime, timedelta
from freezegun import freeze_time  # version 1.2+
from uuid import uuid4

from api.notifications.services import NotificationService
from security_manager import SecurityManager  # version 1.0+
from audit_logger import AuditLogger  # version 2.0+

# Test constants
TEST_USER_ID = str(uuid4())
TEST_EMAIL = "test@example.com"
TEST_PHONE = "+1234567890"
TEST_DEVICE_TOKEN = "test_device_token"
ENCRYPTION_KEY = "test_encryption_key"
MAX_RETRIES = 3
RETRY_BACKOFF = 60

@pytest.fixture
async def notification_service(db_fixture):
    """Initialize notification service with test configuration."""
    config = {
        'email_service': {
            'api_key': 'test_email_key',
            'template_id': 'test_template'
        },
        'push_service': {
            'api_key': 'test_push_key',
            'app_id': 'test_app'
        },
        'sms_service': {
            'account_sid': 'test_sid',
            'auth_token': 'test_token'
        },
        'rate_limits': {
            'email': 100,
            'push': 100,
            'sms': 50
        }
    }
    
    security_context = {
        'encryption_key': ENCRYPTION_KEY,
        'phi_authorized': True
    }
    
    service = NotificationService(
        email_service=config['email_service'],
        push_service=config['push_service'],
        sms_service=config['sms_service'],
        rate_limit_config=config['rate_limits']
    )
    
    return service

@pytest.mark.asyncio
@pytest.mark.integration
async def test_send_email_notification(
    notification_service,
    security_manager,
    audit_logger,
    db_fixture
):
    """Test secure email notification delivery with encryption and audit verification."""
    # Prepare test notification
    notification_data = {
        'user_id': TEST_USER_ID,
        'type': 'health_alert',
        'priority': 'high',
        'content': {
            'title': 'Test Health Alert',
            'body': 'This is a test health notification',
            'data': {
                'alert_type': 'medication_reminder',
                'medication': 'Test Medication'
            },
            'sensitive': True
        }
    }
    
    delivery_info = {
        'email': {
            'recipient': TEST_EMAIL,
            'template': 'health_alert',
            'attachments': []
        }
    }
    
    security_context = {
        'encryption_key': ENCRYPTION_KEY,
        'phi_authorized': True,
        'user_id': TEST_USER_ID
    }
    
    # Send notification
    result = await notification_service.send_notification(
        notification=notification_data,
        channels=['email'],
        delivery_info=delivery_info,
        security_context=security_context
    )
    
    # Verify delivery result
    assert result['email']['status'] == 'delivered'
    assert 'delivery_id' in result['email']
    
    # Verify encryption
    encrypted_content = result['email'].get('encrypted_content')
    assert encrypted_content is not None
    decrypted_content = security_manager.decrypt_content(encrypted_content)
    assert 'medication' in decrypted_content['data']
    
    # Verify audit trail
    audit_logs = await audit_logger.get_logs(
        correlation_id=result['email']['delivery_id']
    )
    assert len(audit_logs) > 0
    assert audit_logs[0]['event_type'] == 'notification_sent'
    assert audit_logs[0]['channel'] == 'email'

@pytest.mark.asyncio
@pytest.mark.integration
async def test_multi_channel_notification(
    notification_service,
    security_manager,
    audit_logger,
    db_fixture
):
    """Test concurrent notification delivery across multiple channels."""
    # Prepare test notification
    notification_data = {
        'user_id': TEST_USER_ID,
        'type': 'appointment_reminder',
        'priority': 'medium',
        'content': {
            'title': 'Upcoming Appointment',
            'body': 'You have an appointment tomorrow',
            'data': {
                'appointment_id': str(uuid4()),
                'provider': 'Dr. Test',
                'time': datetime.utcnow() + timedelta(days=1)
            },
            'sensitive': True
        }
    }
    
    delivery_info = {
        'email': {
            'recipient': TEST_EMAIL,
            'template': 'appointment'
        },
        'push': {
            'device_token': TEST_DEVICE_TOKEN,
            'sound': 'default'
        },
        'sms': {
            'phone_number': TEST_PHONE,
            'priority': 'normal'
        }
    }
    
    security_context = {
        'encryption_key': ENCRYPTION_KEY,
        'phi_authorized': True,
        'user_id': TEST_USER_ID
    }
    
    # Send notifications to multiple channels
    result = await notification_service.send_notification(
        notification=notification_data,
        channels=['email', 'push', 'sms'],
        delivery_info=delivery_info,
        security_context=security_context
    )
    
    # Verify delivery to all channels
    assert all(channel in result for channel in ['email', 'push', 'sms'])
    assert all(result[channel]['status'] == 'delivered' for channel in result)
    
    # Verify encryption for each channel
    for channel in result:
        encrypted_content = result[channel].get('encrypted_content')
        assert encrypted_content is not None
        decrypted_content = security_manager.decrypt_content(encrypted_content)
        assert 'appointment_id' in decrypted_content['data']
    
    # Verify audit logs for all channels
    audit_logs = await audit_logger.get_logs(
        user_id=TEST_USER_ID,
        time_range=timedelta(minutes=5)
    )
    assert len(audit_logs) >= 3  # At least one log per channel
    channels_logged = set(log['channel'] for log in audit_logs)
    assert channels_logged == {'email', 'push', 'sms'}

@pytest.mark.asyncio
@pytest.mark.integration
@freeze_time("2024-01-01 12:00:00")
async def test_notification_retry_mechanism(
    notification_service,
    security_manager,
    audit_logger,
    db_fixture
):
    """Test notification retry mechanism with security validation."""
    # Prepare test notification
    notification_data = {
        'user_id': TEST_USER_ID,
        'type': 'security_alert',
        'priority': 'critical',
        'content': {
            'title': 'Security Alert',
            'body': 'Suspicious login attempt detected',
            'data': {
                'alert_id': str(uuid4()),
                'ip_address': '192.168.1.1',
                'timestamp': datetime.utcnow().isoformat()
            },
            'sensitive': True
        }
    }
    
    delivery_info = {
        'email': {
            'recipient': TEST_EMAIL,
            'template': 'security_alert',
            'priority': 'high'
        }
    }
    
    security_context = {
        'encryption_key': ENCRYPTION_KEY,
        'phi_authorized': True,
        'user_id': TEST_USER_ID
    }
    
    # Configure service to simulate initial failure
    notification_service._email_service.fail_next_delivery = True
    
    # Attempt delivery with retry
    result = await notification_service.send_notification(
        notification=notification_data,
        channels=['email'],
        delivery_info=delivery_info,
        security_context=security_context
    )
    
    # Verify successful retry
    assert result['email']['status'] == 'delivered'
    assert result['email'].get('retry_count', 0) > 0
    
    # Verify security maintained during retries
    encrypted_content = result['email'].get('encrypted_content')
    assert encrypted_content is not None
    decrypted_content = security_manager.decrypt_content(encrypted_content)
    assert 'alert_id' in decrypted_content['data']
    
    # Verify retry audit trail
    audit_logs = await audit_logger.get_logs(
        correlation_id=result['email']['delivery_id']
    )
    retry_logs = [log for log in audit_logs if log['event_type'] == 'notification_retry']
    assert len(retry_logs) > 0
    assert retry_logs[0]['retry_count'] > 0