"""
API-specific logging utilities for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides structured request/response logging, context tracking, and performance monitoring
with enhanced security, compliance, and audit features.

Version: 1.0.0
"""

import logging
import asyncio
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Awaitable
from datetime import datetime

from fastapi import Request
from starlette.responses import Response

from core.logging import setup_logging, JsonFormatter
from core.telemetry import MetricsManager
from core.security import PIIRedactor

# Initialize context tracking
request_context: ContextVar[Dict[str, Any]] = ContextVar('request_context', default={})

# Configure module logger
logger = logging.getLogger(__name__)
setup_logging(json_output=True)

# Initialize dependencies
metrics = MetricsManager()
pii_redactor = PIIRedactor()

@dataclass
class APILogger:
    """Enhanced API logger with security, compliance, and async support."""
    
    name: str
    _default_fields: Dict[str, Any] = field(default_factory=dict)
    _redactor: PIIRedactor = field(default_factory=PIIRedactor)
    _log_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    
    def __init__(self, name: str, security_config: Optional[Dict[str, Any]] = None):
        """Initialize enhanced API logger with security features."""
        self.name = name
        self._default_fields = {
            'service': 'api',
            'version': '1.0.0',
            'environment': 'production'
        }
        if security_config:
            self._default_fields.update(security_config)
        
        # Configure JSON formatter with security context
        self.formatter = JsonFormatter(security_context=self._default_fields)
        
        # Initialize async queue for non-blocking logging
        self._log_queue = asyncio.Queue()
        
        logger.info(f"APILogger initialized for {name}")

    async def log(self, level: int, msg: str, extra: Optional[Dict[str, Any]] = None) -> None:
        """Enhanced async-aware log method with security features."""
        try:
            # Get current request context
            context = request_context.get()
            
            # Merge context with extra fields
            log_data = {**self._default_fields, **context}
            if extra:
                log_data.update(extra)
            
            # Redact sensitive information
            msg = self._redactor.redact_pii(msg)
            log_data = self._redactor.redact_pii(str(log_data))
            
            # Add compliance metadata
            log_data['timestamp'] = datetime.utcnow().isoformat()
            log_data['correlation_id'] = context.get('correlation_id')
            
            # Queue log message for async processing
            await self._log_queue.put({
                'level': level,
                'msg': msg,
                'extra': log_data
            })
            
            # Process queue if needed
            if self._log_queue.qsize() > 100:
                await self.flush()
                
        except Exception as e:
            logger.error(f"Error in async logging: {str(e)}")

    async def flush(self) -> None:
        """Flush async log queue and ensure delivery."""
        try:
            while not self._log_queue.empty():
                log_item = await self._log_queue.get()
                logger.log(
                    log_item['level'],
                    log_item['msg'],
                    extra=log_item['extra']
                )
                self._log_queue.task_done()
        except Exception as e:
            logger.error(f"Error flushing log queue: {str(e)}")

async def get_request_context() -> Dict[str, Any]:
    """Retrieves the current request context information with async support."""
    try:
        context = request_context.get()
        # Add security and compliance metadata
        context.update({
            'timestamp': datetime.utcnow().isoformat(),
            'security_level': 'protected',
            'compliance_status': 'hipaa_compliant'
        })
        return context
    except Exception as e:
        logger.error(f"Error getting request context: {str(e)}")
        return {}

async def set_request_context(context: Dict[str, Any]) -> None:
    """Sets request context information with enhanced security tracking."""
    try:
        # Validate and sanitize context
        if not isinstance(context, dict):
            raise ValueError("Context must be a dictionary")
            
        # Redact sensitive information
        sanitized_context = pii_redactor.redact_pii(str(context))
        
        # Add security metadata
        sanitized_context.update({
            'security_context': True,
            'audit_timestamp': datetime.utcnow().isoformat()
        })
        
        request_context.set(sanitized_context)
    except Exception as e:
        logger.error(f"Error setting request context: {str(e)}")

async def log_request(request: Request, response: Response, duration: float) -> None:
    """Logs API request details with enhanced security and performance tracking."""
    try:
        context = await get_request_context()
        
        # Extract request details
        request_data = {
            'method': request.method,
            'path': request.url.path,
            'client_ip': request.client.host,
            'user_agent': request.headers.get('user-agent'),
            'duration_ms': round(duration * 1000, 2)
        }
        
        # Add security headers
        security_headers = {
            'correlation_id': request.headers.get('x-correlation-id'),
            'request_id': request.headers.get('x-request-id')
        }
        
        # Redact sensitive data
        request_data = pii_redactor.redact_pii(str(request_data))
        
        # Record metrics
        metrics.record_request(
            endpoint=request.url.path,
            duration=duration,
            status_code=response.status_code
        )
        
        # Log request with security context
        await APILogger('request').log(
            level=logging.INFO,
            msg=f"API Request: {request.method} {request.url.path}",
            extra={
                **request_data,
                **security_headers,
                **context
            }
        )
    except Exception as e:
        logger.error(f"Error logging request: {str(e)}")

async def log_error(error: Exception, message: str, extra_fields: Optional[Dict[str, Any]] = None) -> None:
    """Logs API errors with enhanced security context and compliance."""
    try:
        context = await get_request_context()
        
        # Prepare error data
        error_data = {
            'error_type': type(error).__name__,
            'error_message': str(error),
            'severity': 'error'
        }
        
        if extra_fields:
            error_data.update(extra_fields)
        
        # Add security context
        error_data.update({
            'security_event': True,
            'compliance_impact': 'evaluated'
        })
        
        # Redact sensitive information
        error_data = pii_redactor.redact_pii(str(error_data))
        
        # Log error with security context
        await APILogger('error').log(
            level=logging.ERROR,
            msg=message,
            extra={
                **error_data,
                **context
            }
        )
        
        # Update error metrics
        metrics.error_count.labels(
            type=type(error).__name__,
            severity='error'
        ).inc()
        
    except Exception as e:
        logger.error(f"Error logging error: {str(e)}")

# Export logging utilities
__all__ = [
    'APILogger',
    'get_request_context',
    'set_request_context',
    'log_request',
    'log_error'
]