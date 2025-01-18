"""
Validation utility module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides comprehensive validation functions for data validation, security controls,
and PHI protection across backend services.

Version: 1.0.0
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Union, Any

import validators  # python-validators v0.20+
import pytz  # pytz v2023.3+

from core.exceptions import ValidationException
from core.security import SecurityManager
from core.config import settings
from core.logging import get_logger

# Configure logging
logger = get_logger(__name__)

# Regular expression patterns for validation
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
PHONE_REGEX = r'^\+?1?\d{9,15}$'
PASSWORD_REGEX = r'^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$'

# File validation constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_FILE_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/dicom'
]

# PHI validation patterns
PHI_PATTERNS = {
    'ssn': r'^\d{3}-\d{2}-\d{4}$',
    'mrn': r'^[A-Z]{2}\d{6}$',
    'dob': r'^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$',
    'phone': r'^\+?1?\d{9,15}$',
    'email': EMAIL_REGEX
}

# Initialize security manager
security_manager = SecurityManager(settings)

def security_audit_log(func):
    """Decorator for security audit logging of validation operations."""
    def wrapper(*args, **kwargs):
        try:
            result = func(*args, **kwargs)
            logger.info(
                f"Validation successful: {func.__name__}",
                extra={
                    'validation_function': func.__name__,
                    'status': 'success',
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
            )
            return result
        except ValidationException as e:
            logger.warning(
                f"Validation failed: {str(e)}",
                extra={
                    'validation_function': func.__name__,
                    'status': 'failed',
                    'error': str(e),
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
            )
            raise
    return wrapper

@security_audit_log
def validate_health_data(health_data: Dict[str, Any], check_encryption: bool = True) -> Dict[str, Any]:
    """
    Validates and sanitizes health-related data fields with enhanced PHI protection.
    
    Args:
        health_data: Dictionary containing health data fields
        check_encryption: Boolean flag to verify encryption status
        
    Returns:
        Dict: Sanitized and validated health data
        
    Raises:
        ValidationException: If validation fails
    """
    if not isinstance(health_data, dict):
        raise ValidationException("Invalid health data format")

    validated_data = {}
    
    try:
        # Verify encryption if required
        if check_encryption and not security_manager.verify_encryption(health_data):
            raise ValidationException("Health data must be encrypted")

        # Validate required fields
        required_fields = ['patient_id', 'record_type', 'timestamp']
        for field in required_fields:
            if field not in health_data:
                raise ValidationException(f"Missing required field: {field}")

        # Validate and sanitize patient ID
        if not validators.uuid(health_data.get('patient_id')):
            raise ValidationException("Invalid patient ID format")
        validated_data['patient_id'] = str(uuid.UUID(health_data['patient_id']))

        # Validate record type
        valid_record_types = ['vital_signs', 'lab_results', 'medications', 'conditions']
        if health_data['record_type'] not in valid_record_types:
            raise ValidationException("Invalid record type")
        validated_data['record_type'] = health_data['record_type']

        # Validate timestamp
        try:
            timestamp = datetime.fromisoformat(health_data['timestamp'])
            if timestamp > datetime.now(timezone.utc):
                raise ValidationException("Future timestamp not allowed")
            validated_data['timestamp'] = timestamp.isoformat()
        except ValueError:
            raise ValidationException("Invalid timestamp format")

        # Validate PHI fields
        for field, pattern in PHI_PATTERNS.items():
            if field in health_data:
                if not re.match(pattern, str(health_data[field])):
                    raise ValidationException(f"Invalid {field} format")
                validated_data[field] = health_data[field]

        # Validate vital signs if present
        if health_data.get('vital_signs'):
            validated_data['vital_signs'] = _validate_vital_signs(health_data['vital_signs'])

        # Sanitize notes field
        if 'notes' in health_data:
            validated_data['notes'] = _sanitize_text(health_data['notes'])

        return validated_data

    except Exception as e:
        logger.error(f"Health data validation failed: {str(e)}")
        raise ValidationException(f"Health data validation failed: {str(e)}")

@security_audit_log
def validate_file(file_content: bytes, file_type: str, scan_content: bool = True) -> bool:
    """
    Validates file content, size, and type with security scanning.
    
    Args:
        file_content: Binary content of the file
        file_type: MIME type of the file
        scan_content: Boolean flag to enable content scanning
        
    Returns:
        bool: True if file is valid and secure
        
    Raises:
        ValidationException: If validation fails
    """
    try:
        # Validate file size
        if len(file_content) > MAX_FILE_SIZE:
            raise ValidationException(f"File size exceeds maximum limit of {MAX_FILE_SIZE/1024/1024}MB")

        # Validate file type
        if file_type not in ALLOWED_FILE_TYPES:
            raise ValidationException(f"File type {file_type} not allowed")

        # Verify file content matches declared type
        if not _verify_file_content_type(file_content, file_type):
            raise ValidationException("File content does not match declared type")

        # Scan file content if enabled
        if scan_content:
            if not _scan_file_content(file_content):
                raise ValidationException("File content failed security scan")

        # Check for embedded PHI in images
        if file_type.startswith('image/'):
            if _contains_embedded_phi(file_content):
                raise ValidationException("Image contains embedded PHI")

        return True

    except Exception as e:
        logger.error(f"File validation failed: {str(e)}")
        raise ValidationException(f"File validation failed: {str(e)}")

def _validate_vital_signs(vital_signs: Dict[str, Any]) -> Dict[str, Any]:
    """Validates vital signs measurements and units."""
    validated = {}
    
    # Define valid ranges and units
    valid_ranges = {
        'heart_rate': {'min': 30, 'max': 250, 'unit': 'bpm'},
        'blood_pressure_systolic': {'min': 60, 'max': 250, 'unit': 'mmHg'},
        'blood_pressure_diastolic': {'min': 40, 'max': 150, 'unit': 'mmHg'},
        'temperature': {'min': 35, 'max': 43, 'unit': 'C'},
        'respiratory_rate': {'min': 8, 'max': 40, 'unit': 'bpm'},
        'oxygen_saturation': {'min': 50, 'max': 100, 'unit': '%'}
    }

    for measurement, value in vital_signs.items():
        if measurement in valid_ranges:
            try:
                numeric_value = float(value['value'])
                if (numeric_value < valid_ranges[measurement]['min'] or 
                    numeric_value > valid_ranges[measurement]['max']):
                    raise ValidationException(
                        f"Invalid {measurement} value: {numeric_value}"
                    )
                if value.get('unit') != valid_ranges[measurement]['unit']:
                    raise ValidationException(
                        f"Invalid unit for {measurement}: {value.get('unit')}"
                    )
                validated[measurement] = value
            except (ValueError, KeyError):
                raise ValidationException(f"Invalid vital sign format: {measurement}")

    return validated

def _sanitize_text(text: str) -> str:
    """Sanitizes text content to prevent XSS and other injection attacks."""
    # Remove potentially dangerous HTML tags and attributes
    sanitized = re.sub(r'<[^>]*>', '', text)
    
    # Remove potential script injections
    sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r'on\w+\s*=', '', sanitized, flags=re.IGNORECASE)
    
    # Remove excessive whitespace
    sanitized = ' '.join(sanitized.split())
    
    return sanitized

def _verify_file_content_type(content: bytes, declared_type: str) -> bool:
    """Verifies that file content matches declared MIME type."""
    # File signature checks
    signatures = {
        'application/pdf': b'%PDF',
        'image/jpeg': b'\xFF\xD8\xFF',
        'image/png': b'\x89PNG\r\n\x1a\n',
        'application/dicom': b'DICM'
    }
    
    if declared_type in signatures:
        return content.startswith(signatures[declared_type])
    return False

def _scan_file_content(content: bytes) -> bool:
    """Performs security scan of file content."""
    # Check for known malicious patterns
    malicious_patterns = [
        b'<script',
        b'eval(',
        b'function()',
        b'exec(',
        b'system('
    ]
    
    return not any(pattern in content.lower() for pattern in malicious_patterns)

def _contains_embedded_phi(image_content: bytes) -> bool:
    """Checks for potential PHI in image metadata or content."""
    # Basic check for common metadata markers that might contain PHI
    metadata_markers = [
        b'Patient',
        b'Name',
        b'DOB',
        b'SSN',
        b'MRN'
    ]
    
    return any(marker in image_content for marker in metadata_markers)