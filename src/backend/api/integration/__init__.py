"""
Integration module initialization for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides secure platform integrations, OAuth flows, and HIPAA-compliant data synchronization.

Version: 1.0.0
"""

from datetime import datetime, timezone
import logging
from typing import Dict, List

from core.config import settings
from core.logging import get_logger
from .routes import router
from .services import IntegrationService
from .models import PlatformIntegration, OAuthCredential

# Initialize module logger with security context
logger = get_logger(
    "integration",
    security_context={
        "service": "integration",
        "component": "module",
        "compliance": "HIPAA"
    }
)

# Supported health platforms with configuration requirements
SUPPORTED_PLATFORMS = ["apple_health", "google_fit", "fitbit"]

# Sync operation configuration
SYNC_BATCH_SIZE = 1000  # Records per batch
MAX_SYNC_DAYS = 30  # Maximum days for historical sync

# Platform-specific OAuth scopes
PLATFORM_SCOPES = {
    "apple_health": [
        "activity",
        "heart_rate",
        "blood_pressure",
        "weight",
        "steps"
    ],
    "google_fit": [
        "activity.read",
        "body.read",
        "heart_rate.read",
        "sleep.read"
    ],
    "fitbit": [
        "activity",
        "heartrate",
        "sleep",
        "weight"
    ]
}

# Initialize platform configurations
def initialize_platform_configs() -> Dict:
    """Initialize secure platform configurations with HIPAA compliance."""
    try:
        platform_configs = {}
        for platform in SUPPORTED_PLATFORMS:
            platform_configs[platform] = {
                "scopes": PLATFORM_SCOPES.get(platform, []),
                "sync_batch_size": SYNC_BATCH_SIZE,
                "max_sync_days": MAX_SYNC_DAYS,
                "encryption_enabled": True,
                "audit_enabled": True,
                "compliance_version": "HIPAA-2023",
                "initialized_at": datetime.now(timezone.utc).isoformat()
            }
        logger.info("Platform configurations initialized successfully")
        return platform_configs
    except Exception as e:
        logger.error(f"Failed to initialize platform configurations: {str(e)}")
        raise

# Initialize integration service factory
def create_integration_service(user_id: str) -> IntegrationService:
    """Create a new integration service instance with security context."""
    try:
        return IntegrationService(user_id)
    except Exception as e:
        logger.error(f"Failed to create integration service: {str(e)}")
        raise

# Validate platform support
def is_platform_supported(platform_type: str) -> bool:
    """Check if a platform type is supported and properly configured."""
    return platform_type in SUPPORTED_PLATFORMS

# Module initialization
try:
    # Initialize platform configurations
    platform_configs = initialize_platform_configs()
    
    # Log module initialization
    logger.info(
        "Integration module initialized",
        extra={
            "supported_platforms": SUPPORTED_PLATFORMS,
            "sync_batch_size": SYNC_BATCH_SIZE,
            "max_sync_days": MAX_SYNC_DAYS
        }
    )
except Exception as e:
    logger.error(f"Integration module initialization failed: {str(e)}")
    raise

# Export public components
__all__ = [
    "router",  # API routes for platform integration
    "IntegrationService",  # Service class for managing integrations
    "PlatformIntegration",  # Data model for platform configurations
    "OAuthCredential",  # Data model for OAuth credentials
    "create_integration_service",  # Factory function for service creation
    "is_platform_supported",  # Platform support validation
    "SUPPORTED_PLATFORMS",  # List of supported platforms
    "SYNC_BATCH_SIZE",  # Batch size for sync operations
    "MAX_SYNC_DAYS"  # Maximum days for historical sync
]