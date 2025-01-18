"""
Initialization module for PHRSAT API utilities providing centralized access to core utility functions.
Implements secure, HIPAA-compliant utilities for cryptographic operations, datetime handling,
validation, and logging with enhanced type safety and security context validation.

Version: 1.0.0
"""

# Version information
__version__ = "1.0.0"

# Import cryptographic utilities with security context validation
from .crypto import (
    encrypt_field,
    decrypt_field,
    encrypt_document,
    decrypt_document
)

# Import datetime utilities with timezone support
from .datetime import (
    parse_datetime,
    format_datetime,
    validate_datetime_range
)

# Import validation utilities with HIPAA compliance
from .validators import (
    validate_email,
    validate_password,
    validate_health_data
)

# Import logging utilities with performance monitoring
from .logging import (
    APILogger,
    log_request,
    log_error
)

# Export all utility functions and classes
__all__ = [
    # Cryptographic utilities
    'encrypt_field',
    'decrypt_field',
    'encrypt_document',
    'decrypt_document',
    
    # Datetime utilities
    'parse_datetime',
    'format_datetime',
    'validate_datetime_range',
    
    # Validation utilities
    'validate_email',
    'validate_password',
    'validate_health_data',
    
    # Logging utilities
    'APILogger',
    'log_request',
    'log_error',
    
    # Version information
    '__version__'
]

# Initialize logging with security context
logger = APILogger(
    name="api_utils",
    security_config={
        "module": "api_utils",
        "security_level": "high",
        "data_classification": "phi"
    }
)

# Log initialization with security context
logger.log(
    level=20,  # INFO
    msg="API utilities initialized with security controls",
    extra={
        "module_version": __version__,
        "security_enabled": True,
        "hipaa_compliant": True
    }
)