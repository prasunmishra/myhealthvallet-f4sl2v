"""
Security middleware implementing comprehensive request/response security controls,
encryption, WAF-like protections, and security headers for the FastAPI application
with HIPAA compliance.

Version: 1.0.0
"""

import logging
from datetime import datetime
from typing import Dict, Optional
import uuid

from fastapi import Request, Response, HTTPException, Depends  # fastapi v0.100+
from fastapi_cache import Cache  # fastapi-cache v0.1.0+

from core.security import SecurityManager
from api.middleware.auth import JWTAuthMiddleware
from core.logging import SecurityLogger

# Configure logging
logger = logging.getLogger(__name__)

# Global security configuration
SECURITY_HEADERS = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
}

# PHI field patterns for encryption
PHI_FIELDS = [
    'medical_record',
    'diagnosis',
    'treatment',
    'medications',
    'lab_results',
    'vital_signs',
    'genetic_data',
    'mental_health'
]

# Rate limiting configuration
RATE_LIMITS = {
    'default': '1000/hour',
    'auth': '100/minute',
    'phi_access': '500/hour'
}

# Request size limits
MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10MB

class SecurityMiddleware:
    """Comprehensive security middleware implementing WAF, encryption, and HIPAA compliance controls."""

    def __init__(
        self,
        security_manager: SecurityManager,
        auth_middleware: JWTAuthMiddleware,
        security_logger: SecurityLogger,
        rate_limit_cache: Cache,
        config: Dict
    ):
        """Initialize security middleware with required components and configurations."""
        self._security_manager = security_manager
        self._auth_middleware = auth_middleware
        self._security_logger = security_logger
        self._rate_limit_cache = rate_limit_cache
        
        # Initialize security configurations
        self._security_headers = SECURITY_HEADERS.copy()
        self._security_headers.update(config.get('additional_headers', {}))
        
        # Configure WAF rules
        self._waf_rules = {
            'sql_injection': r"(?i)(select|insert|update|delete|drop|union|exec|declare).*",
            'xss': r"(?i)(<script|javascript:|vbscript:|expression\(|onload\s*=)",
            'path_traversal': r"\.\.\/|\.\.\\",
            'command_injection': r"(?i)(&|;|\||`|\$\(|\${)",
            'file_inclusion': r"(?i)(include|require|load_file|into\s+outfile)",
        }
        
        # Setup rate limits
        self._rate_limits = RATE_LIMITS.copy()
        self._rate_limits.update(config.get('rate_limits', {}))
        
        logger.info("SecurityMiddleware initialized with HIPAA-compliant configuration")

    async def process_request(self, request: Request) -> Request:
        """Process incoming request with comprehensive security controls."""
        try:
            # Generate correlation ID
            correlation_id = str(uuid.uuid4())
            request.state.correlation_id = correlation_id
            
            # Validate TLS version
            if not self._security_manager.validate_tls(request):
                raise HTTPException(status_code=426, detail="TLS 1.3 required")
            
            # Check request size
            content_length = request.headers.get('content-length', 0)
            if int(content_length) > MAX_REQUEST_SIZE:
                raise HTTPException(status_code=413, detail="Request too large")
            
            # Apply WAF rules
            await self._check_waf_rules(request)
            
            # Verify rate limits
            client_id = request.headers.get('X-Client-ID', request.client.host)
            if not await self._check_rate_limit(client_id, str(request.url.path)):
                raise HTTPException(status_code=429, detail="Rate limit exceeded")
            
            # Authenticate request
            auth_result = await self._auth_middleware.authenticate(request)
            request.state.auth = auth_result
            
            # Log security event
            self._security_logger.log_security_event(
                event_type="request_processed",
                correlation_id=correlation_id,
                client_id=client_id,
                path=str(request.url.path),
                method=request.method
            )
            
            return request
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Request processing error: {str(e)}")
            raise HTTPException(status_code=500, detail="Security check failed")

    async def process_response(self, response: Response) -> Response:
        """Process outgoing response with security headers and encryption."""
        try:
            # Add security headers
            for header, value in self._security_headers.items():
                response.headers[header] = value
            
            # Add correlation ID
            if hasattr(response, 'state') and hasattr(response.state, 'correlation_id'):
                response.headers['X-Correlation-ID'] = response.state.correlation_id
            
            # Encrypt PHI fields in response
            if response.body:
                response.body = await self._encrypt_phi_fields(response.body)
            
            # Add performance headers
            response.headers['X-Response-Time'] = str(datetime.utcnow().timestamp())
            
            # Log response
            self._security_logger.log_security_event(
                event_type="response_processed",
                correlation_id=response.headers.get('X-Correlation-ID'),
                status_code=response.status_code
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Response processing error: {str(e)}")
            raise HTTPException(status_code=500, detail="Response security processing failed")

    async def _encrypt_phi_fields(self, data: Dict) -> Dict:
        """Encrypt PHI fields with field-level encryption."""
        try:
            if not isinstance(data, dict):
                return data
                
            encrypted_data = data.copy()
            for field in PHI_FIELDS:
                if field in encrypted_data and encrypted_data[field]:
                    encrypted_data[field] = self._security_manager.encrypt_phi(
                        str(encrypted_data[field])
                    )
            
            return encrypted_data
            
        except Exception as e:
            logger.error(f"PHI encryption error: {str(e)}")
            raise HTTPException(status_code=500, detail="Encryption failed")

    async def _check_waf_rules(self, request: Request) -> None:
        """Apply WAF rules to request data."""
        try:
            # Check URL parameters
            for param, value in request.query_params.items():
                if self._security_manager.check_waf_rules(str(value), self._waf_rules):
                    raise HTTPException(status_code=403, detail="Invalid request parameters")
            
            # Check headers
            for header, value in request.headers.items():
                if self._security_manager.check_waf_rules(str(value), self._waf_rules):
                    raise HTTPException(status_code=403, detail="Invalid request headers")
            
            # Check body if present
            if request.method in ['POST', 'PUT', 'PATCH']:
                body = await request.body()
                if body and self._security_manager.check_waf_rules(body.decode(), self._waf_rules):
                    raise HTTPException(status_code=403, detail="Invalid request body")
                    
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"WAF check error: {str(e)}")
            raise HTTPException(status_code=500, detail="Security check failed")

    async def _check_rate_limit(self, client_id: str, endpoint: str) -> bool:
        """Verify request against rate limits."""
        try:
            cache_key = f"rate_limit:{client_id}:{endpoint}"
            current_count = await self._rate_limit_cache.get(cache_key) or 0
            
            # Get rate limit for endpoint or use default
            limit = self._rate_limits.get(endpoint, self._rate_limits['default'])
            max_requests, period = limit.split('/')
            max_requests = int(max_requests)
            
            if current_count >= max_requests:
                return False
                
            # Increment counter
            await self._rate_limit_cache.set(
                cache_key,
                current_count + 1,
                ttl=3600 if period == 'hour' else 60
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Rate limit check error: {str(e)}")
            return False

def get_security_middleware(config: Dict) -> SecurityMiddleware:
    """Factory function to create configured security middleware instance."""
    try:
        # Initialize required components
        security_manager = SecurityManager(config)
        auth_middleware = JWTAuthMiddleware()
        security_logger = SecurityLogger()
        rate_limit_cache = Cache()
        
        # Create and return middleware instance
        return SecurityMiddleware(
            security_manager=security_manager,
            auth_middleware=auth_middleware,
            security_logger=security_logger,
            rate_limit_cache=rate_limit_cache,
            config=config
        )
        
    except Exception as e:
        logger.error(f"Security middleware initialization error: {str(e)}")
        raise RuntimeError("Failed to initialize security middleware")