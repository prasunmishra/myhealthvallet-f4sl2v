"""
Redis cache service implementation providing distributed caching capabilities for the PHRSAT backend services.
Implements HIPAA-compliant caching with encryption, monitoring, and audit logging.

Version: 1.0.0
"""

import json
from typing import Any, Dict, Optional
import asyncio

from redis import Redis  # redis v4.5+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0+
from prometheus_client import Counter, Gauge, Histogram  # prometheus_client v0.16+

from core.config import Settings, get_redis_url
from core.logging import get_logger
from core.exceptions import ValidationException
from core.security import encrypt_data

# Constants
DEFAULT_EXPIRE_TIME = 3600  # 1 hour in seconds
HEALTH_CHECK_KEY = "health_check"
MAX_RETRIES = 3
ENCRYPTION_ALGORITHM = "AES-256-GCM"
METRIC_PREFIX = "redis_cache"

# Prometheus metrics
CACHE_HITS = Counter(
    f"{METRIC_PREFIX}_hits_total",
    "Total number of cache hits"
)
CACHE_MISSES = Counter(
    f"{METRIC_PREFIX}_misses_total",
    "Total number of cache misses"
)
CACHE_ERRORS = Counter(
    f"{METRIC_PREFIX}_errors_total",
    "Total number of cache operation errors"
)
CACHE_LATENCY = Histogram(
    f"{METRIC_PREFIX}_operation_latency_seconds",
    "Latency of cache operations"
)
CACHE_MEMORY = Gauge(
    f"{METRIC_PREFIX}_memory_usage_bytes",
    "Current memory usage of Redis cache"
)

class RedisCache:
    """Redis cache manager implementing distributed caching functionality with HIPAA compliance."""

    def __init__(
        self,
        url: str,
        default_expire_time: int = DEFAULT_EXPIRE_TIME,
        max_retries: int = MAX_RETRIES,
        encryption_config: Optional[Dict] = None
    ) -> None:
        """Initialize Redis cache connection with security and monitoring."""
        self._logger = get_logger(__name__)
        self._default_expire_time = default_expire_time
        self._max_retries = max_retries
        self._metrics = {
            "hits": CACHE_HITS,
            "misses": CACHE_MISSES,
            "errors": CACHE_ERRORS,
            "latency": CACHE_LATENCY,
            "memory": CACHE_MEMORY
        }

        try:
            # Initialize Redis client with connection pooling
            self._client = Redis.from_url(
                url,
                decode_responses=True,
                health_check_interval=30,
                retry_on_timeout=True,
                socket_keepalive=True
            )
            
            # Verify connection
            self._client.ping()
            self._logger.info("Redis cache connection established successfully")
            
        except Exception as e:
            self._logger.error(f"Failed to initialize Redis cache: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def get(self, key: str) -> Optional[Any]:
        """Retrieve and decrypt value from cache."""
        if not key:
            raise ValidationException("Cache key cannot be empty")

        try:
            with CACHE_LATENCY.time():
                # Attempt to get value from Redis
                value = self._client.get(key)

                if value:
                    # Decrypt value if it exists
                    decrypted_value = encrypt_data.decrypt_phi(value.encode())
                    deserialized_value = json.loads(decrypted_value)
                    
                    CACHE_HITS.inc()
                    self._logger.debug(f"Cache hit for key: {key}")
                    return deserialized_value
                
                CACHE_MISSES.inc()
                self._logger.debug(f"Cache miss for key: {key}")
                return None

        except Exception as e:
            CACHE_ERRORS.inc()
            self._logger.error(f"Error retrieving from cache: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def set(
        self,
        key: str,
        value: Any,
        expire_time: Optional[int] = None
    ) -> bool:
        """Encrypt and store value in cache."""
        if not key:
            raise ValidationException("Cache key cannot be empty")

        try:
            with CACHE_LATENCY.time():
                # Serialize and encrypt value
                serialized_value = json.dumps(value)
                encrypted_value = encrypt_data.encrypt_phi(serialized_value)

                # Store in Redis with expiration
                expiry = expire_time or self._default_expire_time
                success = self._client.setex(
                    key,
                    expiry,
                    encrypted_value.decode()
                )

                if success:
                    self._logger.debug(f"Successfully cached value for key: {key}")
                    return True

                CACHE_ERRORS.inc()
                return False

        except Exception as e:
            CACHE_ERRORS.inc()
            self._logger.error(f"Error setting cache value: {str(e)}")
            raise

    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check with metrics."""
        try:
            # Test Redis connection
            self._client.ping()
            
            # Get Redis info
            info = self._client.info()
            
            # Update memory metric
            CACHE_MEMORY.set(info.get("used_memory", 0))
            
            return {
                "status": "healthy",
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_human": info.get("used_memory_human", "0B"),
                "hit_rate": CACHE_HITS._value / (CACHE_HITS._value + CACHE_MISSES._value) if (CACHE_HITS._value + CACHE_MISSES._value) > 0 else 0,
                "error_rate": CACHE_ERRORS._value,
                "uptime_seconds": info.get("uptime_in_seconds", 0)
            }

        except Exception as e:
            self._logger.error(f"Health check failed: {str(e)}")
            return {
                "status": "unhealthy",
                "error": str(e)
            }

@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
def create_redis_cache(
    config: Optional[Dict] = None,
    encryption_config: Optional[Dict] = None
) -> RedisCache:
    """Factory function to create secure RedisCache instance."""
    try:
        settings = Settings()
        redis_url = get_redis_url()
        
        cache = RedisCache(
            url=redis_url,
            default_expire_time=config.get("expire_time", DEFAULT_EXPIRE_TIME) if config else DEFAULT_EXPIRE_TIME,
            max_retries=config.get("max_retries", MAX_RETRIES) if config else MAX_RETRIES,
            encryption_config=encryption_config
        )
        
        return cache

    except Exception as e:
        logger = get_logger(__name__)
        logger.error(f"Failed to create Redis cache instance: {str(e)}")
        raise