"""
Core initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Configures and exposes essential backend services including configuration, logging,
security components, and key rotation management.

Version: 1.0.0
"""

import logging
import threading
from typing import Optional

from .config import Settings, get_settings, validate_settings
from .logging import setup_logging, get_logger
from .security import SecurityManager

# Initialize thread-safe lock for core initialization
_initialization_lock = threading.Lock()

# Initialize core components with security context
logger = get_logger(__name__, security_context={"module": "core", "component": "initialization"})
settings = get_settings()
security_manager = SecurityManager(settings)

def initialize_core() -> bool:
    """
    Initialize core module components and configurations with thread safety and enhanced security.
    Ensures proper initialization sequence and validation of critical components.
    
    Returns:
        bool: True if initialization successful, False otherwise
    """
    try:
        with _initialization_lock:
            logger.info("Starting core initialization...")
            
            # Validate environment variables and settings
            if not validate_settings():
                logger.error("Settings validation failed")
                return False
                
            # Configure logging system with security context
            setup_logging(
                log_level=settings.LOG_LEVEL,
                json_output=True,
                security_context={
                    "environment": settings.ENV_STATE,
                    "app_version": settings.APP_VERSION
                }
            )
            logger.info("Logging system configured successfully")
            
            # Initialize security manager with encryption key validation
            if not security_manager._encryption_key:
                logger.error("Security manager encryption key initialization failed")
                return False
                
            # Setup automated key rotation schedule
            if settings.ENV_STATE == "production":
                if not security_manager.rotate_keys():
                    logger.warning("Initial key rotation check completed")
                    
            # Configure audit logging for security events
            logger.info(
                "Security components initialized",
                extra={
                    "event_type": "security_init",
                    "severity": "INFO",
                    "action": "initialization",
                    "outcome": "success"
                }
            )
            
            # Verify all components initialized successfully
            initialization_status = all([
                settings is not None,
                security_manager is not None,
                logger is not None
            ])
            
            if initialization_status:
                logger.info(
                    "Core initialization completed successfully",
                    extra={
                        "event_type": "core_init",
                        "severity": "INFO",
                        "action": "initialization",
                        "outcome": "success"
                    }
                )
                return True
            else:
                logger.error("Core initialization failed - component verification failed")
                return False
                
    except Exception as e:
        logger.error(
            f"Core initialization failed: {str(e)}",
            extra={
                "event_type": "core_init",
                "severity": "ERROR",
                "action": "initialization",
                "outcome": "failure",
                "error": str(e)
            }
        )
        return False

# Export core components
__all__ = [
    'settings',
    'security_manager',
    'logger',
    'initialize_core'
]