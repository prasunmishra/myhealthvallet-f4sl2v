"""
Database session management module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides secure MongoDB connection lifecycle management with connection pooling, health checks,
and comprehensive monitoring capabilities.

Version: 1.0.0
"""

import time
from contextlib import contextmanager  # python 3.11+
from typing import Dict, Optional

from mongoengine import connect, disconnect  # mongoengine 0.24+
from mongoengine.connection import ConnectionFailure

from core.config import Settings
from core.logging import get_logger

# Constants for connection management
DEFAULT_MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5
DEFAULT_POOL_SIZE = 100
CONNECTION_TIMEOUT_MS = 5000
HEALTH_CHECK_INTERVAL_MS = 30000

# Initialize logger with security context
logger = get_logger(
    __name__,
    security_context={"module": "database", "component": "session"}
)

class DatabaseSession:
    """
    Advanced database session manager for MongoDB connections with connection pooling,
    health checks, and comprehensive monitoring capabilities.
    """

    def __init__(
        self,
        max_retries: int = DEFAULT_MAX_RETRIES,
        pool_settings: Optional[Dict] = None,
        ssl_enabled: bool = True
    ) -> None:
        """
        Initialize database session manager with connection pooling and monitoring.

        Args:
            max_retries (int): Maximum connection retry attempts
            pool_settings (Dict): Connection pool configuration
            ssl_enabled (bool): Enable SSL/TLS for connections
        """
        self._connected = False
        self._retry_count = 0
        self._max_retries = max_retries
        self._pool_settings = pool_settings or {
            "maxPoolSize": DEFAULT_POOL_SIZE,
            "minPoolSize": DEFAULT_POOL_SIZE // 4,
            "maxIdleTimeMS": 30000,
            "waitQueueTimeoutMS": CONNECTION_TIMEOUT_MS
        }
        self._last_connection_time = 0
        self._connection_stats = {
            "total_connections": 0,
            "failed_connections": 0,
            "last_error": None,
            "avg_connection_time_ms": 0
        }
        self._ssl_enabled = ssl_enabled

    def connect(self) -> bool:
        """
        Establish MongoDB connection with retry mechanism and connection pooling.

        Returns:
            bool: Connection success status
        """
        while self._retry_count < self._max_retries:
            try:
                start_time = time.time()
                
                # Get MongoDB URL with security parameters
                mongodb_url = Settings.get_mongodb_url()
                
                # Configure connection with security and pooling settings
                connect(
                    host=mongodb_url,
                    ssl=self._ssl_enabled,
                    ssl_cert_reqs='CERT_REQUIRED' if self._ssl_enabled else None,
                    serverSelectionTimeoutMS=CONNECTION_TIMEOUT_MS,
                    connectTimeoutMS=CONNECTION_TIMEOUT_MS,
                    **self._pool_settings
                )

                # Validate connection health
                health_status = self.check_health()
                if not health_status["healthy"]:
                    raise ConnectionFailure(f"Health check failed: {health_status}")

                # Update connection statistics
                connection_time = (time.time() - start_time) * 1000
                self._update_connection_stats(True, connection_time)
                
                self._connected = True
                logger.info(
                    "MongoDB connection established successfully",
                    extra={"connection_time_ms": connection_time}
                )
                return True

            except ConnectionFailure as e:
                self._retry_count += 1
                self._update_connection_stats(False, error=str(e))
                
                if self._retry_count < self._max_retries:
                    retry_delay = RETRY_DELAY_SECONDS * (2 ** (self._retry_count - 1))
                    logger.warning(
                        f"Connection attempt {self._retry_count} failed. "
                        f"Retrying in {retry_delay} seconds...",
                        extra={"error": str(e)}
                    )
                    time.sleep(retry_delay)
                else:
                    logger.error(
                        "Maximum connection retry attempts reached",
                        extra={"max_retries": self._max_retries}
                    )
                    raise

        return False

    def disconnect(self) -> bool:
        """
        Safely close MongoDB connection and cleanup resources.

        Returns:
            bool: Disconnection success status
        """
        try:
            if self._connected:
                disconnect()
                self._connected = False
                logger.info("MongoDB connection closed successfully")
                return True
            return False
        except Exception as e:
            logger.error(
                "Error during MongoDB disconnection",
                extra={"error": str(e)}
            )
            return False

    def check_health(self) -> Dict:
        """
        Validate connection health and pool status.

        Returns:
            Dict: Health check results including connection pool metrics
        """
        try:
            from mongoengine.connection import get_db
            db = get_db()
            
            # Perform server ping
            ping_start = time.time()
            db.command("ping")
            ping_time = (time.time() - ping_start) * 1000

            # Get connection pool stats
            pool_stats = db.command("connPoolStats")
            
            return {
                "healthy": True,
                "ping_time_ms": ping_time,
                "pool_stats": {
                    "active_connections": pool_stats.get("numConnections", 0),
                    "available_connections": pool_stats.get("available", 0),
                    "max_connections": self._pool_settings["maxPoolSize"]
                },
                "last_check_time": time.time()
            }
        except Exception as e:
            logger.error(
                "Health check failed",
                extra={"error": str(e)}
            )
            return {
                "healthy": False,
                "error": str(e),
                "last_check_time": time.time()
            }

    def get_connection_stats(self) -> Dict:
        """
        Retrieve connection statistics and metrics.

        Returns:
            Dict: Connection statistics and performance metrics
        """
        return {
            **self._connection_stats,
            "current_status": "connected" if self._connected else "disconnected",
            "pool_utilization": self.check_health()["pool_stats"] if self._connected else None,
            "uptime_seconds": time.time() - self._last_connection_time if self._connected else 0
        }

    def _update_connection_stats(self, success: bool, connection_time_ms: float = 0, error: str = None) -> None:
        """
        Update internal connection statistics.

        Args:
            success (bool): Connection attempt success status
            connection_time_ms (float): Connection establishment time in milliseconds
            error (str): Error message if connection failed
        """
        self._connection_stats["total_connections"] += 1
        if not success:
            self._connection_stats["failed_connections"] += 1
            self._connection_stats["last_error"] = error
        
        # Update average connection time
        if success and connection_time_ms > 0:
            current_avg = self._connection_stats["avg_connection_time_ms"]
            total_conn = self._connection_stats["total_connections"]
            self._connection_stats["avg_connection_time_ms"] = (
                (current_avg * (total_conn - 1) + connection_time_ms) / total_conn
            )

@contextmanager
def get_db_session(
    max_retries: int = DEFAULT_MAX_RETRIES,
    pool_settings: Optional[Dict] = None,
    ssl_enabled: bool = True
) -> DatabaseSession:
    """
    Get database session context manager with enhanced error handling and monitoring.

    Args:
        max_retries (int): Maximum connection retry attempts
        pool_settings (Dict): Connection pool configuration
        ssl_enabled (bool): Enable SSL/TLS for connections

    Yields:
        DatabaseSession: Active database session
    """
    session = DatabaseSession(
        max_retries=max_retries,
        pool_settings=pool_settings,
        ssl_enabled=ssl_enabled
    )
    
    try:
        session.connect()
        yield session
    except Exception as e:
        logger.error(
            "Database session error",
            extra={"error": str(e)}
        )
        raise
    finally:
        session.disconnect()

# Export session management components
__all__ = ["DatabaseSession", "get_db_session"]