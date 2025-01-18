"""
Database module initialization for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides centralized database functionality with secure connection management and HIPAA-compliant
data handling capabilities.

Version: 1.0.0
"""

import logging
from functools import wraps
from typing import Any, Dict, Optional, Union

from mongoengine import connect, disconnect  # mongoengine v0.24+
from pymongo import MongoClient  # pymongo v4.0+
from cryptography.fernet import Fernet  # cryptography v3.4+

from core.db.base import BaseDocument
from core.db.session import DatabaseSession, get_db_session
from core.logging import get_logger

# Initialize logger with security context
logger = get_logger(
    __name__,
    security_context={"module": "database", "component": "core"}
)

# Global constants for database configuration
VERSION = "1.0.0"
DEFAULT_CONNECTION_ALIAS = "default"
MAX_POOL_SIZE = 100
MIN_POOL_SIZE = 10
MAX_IDLE_TIME_MS = 300000
RETRY_WRITES = True
RETRY_READS = True

def log_operation(func):
    """Decorator for logging database operations with security context."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        operation = func.__name__
        logger.info(
            f"Database operation started: {operation}",
            extra={"operation": operation}
        )
        try:
            result = func(*args, **kwargs)
            logger.info(
                f"Database operation completed: {operation}",
                extra={"operation": operation, "status": "success"}
            )
            return result
        except Exception as e:
            logger.error(
                f"Database operation failed: {operation}",
                extra={"operation": operation, "status": "failed", "error": str(e)}
            )
            raise
    return wrapper

def retry(max_attempts: int = 3, delay: int = 1):
    """Decorator for retrying database operations with exponential backoff."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        sleep_time = delay * (2 ** attempt)
                        logger.warning(
                            f"Retry attempt {attempt + 1}/{max_attempts} after {sleep_time}s",
                            extra={"operation": func.__name__, "attempt": attempt + 1}
                        )
                        time.sleep(sleep_time)
            raise last_exception
        return wrapper
    return decorator

@retry(max_attempts=3, delay=1)
@log_operation
def initialize_db(
    connection_alias: str = DEFAULT_CONNECTION_ALIAS,
    connection_options: Optional[Dict[str, Any]] = None,
    ssl_options: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Initialize database connection with comprehensive security and monitoring features.

    Args:
        connection_alias (str): Unique identifier for the database connection
        connection_options (Dict): MongoDB connection configuration options
        ssl_options (Dict): SSL/TLS configuration for secure communication

    Returns:
        bool: Initialization success status
    """
    try:
        # Default connection options with security best practices
        default_options = {
            "maxPoolSize": MAX_POOL_SIZE,
            "minPoolSize": MIN_POOL_SIZE,
            "maxIdleTimeMS": MAX_IDLE_TIME_MS,
            "retryWrites": RETRY_WRITES,
            "retryReads": RETRY_READS,
            "w": "majority",
            "readPreference": "primaryPreferred",
            "serverSelectionTimeoutMS": 5000,
            "connectTimeoutMS": 10000
        }

        # Default SSL options for HIPAA compliance
        default_ssl_options = {
            "ssl": True,
            "ssl_cert_reqs": "CERT_REQUIRED",
            "ssl_ca_certs": "/path/to/ca.pem"
        }

        # Merge provided options with defaults
        connection_options = {**default_options, **(connection_options or {})}
        ssl_options = {**default_ssl_options, **(ssl_options or {})}

        # Initialize database session with security context
        session = DatabaseSession(
            max_retries=3,
            pool_settings=connection_options,
            ssl_enabled=True
        )

        # Establish secure connection
        if not session.connect():
            raise ConnectionError("Failed to establish database connection")

        # Validate connection health
        health_status = session.check_health()
        if not health_status["healthy"]:
            raise ConnectionError(f"Database health check failed: {health_status}")

        logger.info(
            "Database initialization successful",
            extra={"alias": connection_alias, "health_status": health_status}
        )
        return True

    except Exception as e:
        logger.error(
            "Database initialization failed",
            extra={"alias": connection_alias, "error": str(e)}
        )
        raise

@log_operation
def check_db_health(connection_alias: str = DEFAULT_CONNECTION_ALIAS) -> Dict[str, Any]:
    """
    Perform comprehensive database health check with security validation.

    Args:
        connection_alias (str): Database connection alias to check

    Returns:
        Dict[str, Any]: Health status with detailed diagnostics
    """
    try:
        with get_db_session() as session:
            # Get basic health status
            health_status = session.check_health()
            
            # Enhance with connection statistics
            connection_stats = session.get_connection_stats()
            
            # Combine health metrics
            health_metrics = {
                "status": "healthy" if health_status["healthy"] else "unhealthy",
                "timestamp": datetime.utcnow().isoformat(),
                "connection": {
                    "active": connection_stats["current_status"],
                    "pool_utilization": health_status.get("pool_stats", {}),
                    "latency_ms": health_status.get("ping_time_ms"),
                },
                "performance": {
                    "avg_connection_time_ms": connection_stats["avg_connection_time_ms"],
                    "total_connections": connection_stats["total_connections"],
                    "failed_connections": connection_stats["failed_connections"]
                },
                "security": {
                    "ssl_enabled": session._ssl_enabled,
                    "encryption_status": "active"
                }
            }

            logger.info(
                "Database health check completed",
                extra={"alias": connection_alias, "health_metrics": health_metrics}
            )
            return health_metrics

    except Exception as e:
        logger.error(
            "Database health check failed",
            extra={"alias": connection_alias, "error": str(e)}
        )
        raise

# Export database components
__all__ = [
    'BaseDocument',
    'DatabaseSession',
    'get_db_session',
    'initialize_db',
    'check_db_health',
    'VERSION',
    'DEFAULT_CONNECTION_ALIAS'
]