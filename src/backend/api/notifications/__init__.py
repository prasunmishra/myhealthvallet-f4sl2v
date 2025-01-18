"""
Entry point for the notifications module in the PHRSAT system.
Provides secure notification management with HIPAA compliance, field-level encryption,
and real-time delivery capabilities.

Version: 1.0.0
"""

from typing import Dict, Tuple

from cryptography.fernet import AESCipher  # v3.4.0
from fastapi_limiter import RateLimiter  # v0.1.5
from fastapi_security import SecurityMiddleware  # v0.5.0

from api.notifications.handlers import (
    NotificationHandler,
    create_notification_handler
)
from api.notifications.models import (
    Notification,
    NotificationContent
)
from api.notifications.routes import create_notification_router

# Global constants for notification configuration
NOTIFICATION_TYPES = [
    "health_alert",
    "appointment_reminder",
    "system_update",
    "data_sync"
]

NOTIFICATION_PRIORITIES = [
    "high",
    "medium",
    "low"
]

ENCRYPTION_KEY_ROTATION_DAYS = 30
MAX_NOTIFICATIONS_PER_MINUTE = 100
WEBSOCKET_TIMEOUT_SECONDS = 300

def initialize_notifications(
    encryption_key: str,
    rate_limit_config: Dict
) -> Tuple[NotificationHandler, 'FastAPI.APIRouter']:
    """
    Initialize the notifications module with security middleware and encryption.
    
    Args:
        encryption_key: AES-256 encryption key for field-level encryption
        rate_limit_config: Configuration for rate limiting notification endpoints
        
    Returns:
        Tuple of (NotificationHandler, FastAPI router) with security configuration
        
    Raises:
        ValueError: If encryption key is invalid or missing
        RuntimeError: If initialization fails
    """
    try:
        # Initialize encryption
        cipher = AESCipher(encryption_key)
        
        # Configure rate limiting
        rate_limiter = RateLimiter(
            max_requests=rate_limit_config.get('max_requests', MAX_NOTIFICATIONS_PER_MINUTE),
            time_window=rate_limit_config.get('time_window', 60)
        )
        
        # Initialize security middleware
        security_middleware = SecurityMiddleware(
            encryption_key=encryption_key,
            enable_audit_log=True,
            phi_protection=True
        )
        
        # Create notification handler with security configuration
        handler_config = {
            'encryption': cipher,
            'rate_limiter': rate_limiter,
            'security': security_middleware,
            'notification_types': NOTIFICATION_TYPES,
            'notification_priorities': NOTIFICATION_PRIORITIES,
            'key_rotation_days': ENCRYPTION_KEY_ROTATION_DAYS
        }
        notification_handler = create_notification_handler(handler_config)
        
        # Create and configure router with security
        router = create_notification_router(
            auth_middleware=security_middleware.authenticate,
            rate_limiter=rate_limiter
        )
        
        return notification_handler, router
        
    except Exception as e:
        raise RuntimeError(f"Failed to initialize notifications module: {str(e)}")

# Export public interfaces
__all__ = [
    'NotificationHandler',
    'Notification',
    'NotificationContent',
    'initialize_notifications',
    'NOTIFICATION_TYPES',
    'NOTIFICATION_PRIORITIES'
]

# Version information
__version__ = '1.0.0'