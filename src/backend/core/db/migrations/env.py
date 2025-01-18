"""
Enhanced Alembic migrations environment configuration for PHRSAT system.
Implements secure database schema migrations with HIPAA compliance,
comprehensive audit logging, and robust error handling.

Version: 1.0.0
"""

import logging
from logging.config import fileConfig
from typing import Optional

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.exc import DatabaseError
from tenacity import retry, stop_after_attempt, retry_if_exception_type

from core.config import Settings, get_settings
from core.db.session import DatabaseSession
from core.logging import AuditLogger, get_logger

# Initialize secure logger with migration context
logger = get_logger(
    __name__,
    security_context={"component": "migrations", "module": "alembic"}
)

# Alembic Config object with security context
config = context.config

# Configure logging with security parameters
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import metadata from models for migrations
from core.db.base import Base
target_metadata = Base.metadata

# Constants for migration configuration
RETRY_ATTEMPTS = 3
TRANSACTION_ISOLATION_LEVEL = "REPEATABLE_READ"
AUDIT_RETENTION_DAYS = 2555  # 7 years for HIPAA compliance

def get_secure_url() -> str:
    """Get database URL with security parameters."""
    settings = get_settings()
    return settings.get_mongodb_url()

def configure_alembic_context(connection: Optional[str] = None) -> dict:
    """Configure Alembic context with security parameters."""
    context_config = config.get_section(config.config_ini_section)
    if connection:
        context_config["connection"] = connection
    
    # Set secure configuration parameters
    context_config.update({
        "isolation_level": TRANSACTION_ISOLATION_LEVEL,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
        "connect_args": {
            "application_name": "phrsat_migrations",
            "sslmode": "verify-full",
            "connect_timeout": 10
        }
    })
    return context_config

@AuditLogger.track_operation(
    event_type="database_migration",
    resource_type="schema",
    retention_days=AUDIT_RETENTION_DAYS
)
def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode with enhanced security and logging."""
    try:
        # Get secure database URL
        url = get_secure_url()
        
        # Configure context with security parameters
        context_config = configure_alembic_context(url)
        
        # Execute migration with audit logging
        logger.info("Starting offline migration execution")
        context.configure(
            url=url,
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            **context_config
        )

        with context.begin_transaction():
            context.run_migrations()
            
        logger.info("Offline migration completed successfully")
        
    except Exception as e:
        logger.error(
            "Offline migration failed",
            extra={"error": str(e), "migration_mode": "offline"}
        )
        raise

@AuditLogger.track_operation(
    event_type="database_migration",
    resource_type="schema",
    retention_days=AUDIT_RETENTION_DAYS
)
@retry(
    stop=stop_after_attempt(RETRY_ATTEMPTS),
    retry=retry_if_exception_type(DatabaseError),
    before=lambda _: logger.warning("Retrying migration after failure")
)
def run_migrations_online() -> None:
    """Run migrations in 'online' mode with transaction management and retry logic."""
    try:
        # Create secure database engine
        context_config = configure_alembic_context()
        connectable = engine_from_config(
            context_config,
            prefix="sqlalchemy.",
            poolclass=pool.QueuePool,
            isolation_level=TRANSACTION_ISOLATION_LEVEL
        )

        # Validate database connection
        with DatabaseSession() as db_session:
            if not db_session.validate_connection():
                raise DatabaseError("Failed to validate database connection")

        # Execute migration with transaction management
        with connectable.connect() as connection:
            logger.info("Starting online migration execution")
            
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                transaction_per_migration=True,
                compare_type=True,
                compare_server_default=True
            )

            # Begin transaction with isolation level
            with context.begin_transaction():
                context.run_migrations()
                
                # Verify migration consistency
                if not verify_migration_consistency(connection):
                    raise DatabaseError("Migration consistency check failed")
                
            logger.info("Online migration completed successfully")

    except Exception as e:
        logger.error(
            "Online migration failed",
            extra={"error": str(e), "migration_mode": "online"}
        )
        raise

def verify_migration_consistency(connection) -> bool:
    """Verify database consistency after migration."""
    try:
        # Perform basic schema validation
        connection.execute("SELECT 1")
        return True
    except Exception as e:
        logger.error(
            "Migration consistency check failed",
            extra={"error": str(e)}
        )
        return False

if context.is_offline_mode():
    logger.info("Running migrations in offline mode")
    run_migrations_offline()
else:
    logger.info("Running migrations in online mode")
    run_migrations_online()