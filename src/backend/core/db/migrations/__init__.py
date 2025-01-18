"""
Database migrations initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides secure, HIPAA-compliant database migration configuration and management.

Version: 1.0.0
"""

import os
from typing import Dict, Optional

from alembic import context  # alembic 1.11+
from security_context import SecurityContext  # python-security-context 2.0+

from core.logging import get_logger

# Initialize secure logger with migration context
logger = get_logger(
    __name__,
    security_context={
        "component": "migrations",
        "module": "initialization"
    }
)

# Migration package configuration with security context
MIGRATION_PACKAGE = "core.db.migrations"
MIGRATION_SCRIPT_LOCATION = "core/db/migrations"

# HIPAA-compliant security context configuration
SECURITY_CONTEXT = {
    "compliance_level": "HIPAA",
    "audit_enabled": True,
    "encryption_required": True,
    "audit_retention_days": 2555  # 7 years HIPAA retention
}

# Migration configuration with security controls
MIGRATION_CONFIG = {
    "verify_checksums": True,
    "require_downgrade_scripts": True,
    "audit_schema_changes": True,
    "script_location": MIGRATION_SCRIPT_LOCATION,
    "sqlalchemy.url": None,  # Set dynamically for security
    "transaction_per_migration": True,
    "compare_type": True,
    "compare_server_default": True
}

def initialize_security_context() -> SecurityContext:
    """Initialize secure migration context with HIPAA compliance settings."""
    try:
        security_ctx = SecurityContext(
            compliance_level=SECURITY_CONTEXT["compliance_level"],
            audit_enabled=SECURITY_CONTEXT["audit_enabled"],
            encryption_required=SECURITY_CONTEXT["encryption_required"]
        )
        logger.info(
            "Security context initialized successfully",
            extra={"compliance_level": SECURITY_CONTEXT["compliance_level"]}
        )
        return security_ctx
    except Exception as e:
        logger.error(
            "Failed to initialize security context",
            extra={"error": str(e)}
        )
        raise

def validate_migration_environment() -> bool:
    """Validate migration environment security requirements."""
    try:
        # Verify migration script directory permissions
        script_dir = os.path.dirname(os.path.abspath(__file__))
        if not os.path.exists(script_dir):
            raise ValueError(f"Migration directory not found: {script_dir}")
        
        # Verify script directory permissions (700 for security)
        current_mode = os.stat(script_dir).st_mode & 0o777
        if current_mode != 0o700:
            logger.warning(
                "Migration directory permissions are not secure",
                extra={"current_mode": oct(current_mode)}
            )
            os.chmod(script_dir, 0o700)
        
        logger.info("Migration environment validated successfully")
        return True
    except Exception as e:
        logger.error(
            "Migration environment validation failed",
            extra={"error": str(e)}
        )
        raise

def configure_migration_context(config: Optional[Dict] = None) -> Dict:
    """Configure migration context with security parameters."""
    try:
        migration_config = MIGRATION_CONFIG.copy()
        if config:
            migration_config.update(config)
        
        # Validate security-critical configurations
        if not migration_config.get("verify_checksums"):
            raise ValueError("Checksum verification must be enabled")
        if not migration_config.get("transaction_per_migration"):
            raise ValueError("Transaction per migration must be enabled")
            
        logger.info("Migration context configured successfully")
        return migration_config
    except Exception as e:
        logger.error(
            "Failed to configure migration context",
            extra={"error": str(e)}
        )
        raise

def initialize_migrations() -> None:
    """Initialize migration system with security controls and HIPAA compliance."""
    try:
        # Initialize security context
        security_ctx = initialize_security_context()
        
        # Validate migration environment
        validate_migration_environment()
        
        # Configure migration context
        migration_config = configure_migration_context()
        
        # Set up alembic context with security parameters
        if not context.is_offline_mode():
            from core.db.migrations.env import run_migrations_online
            context.configure(**migration_config)
            with context.begin_transaction():
                run_migrations_online()
        else:
            from core.db.migrations.env import run_migrations_offline
            run_migrations_offline()
            
        logger.info("Migration system initialized successfully")
    except Exception as e:
        logger.error(
            "Migration system initialization failed",
            extra={"error": str(e)}
        )
        raise

# Export migration components
__all__ = [
    'initialize_migrations',
    'configure_migration_context',
    'validate_migration_environment',
    'initialize_security_context',
    'MIGRATION_PACKAGE',
    'MIGRATION_SCRIPT_LOCATION',
    'SECURITY_CONTEXT',
    'MIGRATION_CONFIG'
]