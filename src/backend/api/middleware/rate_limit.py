"""
Rate limiting middleware for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements token bucket algorithm with HIPAA-compliant monitoring and security features.

Version: 1.0.0
"""

import time
from typing import Dict, Optional

from fastapi import FastAPI, Request, Response  # fastapi v0.100+
from prometheus_client import Counter  # prometheus_client v0.16+
from circuitbreaker import circuit_breaker  # circuitbreaker v1.4+

from core.config import Settings, get_redis_url
from services.cache.redis import RedisCache
from core.exceptions import RateLimitError
from core.security import SecurityHeaders
from core.logging import HIPAALogger

# Constants for rate limiting configuration
DEFAULT_RATE_LIMIT = 1000  # requests per hour
DEFAULT_WINDOW_SECONDS = 3600  # 1 hour
RATE_LIMIT_KEY_PREFIX = "rate_limit:"
BYPASS_PATHS = ['/health', '/emergency']
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-XSS-Protection": "1; mode=block",
    "X-Rate-Limit-Limit": str(DEFAULT_RATE_LIMIT),
    "X-Rate-Limit-Window": str(DEFAULT_WINDOW_SECONDS)
}
PROMETHEUS_NAMESPACE = "phrsat_rate_limit"

# Prometheus metrics
rate_limit_counter = Counter(
    f"{PROMETHEUS_NAMESPACE}_exceeded_total",
    "Total number of rate limit exceeded events",
    ["client_id", "path"]
)

class RateLimiter:
    """Enhanced token bucket rate limiting implementation with HIPAA compliance and monitoring."""

    def __init__(
        self,
        rate_limit: int = DEFAULT_RATE_LIMIT,
        window_seconds: int = DEFAULT_WINDOW_SECONDS,
        enable_monitoring: bool = True
    ) -> None:
        """Initialize rate limiter with configuration and monitoring."""
        self._cache = RedisCache(get_redis_url())
        self.rate_limit = rate_limit
        self.window_seconds = window_seconds
        self.rate_limit_counter = rate_limit_counter if enable_monitoring else None
        self.logger = HIPAALogger()
        
        # Initialize security headers
        self.security_headers = SECURITY_HEADERS.copy()
        self.security_headers.update({
            "X-Rate-Limit-Limit": str(self.rate_limit),
            "X-Rate-Limit-Window": str(self.window_seconds)
        })

    @circuit_breaker(failure_threshold=5, recovery_timeout=60)
    async def is_rate_limited(self, client_id: str, request_path: str) -> bool:
        """Check if request should be rate limited with monitoring."""
        if not client_id:
            raise ValueError("Client ID is required")

        # Bypass rate limiting for critical endpoints
        if request_path in BYPASS_PATHS:
            return False

        try:
            # Generate cache key with rotation support
            current_window = int(time.time() / self.window_seconds)
            cache_key = f"{RATE_LIMIT_KEY_PREFIX}{client_id}:{current_window}"

            # Get current request count
            current_count = await self._cache.get(cache_key) or 0

            # Check if rate limit exceeded
            if current_count >= self.rate_limit:
                if self.rate_limit_counter:
                    self.rate_limit_counter.labels(
                        client_id=client_id,
                        path=request_path
                    ).inc()
                
                self.logger.log_rate_limit(
                    client_id=client_id,
                    path=request_path,
                    count=current_count,
                    limit=self.rate_limit
                )
                return True

            # Update request count
            await self._cache.set(
                cache_key,
                current_count + 1,
                expire_time=self.window_seconds
            )
            return False

        except Exception as e:
            self.logger.error(f"Rate limiting error: {str(e)}")
            return False

    async def get_rate_limit_headers(self, client_id: str) -> Dict[str, str]:
        """Generate comprehensive rate limit and security headers."""
        try:
            # Get current request count
            current_window = int(time.time() / self.window_seconds)
            cache_key = f"{RATE_LIMIT_KEY_PREFIX}{client_id}:{current_window}"
            current_count = await self._cache.get(cache_key) or 0

            # Calculate remaining requests and reset time
            remaining = max(0, self.rate_limit - current_count)
            reset_time = (current_window + 1) * self.window_seconds

            # Combine rate limit and security headers
            headers = self.security_headers.copy()
            headers.update({
                "X-Rate-Limit-Remaining": str(remaining),
                "X-Rate-Limit-Reset": str(reset_time)
            })

            return headers

        except Exception as e:
            self.logger.error(f"Error generating rate limit headers: {str(e)}")
            return self.security_headers

@circuit_breaker(failure_threshold=5, recovery_timeout=60)
async def rate_limit_middleware(request: Request, call_next) -> Response:
    """FastAPI middleware for rate limiting with enhanced security and monitoring."""
    # Extract client identifier (e.g., from JWT token or API key)
    client_id = request.headers.get("X-Client-ID") or request.client.host
    
    # Initialize rate limiter
    rate_limiter = RateLimiter()
    
    try:
        # Check rate limit
        if await rate_limiter.is_rate_limited(client_id, request.url.path):
            raise RateLimitError(
                message="Rate limit exceeded",
                error_details={
                    "client_id": client_id,
                    "path": request.url.path,
                    "limit": rate_limiter.rate_limit,
                    "window_seconds": rate_limiter.window_seconds
                }
            )

        # Process request
        response = await call_next(request)

        # Add security and rate limit headers
        headers = await rate_limiter.get_rate_limit_headers(client_id)
        for key, value in headers.items():
            response.headers[key] = value

        return response

    except RateLimitError as e:
        raise e
    except Exception as e:
        rate_limiter.logger.error(f"Middleware error: {str(e)}")
        raise RateLimitError(
            message="Rate limiting error occurred",
            error_details={"error": str(e)}
        )