"""
Cache service initialization module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides a thread-safe, HIPAA-compliant Redis cache singleton with performance optimization.

Version: 1.0.0
"""

import threading
from typing import Optional

from .redis import RedisCache  # redis v4.5+
from core.config import get_settings
from core.logging import get_logger

# Thread-safe singleton instance
_cache_instance: Optional[RedisCache] = None
_cache_lock = threading.Lock()

# Configure HIPAA-compliant logging
_logger = get_logger(__name__)

def get_cache() -> RedisCache:
    """
    Get or create a thread-safe singleton cache instance with HIPAA compliance 
    and performance optimization.

    Returns:
        RedisCache: Global cache instance with security and monitoring capabilities
    """
    global _cache_instance

    # Fast path - return existing instance if available
    if _cache_instance is not None:
        return _cache_instance

    # Slow path - create new instance with thread safety
    with _cache_lock:
        # Double-check pattern to prevent race conditions
        if _cache_instance is not None:
            return _cache_instance

        try:
            # Get configuration settings
            settings = get_settings()
            
            # Configure cache settings with HIPAA compliance
            cache_config = {
                "expire_time": settings.DEFAULT_CACHE_TTL,
                "max_retries": 3
            }

            # Configure encryption for PHI/PII data
            encryption_config = {
                "algorithm": "AES-256-GCM",
                "key_rotation": True,
                "key_rotation_interval": 90  # days
            }

            # Initialize Redis cache with security and monitoring
            _cache_instance = RedisCache(
                url=settings.get_redis_url(),
                default_expire_time=cache_config["expire_time"],
                max_retries=cache_config["max_retries"],
                encryption_config=encryption_config
            )

            _logger.info("Redis cache singleton initialized successfully")
            return _cache_instance

        except Exception as e:
            _logger.error(f"Failed to initialize Redis cache: {str(e)}")
            raise

# Export cache-related components
__all__ = [
    "get_cache",
    "RedisCache"
]