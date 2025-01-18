"""
Authentication module initialization for Personal Health Record Store and Analysis Tool (PHRSAT).
Configures and exports core authentication components with enhanced security features,
HIPAA compliance, and comprehensive monitoring.

Version: 1.0.0
"""

import logging
from typing import Dict, Optional

from security_monitor import SecurityMonitor  # security-monitor v2.1.0
from hipaa_compliance import HIPAAValidator  # hipaa-compliance v1.5.0

from api.auth.routes import router
from api.auth.services import AuthenticationService
from api.auth.models import User, Role

# Configure logging
logger = logging.getLogger(__name__)

# Module version
__version__ = "1.0.0"

# Security configuration
SECURITY_CONFIG = {
    "audit_level": "detailed",
    "encryption_algorithm": "AES-256-GCM",
    "token_version": "2.0"
}

def initialize_security_monitoring() -> None:
    """Initialize enhanced security monitoring and audit logging."""
    try:
        security_monitor = SecurityMonitor(
            app_name="PHRSAT",
            audit_level=SECURITY_CONFIG["audit_level"],
            enable_real_time_alerts=True
        )
        security_monitor.start_monitoring()
        logger.info("Security monitoring initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize security monitoring: {str(e)}")
        raise

def configure_hipaa_compliance() -> None:
    """Configure and validate HIPAA compliance settings."""
    try:
        hipaa_validator = HIPAAValidator(
            encryption_algorithm=SECURITY_CONFIG["encryption_algorithm"],
            enable_audit_logging=True,
            phi_protection_level="maximum"
        )
        hipaa_validator.validate_configuration()
        logger.info("HIPAA compliance configuration validated")
    except Exception as e:
        logger.error(f"HIPAA compliance validation failed: {str(e)}")
        raise

def initialize_authentication() -> None:
    """Initialize authentication components with enhanced security."""
    try:
        # Configure field-level encryption for User model
        User.configure_encryption(algorithm=SECURITY_CONFIG["encryption_algorithm"])
        
        # Initialize audit logging for User model
        User.initialize_audit_logging(level=SECURITY_CONFIG["audit_level"])
        
        # Initialize role hierarchy for RBAC
        Role.initialize_hierarchy()
        
        # Configure security features for AuthenticationService
        AuthenticationService.configure_security(
            token_version=SECURITY_CONFIG["token_version"],
            enable_device_trust=True,
            mfa_required=True
        )
        
        # Initialize security monitoring for AuthenticationService
        AuthenticationService.initialize_monitoring(
            audit_level=SECURITY_CONFIG["audit_level"],
            real_time_alerts=True
        )
        
        logger.info("Authentication components initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize authentication components: {str(e)}")
        raise

# Initialize all security components
try:
    initialize_security_monitoring()
    configure_hipaa_compliance()
    initialize_authentication()
except Exception as e:
    logger.critical(f"Failed to initialize authentication module: {str(e)}")
    raise

# Export authentication components
__all__ = [
    "router",
    "AuthenticationService",
    "User",
    "Role",
    "__version__",
    "SECURITY_CONFIG"
]