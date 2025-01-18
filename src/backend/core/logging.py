"""
Core logging module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides structured logging configuration with HIPAA compliance, security audit capabilities,
and centralized logging setup for backend services.

Version: 1.0.0
"""

import logging
import json
import re
import uuid
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any, Dict, List, Optional

from pythonjsonlogger import jsonlogger  # python-json-logger v2.0+
import sentry_sdk  # sentry-sdk v1.30+
from sentry_sdk.integrations.logging import LoggingIntegration

from .config import Settings

# Global logging configuration
DEFAULT_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(correlation_id)s"
DEFAULT_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"

# JSON log field specifications
JSON_LOG_FIELDS = [
    "timestamp", "level", "name", "message", "module", 
    "function", "path", "exception", "correlation_id",
    "user_id", "request_id", "ip_address"
]

# Security audit log fields
SECURITY_LOG_FIELDS = [
    "event_type", "severity", "actor", "action",
    "resource", "outcome", "details"
]

# PII/PHI patterns for redaction
PII_PATTERNS = {
    "ssn": r"\d{3}-\d{2}-\d{4}",
    "email": r"[^@]+@[^@]+\.[^@]+",
    "phone": r"\d{3}[-.]?\d{3}[-.]?\d{4}",
    "mrn": r"MRN-\d+",
    "credit_card": r"\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}"
}

class JsonFormatter(jsonlogger.JsonFormatter):
    """Enhanced JSON formatter with security features and HIPAA compliance."""
    
    def __init__(self, fields: Optional[List[str]] = None, 
                 security_context: Optional[Dict[str, Any]] = None) -> None:
        """Initialize secure JSON formatter with audit capabilities."""
        self.fields = fields or JSON_LOG_FIELDS
        self.security_context = security_context or {}
        super().__init__(
            fmt=DEFAULT_LOG_FORMAT,
            datefmt=DEFAULT_DATE_FORMAT,
            json_indent=None,
            json_default=str
        )

    def add_fields(self, log_record: Dict[str, Any], 
                  record: logging.LogRecord, 
                  message_dict: Dict[str, Any]) -> None:
        """Add fields with security context and audit information."""
        super().add_fields(log_record, record, message_dict)
        
        # Add timestamp in ISO format
        log_record['timestamp'] = self.format_timestamp(record.created)
        
        # Add correlation ID for request tracking
        log_record['correlation_id'] = getattr(record, 'correlation_id', str(uuid.uuid4()))
        
        # Add security context
        log_record.update({
            k: v for k, v in self.security_context.items()
            if k in SECURITY_LOG_FIELDS
        })
        
        # Redact PII/PHI from message and exception
        if 'message' in log_record:
            log_record['message'] = self.redact_pii(str(log_record['message']))
        if 'exception' in log_record:
            log_record['exception'] = self.redact_pii(str(log_record['exception']))

    def format_timestamp(self, time: float) -> str:
        """Format timestamp in ISO 8601 format with microsecond precision."""
        dt = datetime.fromtimestamp(time, tz=timezone.utc)
        return dt.strftime(DEFAULT_DATE_FORMAT)

    def redact_pii(self, message: str) -> str:
        """Redact PII/PHI from log messages."""
        redacted_message = message
        for pattern_name, pattern in PII_PATTERNS.items():
            redacted_message = re.sub(
                pattern,
                f"[REDACTED-{pattern_name}]",
                redacted_message
            )
        return redacted_message

def setup_logging(
    log_level: str = "INFO",
    json_output: bool = True,
    security_context: Optional[Dict[str, Any]] = None
) -> None:
    """Configure global logging with enhanced security features and HIPAA compliance."""
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Configure formatter
    formatter = JsonFormatter(
        fields=JSON_LOG_FIELDS + SECURITY_LOG_FIELDS,
        security_context=security_context
    ) if json_output else logging.Formatter(DEFAULT_LOG_FORMAT)
    
    # Configure console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Configure secure file handler with rotation
    file_handler = RotatingFileHandler(
        filename="logs/phrsat.log",
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=30,  # 30 days retention
        encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    
    # Configure Sentry integration if DSN is provided
    if Settings.SENTRY_DSN:
        sentry_logging = LoggingIntegration(
            level=logging.WARNING,
            event_level=logging.ERROR
        )
        sentry_sdk.init(
            dsn=Settings.SENTRY_DSN,
            environment=Settings.ENV_STATE,
            integrations=[sentry_logging],
            traces_sample_rate=1.0 if Settings.DEBUG else 0.1
        )

def get_logger(
    name: str,
    security_context: Optional[Dict[str, Any]] = None
) -> logging.Logger:
    """Create or retrieve a logger instance with security context and audit capabilities."""
    logger = logging.getLogger(name)
    
    # Set security context for the logger
    if security_context:
        logger = logging.LoggerAdapter(logger, security_context)
    
    # Ensure minimum log level based on environment
    min_level = logging.DEBUG if Settings.DEBUG else logging.INFO
    logger.setLevel(min_level)
    
    return logger

# Export logging components
__all__ = ['setup_logging', 'get_logger', 'JsonFormatter']